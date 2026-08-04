import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reads a vendor's own invoice (their bill to us) and pulls out the handful of numbers we need.
// Deliberately does NOT write anything -- it returns a draft the admin confirms in the dialog,
// because the whole point of the bills model is that a human signs off on what we owe.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized: Invalid token');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Vendor pricing is admin-only.
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = (roles || []).some((r: any) => r.role === 'vibe_admin');
    if (!isAdmin) {
      throw new Error('Unauthorized: vendor bills are admin only');
    }

    const { documentPath, filename, textContent } = await req.json();

    let extractedText = '';

    if (textContent) {
      // Spreadsheets are parsed in the browser and arrive here already flattened to text.
      extractedText = String(textContent);
    } else if (documentPath) {
      const { data: fileBlob, error: downloadError } = await supabase
        .storage
        .from('po-documents')
        .download(documentPath);

      if (downloadError || !fileBlob) {
        throw new Error(`Failed to download document: ${downloadError?.message || 'no data'}`);
      }

      const arrayBuffer = await fileBlob.arrayBuffer();
      const pdfParse = (await import('npm:pdf-parse@1.1.1')).default;

      try {
        const pdfData = await pdfParse(new Uint8Array(arrayBuffer));
        extractedText = pdfData.text || '';
      } catch (parseError) {
        console.error('PDF parse error:', parseError);
        throw new Error('Could not read text from that PDF. Enter the bill manually.');
      }
    } else {
      throw new Error('Either documentPath or textContent must be provided');
    }

    if (!extractedText.trim()) {
      throw new Error('That document had no readable text (it may be a scan). Enter the bill manually.');
    }

    console.log(`Parsing vendor bill ${filename || documentPath}, text length ${extractedText.length}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You extract totals from supplier invoices. You are precise with numbers and never guess.'
          },
          {
            role: 'user',
            content: `Extract the billing figures from this supplier invoice.

RULES:
- Numbers must be plain decimals, no currency symbols or thousands separators. 1234.56 not "$1,234.56".
- "total" is the final amount payable -- the grand total / amount due / balance due, AFTER freight
  and any surcharges. This is the single most important field.
- "freight" is shipping/freight/delivery charges only. Use 0 if none is shown.
- "subtotal" is the goods amount before freight. If the invoice only shows a grand total, set
  subtotal to the total minus freight.
- Dates as YYYY-MM-DD. Use null if a date is not shown -- do NOT invent one.
- "invoice_number" is the SUPPLIER'S invoice number, not our PO number.
- If a field genuinely is not on the document, return null rather than guessing.
- "confidence" is your honest read of how clearly the total was stated: "high", "medium" or "low".

INVOICE TEXT:
${extractedText}

Return ONLY valid JSON:
{
  "invoice_number": "...",
  "bill_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "subtotal": 0.0,
  "freight": 0.0,
  "total": 0.0,
  "currency": "USD",
  "confidence": "high",
  "notes": null
}`
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('Failed to read the invoice. Enter the bill manually.');
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices[0].message.content;
    content = content.replace(/^```(?:json)?\s*\n/m, '').replace(/\n```\s*$/m, '');

    const parsed = JSON.parse(content);

    const num = (v: any) => {
      const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    };

    const total = num(parsed.total);
    const freight = num(parsed.freight);
    // Trust the stated grand total; derive the subtotal from it so the parts always add up.
    const subtotal = parsed.subtotal != null && num(parsed.subtotal) > 0
      ? num(parsed.subtotal)
      : Math.round((total - freight) * 100) / 100;

    return new Response(
      JSON.stringify({
        success: true,
        bill: {
          invoice_number: parsed.invoice_number || null,
          bill_date: parsed.bill_date || null,
          due_date: parsed.due_date || null,
          subtotal,
          freight,
          total,
          currency: parsed.currency || 'USD',
          notes: parsed.notes || null,
        },
        confidence: parsed.confidence || 'low',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('parse-vendor-bill error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, parseBillText } from "../_shared/vendorBillParse.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// When a vendor uploads their final invoice in the portal, read it and stage a DRAFT bill.
//
// A draft moves no money: vendor_po_recalc only counts bills with status = 'final', so nothing
// reaches P/L or AP until an admin confirms it. That is deliberate - the figure this produces is
// an LLM's read of a supplier's spreadsheet, and it becomes what we owe.
//
// It also never stacks. A PO whose billed figure was migrated from quantities typed on the PO
// carries a 'reconstructed' bill; the vendor's real invoice is meant to REPLACE that, not add to
// it, so the draft records what it supersedes and confirming it removes the old row.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const asCaller = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await asCaller.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized: Invalid token');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === 'vibe_admin');

    const { updateId, sweep } = await req.json().catch(() => ({}));

    let query = supabase
      .from('vendor_po_production_updates')
      .select('id, vendor_po_id, attachment_url, attachment_name')
      .eq('kind', 'final_invoice')
      .not('attachment_url', 'is', null);

    if (updateId) {
      query = query.eq('id', updateId);
    } else if (!sweep) {
      throw new Error('Pass updateId, or sweep: true to process everything outstanding');
    } else if (!isAdmin) {
      throw new Error('Unauthorized: only an admin can sweep');
    }

    const { data: uploads, error: uploadErr } = await query;
    if (uploadErr) throw uploadErr;
    if (!uploads?.length) {
      return new Response(JSON.stringify({ success: true, drafted: 0, results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // A vendor may only trigger this for their own PO. Admins may do any.
    if (!isAdmin) {
      const poIds = [...new Set(uploads.map((u: any) => u.vendor_po_id))];
      const { data: mine } = await supabase
        .from('vendor_pos')
        .select('id, vendors!inner(user_id)')
        .in('id', poIds);
      const allowed = new Set((mine || [])
        .filter((p: any) => p.vendors?.user_id === user.id)
        .map((p: any) => p.id));
      if (uploads.some((u: any) => !allowed.has(u.vendor_po_id))) {
        throw new Error('Unauthorized: that PO does not belong to you');
      }
    }

    const results: any[] = [];

    for (const upload of uploads) {
      try {
        // Idempotent: one draft per upload, however many times this runs.
        const { data: existing } = await supabase
          .from('vendor_bills')
          .select('id')
          .eq('source_update_id', upload.id)
          .maybeSingle();
        if (existing) {
          results.push({ po_id: upload.vendor_po_id, file: upload.attachment_name, skipped: 'already drafted' });
          continue;
        }

        const { data: fileBlob, error: downloadError } = await supabase
          .storage.from('po-documents').download(upload.attachment_url);
        if (downloadError || !fileBlob) {
          throw new Error(`Could not download: ${downloadError?.message || 'no data'}`);
        }

        const bytes = new Uint8Array(await fileBlob.arrayBuffer());
        const text = await extractText(bytes, upload.attachment_name || upload.attachment_url);
        const { bill, confidence } = await parseBillText(text, lovableApiKey);

        const { data: po } = await supabase
          .from('vendor_pos')
          .select('company_id')
          .eq('id', upload.vendor_po_id)
          .maybeSingle();

        const { data: supersedes } = await supabase
          .from('vendor_bills')
          .select('id')
          .eq('vendor_po_id', upload.vendor_po_id)
          .eq('source', 'reconstructed')
          .eq('status', 'final');

        const note = [
          bill.notes,
          'Read automatically from the invoice the vendor uploaded to the portal. Check it against the document before confirming.',
          supersedes?.length
            ? 'On confirm this REPLACES the bill migrated from quantities recorded on the PO.'
            : null,
        ].filter(Boolean).join(' ');

        const { data: inserted, error: insertErr } = await supabase
          .from('vendor_bills')
          .insert({
            vendor_po_id: upload.vendor_po_id,
            company_id: po?.company_id ?? null,
            invoice_number: bill.invoice_number,
            bill_date: bill.bill_date,
            due_date: bill.due_date,
            subtotal: bill.subtotal,
            freight: bill.freight,
            total: bill.total,
            currency: bill.currency,
            document_path: upload.attachment_url,
            document_name: upload.attachment_name,
            notes: note,
            status: 'draft',
            source: 'parsed',
            parse_confidence: confidence === 'high' ? 1 : confidence === 'medium' ? 0.6 : 0.3,
            source_update_id: upload.id,
          })
          .select('id')
          .single();
        if (insertErr) throw insertErr;

        results.push({
          po_id: upload.vendor_po_id,
          file: upload.attachment_name,
          bill_id: inserted.id,
          total: bill.total,
          invoice_number: bill.invoice_number,
          confidence,
          replaces_reconstructed: (supersedes?.length || 0) > 0,
        });
      } catch (e) {
        console.error('draft-vendor-bill-from-upload failed for', upload.id, e);
        results.push({ po_id: upload.vendor_po_id, file: upload.attachment_name, error: (e as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, drafted: results.filter(r => r.bill_id).length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('draft-vendor-bill-from-upload error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, parseBillText } from "../_shared/vendorBillParse.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reads a vendor's own invoice (their bill to us) and pulls out the handful of numbers we need.
// Deliberately does NOT write anything -- it returns a draft the admin confirms in the dialog,
// because the whole point of the bills model is that a human signs off on what we owe.
//
// The reading itself lives in _shared/vendorBillParse.ts, shared with
// draft-vendor-bill-from-upload. Change it there, never here.
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
      // Spreadsheets flattened in the browser arrive here already as text.
      extractedText = String(textContent);
    } else if (documentPath) {
      const { data: fileBlob, error: downloadError } = await supabase
        .storage
        .from('po-documents')
        .download(documentPath);

      if (downloadError || !fileBlob) {
        throw new Error(`Failed to download document: ${downloadError?.message || 'no data'}`);
      }

      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      try {
        extractedText = await extractText(bytes, filename || documentPath);
      } catch (parseError) {
        console.error('Document parse error:', parseError);
        throw new Error('Could not read text from that document. Enter the bill manually.');
      }
    } else {
      throw new Error('Either documentPath or textContent must be provided');
    }

    console.log(`Parsing vendor bill ${filename || documentPath}, text length ${extractedText.length}`);

    const { bill, confidence } = await parseBillText(extractedText, lovableApiKey);

    return new Response(
      JSON.stringify({ success: true, bill, confidence }),
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

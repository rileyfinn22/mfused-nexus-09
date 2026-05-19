import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authn / admin check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(supabaseUrl!, anonKey!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(supabaseUrl!, supabaseServiceKey!);
    const { data: rolesData } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id);
    const isAdmin = (rolesData || []).some((r: any) => r.role === 'vibe_admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body.action || 'list';

    if (action === 'list') {
      // Load all artwork files + all products, compute orphans server-side
      const [{ data: files }, { data: products }] = await Promise.all([
        admin.from('artwork_files').select('id, filename, sku, company_id, preview_url, artwork_url, created_at, artwork_type').order('created_at', { ascending: false }),
        admin.from('products').select('id, name, item_id, company_id, state, product_type'),
      ]);

      const validSkus = new Set((products || []).map((p: any) => p.item_id).filter(Boolean));
      const orphans = (files || []).filter((f: any) => !f.sku || !validSkus.has(f.sku));

      const { data: companies } = await admin.from('companies').select('id, name');

      return new Response(JSON.stringify({
        orphans,
        products,
        companies,
        totalFiles: files?.length || 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'suggest') {
      const fileIds: string[] = body.fileIds || [];
      if (!fileIds.length) {
        return new Response(JSON.stringify({ suggestions: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: files } = await admin.from('artwork_files').select('id, filename, sku, company_id').in('id', fileIds);
      if (!files?.length) {
        return new Response(JSON.stringify({ suggestions: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Group by company so AI sees only that company's products
      const byCompany: Record<string, any[]> = {};
      for (const f of files) {
        (byCompany[f.company_id] = byCompany[f.company_id] || []).push(f);
      }

      const suggestions: any[] = [];

      for (const [companyId, companyFiles] of Object.entries(byCompany)) {
        const { data: products } = await admin
          .from('products')
          .select('id, name, item_id, state, product_type')
          .eq('company_id', companyId);

        const productList = (products || []).filter((p: any) => p.item_id).map((p: any) => ({
          id: p.id,
          name: p.name,
          sku: p.item_id,
          state: p.state,
          type: p.product_type,
        }));

        if (!productList.length) {
          for (const f of companyFiles) {
            suggestions.push({ fileId: f.id, productId: null, sku: null, confidence: 'none', reason: 'No products for this company' });
          }
          continue;
        }

        const prompt = `Match artwork filenames to the correct product SKU from this catalog.

Products (id, name, sku, state, type):
${JSON.stringify(productList, null, 2)}

Filenames to match:
${companyFiles.map((f: any) => f.filename).join('\n')}

CRITICAL RULES:
1. Product TYPE must match (bag/pouch synonyms ok; bag ≠ sleeve ≠ box ≠ jar ≠ tube ≠ label).
2. Brand/flavor/variant in filename should match product name.
3. State code (AZ/OH/CA/etc) must match product.state when present.
4. Use SKU patterns when filename contains SKU fragments.
5. Be strict — return null/none if unsure. Wrong matches are worse than no match.

Return ONLY JSON: {"matches":[{"filename":"...","productId":"<id-or-null>","confidence":"high|medium|low|none","reason":"..."}]}`;

        const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: prompt }], temperature: 0.1 }),
        });

        if (!aiResp.ok) {
          for (const f of companyFiles) suggestions.push({ fileId: f.id, productId: null, sku: null, confidence: 'none', reason: 'AI error' });
          continue;
        }

        const aiJson = await aiResp.json();
        const content = aiJson.choices?.[0]?.message?.content || '';
        let parsed: any = { matches: [] };
        try {
          const m = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          parsed = JSON.parse(m ? m[1] : content);
        } catch { /* noop */ }

        for (const f of companyFiles) {
          const match = (parsed.matches || []).find((x: any) => x.filename === f.filename);
          const prod = match?.productId ? (products || []).find((p: any) => p.id === match.productId) : null;
          suggestions.push({
            fileId: f.id,
            productId: prod?.id || null,
            sku: prod?.item_id || null,
            productName: prod?.name || null,
            confidence: match?.confidence || 'none',
            reason: match?.reason || 'No match',
          });
        }
      }

      return new Response(JSON.stringify({ suggestions }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'apply') {
      const updates: { fileId: string; sku: string }[] = body.updates || [];
      let count = 0;
      const errors: any[] = [];
      for (const u of updates) {
        if (!u.fileId || !u.sku) continue;
        const { error } = await admin.from('artwork_files').update({ sku: u.sku, updated_at: new Date().toISOString() }).eq('id', u.fileId);
        if (error) errors.push({ fileId: u.fileId, error: error.message });
        else count++;
      }
      return new Response(JSON.stringify({ updated: count, errors }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('reconcile-artwork-skus error', e);
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user's company
    const { data: userRole, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      throw new Error('No company associated with user');
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      throw new Error('No file uploaded');
    }

    // Read file as array buffer for Excel parsing
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Parse Excel file
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet);

    console.log('Parsed Excel data:', jsonData.length, 'rows');

    const inventoryItems = [];

    for (const row of jsonData) {
      // Support multiple column name variations
      const sku = row['SKU'] || row['sku'] || row['Item'];
      const available = parseInt(String(row['Available Primary'] || row['Available'] || row['available'] || '0'));
      const state = row['State'] || row['state'] || 'Primary';
      const inProduction = parseInt(String(row['In Production'] || row['in_production'] || '0'));
      const redline = parseInt(String(row['Redline'] || row['redline'] || '0'));

      if (!sku) {
        console.log('Skipping row without SKU:', row);
        continue;
      }

      // Find or create product by SKU
      let productId = row['product_id'];
      
      if (!productId) {
        // Try to find existing product by name (SKU)
        const { data: existingProduct } = await supabaseClient
          .from('products')
          .select('id')
          .eq('company_id', userRole.company_id)
          .eq('name', sku)
          .maybeSingle();

        if (existingProduct) {
          productId = existingProduct.id;
        } else {
          // Create new product
          const { data: newProduct, error: productError } = await supabaseClient
            .from('products')
            .insert({
              company_id: userRole.company_id,
              name: sku,
              category: 'General',
              state: state
            })
            .select('id')
            .single();

          if (productError) {
            console.error('Error creating product:', productError);
            continue;
          }
          productId = newProduct.id;
        }
      }

      inventoryItems.push({
        company_id: userRole.company_id,
        product_id: productId,
        sku: sku,
        state: state,
        available: available,
        in_production: inProduction,
        redline: redline,
      });
    }

    // Insert inventory items (upsert to handle duplicates)
    const { data: inserted, error: insertError } = await supabaseClient
      .from('inventory')
      .upsert(inventoryItems, {
        onConflict: 'company_id,sku,state',
        ignoreDuplicates: false
      })
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted: inserted?.length || 0,
        message: `Successfully uploaded ${inserted?.length || 0} inventory items`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

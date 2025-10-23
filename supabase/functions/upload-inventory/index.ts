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

    // Generate a unique batch ID for this upload
    const batchId = crypto.randomUUID();
    const uploadTimestamp = new Date().toISOString();

    const inventoryItems = [];

    for (const row of jsonData) {
      // Log the first row to see what columns we have
      if (jsonData.indexOf(row) === 0) {
        console.log('First row columns:', Object.keys(row));
        console.log('First row data:', row);
      }
      
      // Support multiple column name variations
      let sku = row['SKU'] || row['sku'] || row['Item'] || row['Item Name'];
      let itemId = null;
      let state = 'Primary'; // Default state
      
      // Check if "Item #" contains both item ID and state (format: PCK-00430-WA)
      const itemNumberRaw = row['Item #'] || row['Item ID'] || row['Item Id'] || row['item_id'];
      if (itemNumberRaw) {
        const itemNumberStr = String(itemNumberRaw);
        console.log('Processing Item #:', itemNumberStr);
        // Check if it contains a dash (likely has state appended)
        const lastDashIndex = itemNumberStr.lastIndexOf('-');
        if (lastDashIndex > 0 && itemNumberStr.length - lastDashIndex <= 3) {
          // Likely format: PCK-00430-WA (state is 2-3 chars after last dash)
          itemId = itemNumberStr.substring(0, lastDashIndex); // "PCK-00430"
          state = itemNumberStr.substring(lastDashIndex + 1); // "WA"
          console.log('Extracted from Item # - itemId:', itemId, 'state:', state);
        } else {
          // No state in item number, use as-is
          itemId = itemNumberStr;
          console.log('Using Item # as-is:', itemId);
        }
      }
      
      // If "Item and State" column exists, it takes precedence
      if (row['Item and State']) {
        const itemAndState = String(row['Item and State']);
        console.log('Parsing Item and State:', itemAndState);
        // Split by last dash to separate item number from state
        const lastDashIndex = itemAndState.lastIndexOf('-');
        if (lastDashIndex > 0) {
          itemId = itemAndState.substring(0, lastDashIndex); // "PCK-00430"
          state = itemAndState.substring(lastDashIndex + 1); // "WA"
          console.log('Extracted - itemId:', itemId, 'state:', state);
        } else {
          itemId = itemAndState;
        }
      }
      
      // Check for separate State column if state wasn't already extracted
      if (state === 'Primary' && (row['State'] || row['state'])) {
        state = row['State'] || row['state'];
        console.log('Using State column:', state);
      }
      
      // Use Item Name as product name if available
      if (row['Item Name']) {
        sku = String(row['Item Name']);
      }
      
      const available = parseInt(String(row['Available Primary'] || row['Available'] || row['available'] || row['Qty'] || '0'));
      const inProduction = parseInt(String(row['In Production'] || row['in_production'] || '0'));
      const redline = parseInt(String(row['Redline'] || row['redline'] || '0'));

      if (!sku) {
        console.log('Skipping row without SKU:', row);
        continue;
      }

      // Find or create product by item_id (preferred) or SKU/name
      let productId = row['product_id'];
      
      if (!productId) {
        // Try to find existing product by item_id first (most reliable)
        if (itemId) {
          const { data: existingProduct } = await supabaseClient
            .from('products')
            .select('id')
            .eq('company_id', userRole.company_id)
            .eq('item_id', itemId)
            .maybeSingle();

          if (existingProduct) {
            productId = existingProduct.id;
            console.log(`Matched product by item_id "${itemId}": ${existingProduct.id}`);
          }
        }
        
        // Fallback: Try to find by name if item_id didn't match
        if (!productId) {
          const { data: existingProduct } = await supabaseClient
            .from('products')
            .select('id')
            .eq('company_id', userRole.company_id)
            .eq('name', sku)
            .maybeSingle();

          if (existingProduct) {
            productId = existingProduct.id;
            console.log(`Matched product by name "${sku}": ${existingProduct.id}`);
          } else {
            // Create new product with item_id
            const { data: newProduct, error: productError } = await supabaseClient
              .from('products')
              .insert({
                company_id: userRole.company_id,
                name: sku,
                item_id: itemId, // Store the item_id for future matching
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
            console.log(`Created new product with item_id "${itemId}": ${productId}`);
          }
        }
      }

      inventoryItems.push({
        company_id: userRole.company_id,
        product_id: productId,
        sku: sku, // Keep the item name/description as SKU
        state: state,
        available: available,
        in_production: inProduction,
        redline: redline,
        upload_batch_id: batchId,
        upload_timestamp: uploadTimestamp,
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
        batchId: batchId,
        uploadTimestamp: uploadTimestamp,
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

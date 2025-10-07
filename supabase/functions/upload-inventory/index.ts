import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    // Parse CSV - assume first line is header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const data = lines.slice(1);

    const inventoryItems = [];

    for (const line of data) {
      if (!line.trim()) continue;
      
      const values = line.split(',').map(v => v.trim());
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index];
      });

      // Validate required fields
      if (!row.product_id || !row.sku || !row.state) {
        console.log('Skipping invalid row:', row);
        continue;
      }

      inventoryItems.push({
        company_id: userRole.company_id,
        product_id: row.product_id,
        sku: row.sku,
        state: row.state,
        available: parseInt(row.available) || 0,
        in_production: parseInt(row.in_production) || 0,
        redline: parseInt(row.redline) || 0,
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

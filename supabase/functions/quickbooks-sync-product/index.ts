import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(supabase: any, companyId: string, refreshToken: string) {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');

  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await supabase
    .from('quickbooks_settings')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: expiresAt.toISOString(),
    })
    .eq('company_id', companyId);

  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { productId } = await req.json();

    console.log('Syncing product:', productId);

    // Get product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*, companies(id)')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      throw new Error('Product not found');
    }

    // Get QuickBooks settings
    const { data: qbSettings, error: qbError } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('company_id', product.company_id)
      .single();

    if (qbError || !qbSettings || !qbSettings.is_connected) {
      throw new Error('QuickBooks not connected');
    }

    // Check if token needs refresh
    let accessToken = qbSettings.access_token;
    const tokenExpiry = new Date(qbSettings.token_expires_at);
    if (tokenExpiry <= new Date()) {
      console.log('Refreshing access token...');
      accessToken = await refreshAccessToken(supabase, product.company_id, qbSettings.refresh_token);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    // Create or update item in QuickBooks as Non-Inventory
    const itemPayload = {
      Name: product.name,
      Description: product.description || '',
      Type: 'NonInventory',
      IncomeAccountRef: {
        value: '1' // Default income account, user can change in QBO
      },
      ExpenseAccountRef: {
        value: '1' // Default expense account
      },
      UnitPrice: product.price || 0,
    };

    let qbResponse;
    if (product.quickbooks_id) {
      // Update existing item
      console.log('Updating existing QuickBooks item:', product.quickbooks_id);
      
      // First get the current sync token
      const getResponse = await fetch(`${qbApiUrl}/item/${product.quickbooks_id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      const currentItem = await getResponse.json();

      qbResponse = await fetch(`${qbApiUrl}/item?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...itemPayload,
          Id: product.quickbooks_id,
          SyncToken: currentItem.Item.SyncToken,
        }),
      });
    } else {
      // Create new item
      console.log('Creating new QuickBooks item');
      qbResponse = await fetch(`${qbApiUrl}/item?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(itemPayload),
      });
    }

    const qbData = await qbResponse.json();

    if (!qbResponse.ok) {
      console.error('QuickBooks API error:', qbData);
      throw new Error(qbData.Fault?.Error?.[0]?.Message || 'QuickBooks API error');
    }

    const qbItemId = qbData.Item.Id;
    console.log('QuickBooks item ID:', qbItemId);

    // Update product with QuickBooks ID
    await supabase
      .from('products')
      .update({
        quickbooks_id: qbItemId,
        quickbooks_synced_at: new Date().toISOString(),
        quickbooks_sync_status: 'synced',
      })
      .eq('id', productId);

    console.log('Product synced successfully');

    return new Response(
      JSON.stringify({ success: true, quickbooks_id: qbItemId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Sync error:', error);
    
    // Update sync status to failed
    const { productId } = await req.json().catch(() => ({}));
    if (productId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase
        .from('products')
        .update({ quickbooks_sync_status: 'failed' })
        .eq('id', productId);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
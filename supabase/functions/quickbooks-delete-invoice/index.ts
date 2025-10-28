import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Refresh QuickBooks access token
async function refreshAccessToken(supabase: any, companyId: string, refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
  
  const authHeader = btoa(`${clientId}:${clientSecret}`);
  
  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authHeader}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error('Token refresh failed:', data);
    throw new Error('Failed to refresh access token');
  }

  // Store new tokens
  await supabase
    .from('quickbooks_settings')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    })
    .eq('company_id', companyId);

  return data.access_token;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { invoiceId } = await req.json();

    if (!invoiceId) {
      throw new Error('Invoice ID is required');
    }

    console.log('Deleting invoice from QuickBooks:', invoiceId);

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('company_id, quickbooks_id')
      .eq('id', invoiceId)
      .single();
    
    if (invoiceError || !invoice) {
      throw new Error('Invoice not found');
    }

    // If no QuickBooks ID, nothing to delete
    if (!invoice.quickbooks_id) {
      console.log('Invoice not synced to QuickBooks, skipping deletion');
      return new Response(
        JSON.stringify({ success: true, message: 'Invoice not synced to QuickBooks' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get VibePKG's company_id
    const { data: vibeAdmin } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('role', 'vibe_admin')
      .limit(1)
      .single();

    if (!vibeAdmin) {
      throw new Error('VibePKG admin not found');
    }

    // Get QuickBooks settings for VibePKG
    const { data: qbSettings, error: qbError } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('company_id', vibeAdmin.company_id)
      .eq('is_connected', true)
      .single();

    if (qbError || !qbSettings) {
      throw new Error('QuickBooks not connected');
    }

    let accessToken = qbSettings.access_token;
    let refreshToken = qbSettings.refresh_token;

    // Try to get decrypted tokens if secret IDs exist
    if (qbSettings.access_token_secret_id) {
      const { data: decryptedAccess } = await supabase
        .rpc('get_qb_token_decrypted', {
          p_company_id: vibeAdmin.company_id,
          p_token_type: 'access'
        });
      accessToken = decryptedAccess || accessToken;
    }
    
    if (qbSettings.refresh_token_secret_id) {
      const { data: decryptedRefresh } = await supabase
        .rpc('get_qb_token_decrypted', {
          p_company_id: vibeAdmin.company_id,
          p_token_type: 'refresh'
        });
      refreshToken = decryptedRefresh || refreshToken;
    }

    // Check if token needs refresh
    const tokenExpiry = new Date(qbSettings.token_expires_at);
    if (tokenExpiry <= new Date()) {
      console.log('Refreshing access token...');
      accessToken = await refreshAccessToken(supabase, vibeAdmin.company_id, refreshToken);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    // First, get the current invoice to get the SyncToken
    const getResponse = await fetch(`${qbApiUrl}/invoice/${invoice.quickbooks_id}?minorversion=65`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!getResponse.ok) {
      const errorData = await getResponse.json();
      console.error('Failed to fetch invoice for deletion:', errorData);
      throw new Error('Failed to fetch invoice from QuickBooks');
    }

    const currentInvoice = await getResponse.json();
    const syncToken = currentInvoice.Invoice.SyncToken;

    // Delete the invoice (QuickBooks uses a POST with operation=delete)
    const deleteResponse = await fetch(
      `${qbApiUrl}/invoice?operation=delete&minorversion=65`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Id: invoice.quickbooks_id,
          SyncToken: syncToken,
        }),
      }
    );

    const deleteData = await deleteResponse.json();

    if (!deleteResponse.ok) {
      console.error('QuickBooks delete error:', deleteData);
      throw new Error(deleteData.Fault?.Error?.[0]?.Message || 'QuickBooks deletion failed');
    }

    console.log('Invoice deleted from QuickBooks successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Invoice deleted from QuickBooks' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in quickbooks-delete-invoice:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

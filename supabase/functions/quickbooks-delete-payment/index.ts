import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(supabase: any, companyId: string, refreshToken: string) {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
  
  const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
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

  if (!tokenResponse.ok) {
    throw new Error(`Failed to refresh token: ${await tokenResponse.text()}`);
  }

  const tokens = await tokenResponse.json();
  await supabase.from('quickbooks_settings').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    refresh_token_expires_at: new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('company_id', companyId);

  return tokens.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { quickbooksPaymentId } = await req.json();
    if (!quickbooksPaymentId) {
      return new Response(JSON.stringify({ error: 'quickbooksPaymentId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Deleting QBO payment:', quickbooksPaymentId);

    // Get VibePKG company
    const { data: vibeAdmin } = await supabase
      .from('user_roles').select('company_id').eq('role', 'vibe_admin').limit(1).single();
    if (!vibeAdmin) throw new Error('VibePKG company not found');

    const { data: qbSettings } = await supabase
      .from('quickbooks_settings').select('*').eq('company_id', vibeAdmin.company_id).single();
    if (!qbSettings?.is_connected) throw new Error('QuickBooks not connected');

    let accessToken = qbSettings.access_token;
    if (new Date(qbSettings.token_expires_at) <= new Date()) {
      accessToken = await refreshAccessToken(supabase, vibeAdmin.company_id, qbSettings.refresh_token);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    // First read the payment to get SyncToken
    const readResp = await fetch(`${qbApiUrl}/payment/${quickbooksPaymentId}?minorversion=65`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    });

    if (!readResp.ok) {
      const errText = await readResp.text();
      console.error('Failed to read QBO payment:', errText);
      return new Response(JSON.stringify({ error: 'Failed to read QBO payment', details: errText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const paymentObj = (await readResp.json()).Payment;
    console.log('Read QBO payment, SyncToken:', paymentObj.SyncToken);

    // Delete (void) the payment
    const deleteResp = await fetch(`${qbApiUrl}/payment?operation=delete&minorversion=65`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Id: quickbooksPaymentId, SyncToken: paymentObj.SyncToken }),
    });

    if (!deleteResp.ok) {
      const errText = await deleteResp.text();
      console.error('Failed to delete QBO payment:', errText);
      return new Response(JSON.stringify({ error: 'Failed to delete QBO payment', details: errText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('QBO payment deleted successfully');
    return new Response(JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

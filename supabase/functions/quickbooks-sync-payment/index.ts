import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to refresh QuickBooks access token
async function refreshAccessToken(supabase: any, companyId: string, refreshToken: string) {
  console.log('Refreshing QuickBooks access token...');
  
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
    const errorText = await tokenResponse.text();
    console.error('Token refresh failed:', errorText);
    throw new Error(`Failed to refresh access token: ${errorText}`);
  }

  const tokens = await tokenResponse.json();
  console.log('Successfully refreshed access token');

  // Update tokens in database
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
  const refreshExpiresAt = new Date(Date.now() + (tokens.x_refresh_token_expires_in * 1000)).toISOString();

  const { error: updateError } = await supabase
    .from('quickbooks_settings')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId);

  if (updateError) {
    console.error('Error updating tokens:', updateError);
    throw updateError;
  }

  return tokens.access_token;
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

    const { paymentId } = await req.json();
    console.log('Syncing payment to QuickBooks:', paymentId);

    // Get payment details with invoice and company info
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select(`
        *,
        invoices (
          id,
          invoice_number,
          quickbooks_id,
          company_id,
          companies (
            id,
            name
          )
        )
      `)
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      console.error('Payment not found:', paymentError);
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Payment found:', payment);

    // Check if invoice is synced to QuickBooks
    if (!payment.invoices.quickbooks_id) {
      console.error('Invoice not synced to QuickBooks');
      return new Response(
        JSON.stringify({ error: 'Invoice must be synced to QuickBooks first' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get VibePKG's company_id (the vibe_admin's company that manages QuickBooks)
    const { data: vibeAdmin, error: vibeAdminError } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('role', 'vibe_admin')
      .limit(1)
      .single();

    if (vibeAdminError || !vibeAdmin) {
      console.error('VibePKG company not found:', vibeAdminError);
      return new Response(
        JSON.stringify({ error: 'VibePKG company not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vibeCompanyId = vibeAdmin.company_id;

    // Get QuickBooks settings from VibePKG (not the customer's company)
    const { data: qbSettings, error: qbError } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('company_id', vibeCompanyId)
      .single();

    if (qbError || !qbSettings || !qbSettings.is_connected) {
      console.error('QuickBooks settings not found:', qbError);
      return new Response(
        JSON.stringify({ error: 'QuickBooks not connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('QuickBooks settings found');

    // Check if access token is expired and refresh if needed
    let accessToken = qbSettings.access_token;
    const tokenExpiresAt = new Date(qbSettings.token_expires_at);
    const now = new Date();

    if (tokenExpiresAt <= now) {
      console.log('Access token expired, refreshing...');
      accessToken = await refreshAccessToken(supabase, vibeCompanyId, qbSettings.refresh_token);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    // Fetch the invoice from QuickBooks to get the actual CustomerRef
    console.log('Fetching invoice from QuickBooks:', payment.invoices.quickbooks_id);
    const invoiceResponse = await fetch(
      `${qbApiUrl}/invoice/${payment.invoices.quickbooks_id}?minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!invoiceResponse.ok) {
      const errorText = await invoiceResponse.text();
      console.error('Failed to fetch invoice from QuickBooks:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch invoice from QuickBooks', details: errorText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const invoiceData = await invoiceResponse.json();
    const qbCustomerId = invoiceData.Invoice?.CustomerRef?.value;

    if (!qbCustomerId) {
      console.error('No CustomerRef found in QuickBooks invoice');
      return new Response(
        JSON.stringify({ error: 'Invoice in QuickBooks has no customer reference' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found QuickBooks customer ID from invoice:', qbCustomerId);

    // Create payment in QuickBooks
    const paymentData = {
      TotalAmt: parseFloat(payment.amount),
      CustomerRef: {
        value: qbCustomerId,
      },
      Line: [{
        Amount: parseFloat(payment.amount),
        LinkedTxn: [{
          TxnId: payment.invoices.quickbooks_id,
          TxnType: "Invoice"
        }]
      }],
      TxnDate: payment.payment_date.split('T')[0],
      PaymentMethodRef: payment.payment_method === 'check' ? { value: "1" } : { value: "2" },
      PrivateNote: payment.notes || '',
      PaymentRefNum: payment.reference_number || '',
    };

    console.log('Creating payment in QuickBooks:', JSON.stringify(paymentData, null, 2));

    const qbResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}/payment?minorversion=65`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      }
    );

    if (!qbResponse.ok) {
      const errorText = await qbResponse.text();
      console.error('QuickBooks API error:', errorText);
      
      // Update payment sync status to error
      await supabase
        .from('payments')
        .update({
          quickbooks_sync_status: 'error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);

      // Update QuickBooks settings with error
      await supabase
        .from('quickbooks_settings')
        .update({
          last_error: errorText,
          last_error_at: new Date().toISOString(),
        })
        .eq('company_id', vibeCompanyId);

      return new Response(
        JSON.stringify({ error: 'Failed to create payment in QuickBooks', details: errorText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const qbPayment = await qbResponse.json();
    console.log('QuickBooks payment created:', qbPayment);

    // Update payment record with QuickBooks ID and sync status
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        quickbooks_id: qbPayment.Payment.Id,
        quickbooks_sync_status: 'synced',
        quickbooks_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    if (updateError) {
      console.error('Error updating payment:', updateError);
      throw updateError;
    }

    // Clear any previous errors in QuickBooks settings
    await supabase
      .from('quickbooks_settings')
      .update({
        last_error: null,
        last_error_at: null,
      })
      .eq('company_id', vibeCompanyId);

    console.log('Payment successfully synced to QuickBooks');

    return new Response(
      JSON.stringify({ success: true, quickbooks_id: qbPayment.Payment.Id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in quickbooks-sync-payment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

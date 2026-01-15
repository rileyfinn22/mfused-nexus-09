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

    const { invoiceId } = await req.json();
    console.log('Pulling payments from QuickBooks for invoice:', invoiceId);

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

    // Get QuickBooks settings from VibePKG
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

    // Check if access token is expired and refresh if needed
    let accessToken = qbSettings.access_token;
    const tokenExpiresAt = new Date(qbSettings.token_expires_at);
    const now = new Date();

    if (tokenExpiresAt <= now) {
      console.log('Access token expired, refreshing...');
      accessToken = await refreshAccessToken(supabase, vibeCompanyId, qbSettings.refresh_token);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    // If a specific invoice is provided, just check that one
    if (invoiceId) {
      // Get invoice details
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, invoice_number, quickbooks_id, company_id, total, total_paid, status')
        .eq('id', invoiceId)
        .single();

      if (invoiceError || !invoice) {
        console.error('Invoice not found:', invoiceError);
        return new Response(
          JSON.stringify({ error: 'Invoice not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!invoice.quickbooks_id) {
        return new Response(
          JSON.stringify({ error: 'Invoice not synced to QuickBooks' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Query QuickBooks for payments linked to this invoice
      const query = `SELECT * FROM Payment WHERE Line.LinkedTxn.TxnType = 'Invoice' AND Line.LinkedTxn.TxnId = '${invoice.quickbooks_id}'`;
      console.log('Querying QBO for payments:', query);

      const paymentsResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(query)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!paymentsResponse.ok) {
        const errorText = await paymentsResponse.text();
        console.error('QuickBooks API error:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to query QuickBooks', details: errorText }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const paymentsData = await paymentsResponse.json();
      const qbPayments = paymentsData.QueryResponse?.Payment || [];
      console.log(`Found ${qbPayments.length} payments in QBO for invoice ${invoice.invoice_number}`);

      // Get existing payments for this invoice
      const { data: existingPayments } = await supabase
        .from('payments')
        .select('id, quickbooks_id, amount')
        .eq('invoice_id', invoiceId);

      const existingQBIds = new Set((existingPayments || []).map(p => p.quickbooks_id).filter(Boolean));
      let newPaymentsCount = 0;
      let totalNewAmount = 0;

      for (const qbPayment of qbPayments) {
        // Skip if we already have this payment
        if (existingQBIds.has(qbPayment.Id)) {
          console.log(`Payment ${qbPayment.Id} already exists, skipping`);
          continue;
        }

        // Find the line item for this specific invoice
        const invoiceLine = qbPayment.Line?.find((line: any) => 
          line.LinkedTxn?.some((txn: any) => txn.TxnType === 'Invoice' && txn.TxnId === invoice.quickbooks_id)
        );

        if (!invoiceLine) {
          console.log(`No matching line found in payment ${qbPayment.Id}`);
          continue;
        }

        const paymentAmount = invoiceLine.Amount || qbPayment.TotalAmt;

        // Insert the payment
        const { error: insertError } = await supabase
          .from('payments')
          .insert({
            company_id: invoice.company_id,
            invoice_id: invoice.id,
            amount: paymentAmount,
            payment_date: qbPayment.TxnDate,
            payment_method: qbPayment.PaymentMethodRef?.name || 'Other',
            reference_number: qbPayment.PaymentRefNum || null,
            notes: `Imported from QuickBooks`,
            quickbooks_id: qbPayment.Id,
            quickbooks_sync_status: 'synced',
            quickbooks_synced_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error('Error inserting payment:', insertError);
        } else {
          newPaymentsCount++;
          totalNewAmount += paymentAmount;
          console.log(`Imported payment ${qbPayment.Id} for $${paymentAmount}`);
        }
      }

      // Update invoice total_paid and status if new payments were added
      if (newPaymentsCount > 0) {
        const newTotalPaid = (invoice.total_paid || 0) + totalNewAmount;
        const newStatus = newTotalPaid >= invoice.total ? 'paid' : 
                          newTotalPaid > 0 ? 'partial' : invoice.status;

        await supabase
          .from('invoices')
          .update({
            total_paid: newTotalPaid,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', invoiceId);

        console.log(`Updated invoice: total_paid=${newTotalPaid}, status=${newStatus}`);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          newPaymentsCount,
          totalNewAmount,
          message: newPaymentsCount > 0 
            ? `Imported ${newPaymentsCount} payment(s) totaling $${totalNewAmount.toFixed(2)}`
            : 'No new payments found'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no specific invoice, pull all recent payments
    console.log('Fetching all recent payments from QuickBooks...');
    const query = 'SELECT * FROM Payment ORDERBY TxnDate DESC MAXRESULTS 100';
    
    const paymentsResponse = await fetch(
      `${qbApiUrl}/query?query=${encodeURIComponent(query)}&minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!paymentsResponse.ok) {
      const errorText = await paymentsResponse.text();
      console.error('QuickBooks API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to query QuickBooks', details: errorText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paymentsData = await paymentsResponse.json();
    const qbPayments = paymentsData.QueryResponse?.Payment || [];
    console.log(`Found ${qbPayments.length} recent payments in QBO`);

    // Get all existing payments with QBO IDs
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('quickbooks_id');
    
    const existingQBIds = new Set((existingPayments || []).map(p => p.quickbooks_id).filter(Boolean));

    let newPaymentsCount = 0;
    const updatedInvoices = new Set<string>();

    for (const qbPayment of qbPayments) {
      // Skip if we already have this payment
      if (existingQBIds.has(qbPayment.Id)) continue;

      // Process each line item that links to an invoice
      for (const line of qbPayment.Line || []) {
        const linkedInvoice = line.LinkedTxn?.find((txn: any) => txn.TxnType === 'Invoice');
        if (!linkedInvoice) continue;

        // Find the invoice in our database
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id, company_id, total, total_paid, status')
          .eq('quickbooks_id', linkedInvoice.TxnId)
          .maybeSingle();

        if (!invoice) continue;

        const paymentAmount = line.Amount || qbPayment.TotalAmt;

        // Insert the payment
        const { error: insertError } = await supabase
          .from('payments')
          .insert({
            company_id: invoice.company_id,
            invoice_id: invoice.id,
            amount: paymentAmount,
            payment_date: qbPayment.TxnDate,
            payment_method: qbPayment.PaymentMethodRef?.name || 'Other',
            reference_number: qbPayment.PaymentRefNum || null,
            notes: `Imported from QuickBooks`,
            quickbooks_id: qbPayment.Id,
            quickbooks_sync_status: 'synced',
            quickbooks_synced_at: new Date().toISOString(),
          });

        if (!insertError) {
          newPaymentsCount++;
          updatedInvoices.add(invoice.id);
          existingQBIds.add(qbPayment.Id);

          // Update invoice
          const newTotalPaid = (invoice.total_paid || 0) + paymentAmount;
          const newStatus = newTotalPaid >= invoice.total ? 'paid' : 
                            newTotalPaid > 0 ? 'partial' : invoice.status;

          await supabase
            .from('invoices')
            .update({
              total_paid: newTotalPaid,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', invoice.id);
        }

        break; // Only process first matching invoice per payment
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        newPaymentsCount,
        invoicesUpdated: updatedInvoices.size,
        message: `Imported ${newPaymentsCount} payment(s) across ${updatedInvoices.size} invoice(s)`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in quickbooks-pull-payments:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

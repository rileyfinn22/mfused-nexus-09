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

// Records a QBO payment against an invoice without ever creating an echo copy.
//
// Order of operations matters:
//  1. If a row already carries this QBO id for this invoice, refresh its amount
//     (QBO is the accounting source of truth) and stop.
//  2. If the portal pushed this payment to QBO but never got the id written back
//     (failed/timed-out sync), adopt that existing unsynced row instead of
//     inserting a second one. Matched on invoice + amount + a +/-7 day window.
//  3. Only if neither exists is a brand new row inserted.
async function recordQboPayment(
  supabase: any,
  args: {
    companyId: string;
    invoiceId: string;
    qbPaymentId: string;
    amount: number;
    txnDate: string;
    method: string;
    refNum: string | null;
  }
): Promise<'updated' | 'adopted' | 'inserted' | 'error'> {
  const { companyId, invoiceId, qbPaymentId, amount, txnDate, method, refNum } = args;

  // 1. Already imported for this invoice -> reconcile the amount only.
  const { data: sameQbId } = await supabase
    .from('payments')
    .select('id, amount')
    .eq('invoice_id', invoiceId)
    .eq('quickbooks_id', qbPaymentId)
    .maybeSingle();

  if (sameQbId) {
    if (Number(sameQbId.amount) !== Number(amount)) {
      await supabase
        .from('payments')
        .update({ amount, quickbooks_synced_at: new Date().toISOString() })
        .eq('id', sameQbId.id);
      console.log(`Reconciled payment ${qbPaymentId} amount to ${amount}`);
      return 'updated';
    }
    return 'updated';
  }

  // 2. Portal-originated payment that never got its QBO id back.
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  const txn = new Date(txnDate).getTime();
  const from = new Date(txn - windowMs).toISOString();
  const to = new Date(txn + windowMs).toISOString();

  const { data: orphans } = await supabase
    .from('payments')
    .select('id, amount, payment_date')
    .eq('invoice_id', invoiceId)
    .is('quickbooks_id', null)
    .gte('payment_date', from)
    .lte('payment_date', to);

  const orphan = (orphans || []).find(
    (p: any) => Math.abs(Number(p.amount) - Number(amount)) < 0.01
  );

  if (orphan) {
    const { error: adoptError } = await supabase
      .from('payments')
      .update({
        quickbooks_id: qbPaymentId,
        quickbooks_sync_status: 'synced',
        quickbooks_synced_at: new Date().toISOString(),
      })
      .eq('id', orphan.id);

    if (adoptError) {
      console.error('Error adopting local payment:', adoptError);
      return 'error';
    }
    console.log(`Linked existing portal payment ${orphan.id} to QBO payment ${qbPaymentId}`);
    return 'adopted';
  }

  // 3. Genuinely new payment from QBO.
  const { error: insertError } = await supabase
    .from('payments')
    .upsert(
      {
        company_id: companyId,
        invoice_id: invoiceId,
        amount,
        payment_date: txnDate,
        payment_method: method,
        reference_number: refNum,
        notes: 'Imported from QuickBooks',
        quickbooks_id: qbPaymentId,
        quickbooks_sync_status: 'synced',
        quickbooks_synced_at: new Date().toISOString(),
      },
      { onConflict: 'quickbooks_id,invoice_id', ignoreDuplicates: true }
    );

  if (insertError) {
    console.error('Error inserting payment:', insertError);
    return 'error';
  }
  return 'inserted';
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

      let newPaymentsCount = 0;
      let totalNewAmount = 0;

      for (const qbPayment of qbPayments) {
        // Find the line item for this specific invoice
        const invoiceLine = qbPayment.Line?.find((line: any) => 
          line.LinkedTxn?.some((txn: any) => txn.TxnType === 'Invoice' && txn.TxnId === invoice.quickbooks_id)
        );

        if (!invoiceLine) {
          console.log(`No matching line found in payment ${qbPayment.Id}`);
          continue;
        }

        const paymentAmount = invoiceLine.Amount || qbPayment.TotalAmt;

        const result = await recordQboPayment(supabase, {
          companyId: invoice.company_id,
          invoiceId: invoice.id,
          qbPaymentId: qbPayment.Id,
          amount: paymentAmount,
          txnDate: qbPayment.TxnDate,
          method: qbPayment.PaymentMethodRef?.name || 'Other',
          refNum: qbPayment.PaymentRefNum || null,
        });

        if (result === 'inserted') {
          newPaymentsCount++;
          totalNewAmount += paymentAmount;
          console.log(`Imported payment ${qbPayment.Id} for $${paymentAmount}`);
        }
      }

      // total_paid / status are recomputed by the payments trigger from the
      // authoritative sum of payment rows — never accumulate it manually here.


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

        // Insert the payment (idempotent: unique on quickbooks_id + invoice_id)
        const { error: insertError } = await supabase
          .from('payments')
          .upsert({
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
          }, { onConflict: 'quickbooks_id,invoice_id', ignoreDuplicates: true });

        if (!insertError) {
          newPaymentsCount++;
          updatedInvoices.add(invoice.id);
          existingQBIds.add(qbPayment.Id);
          // total_paid / status are recomputed by the payments trigger.
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

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(supabase: any, companyId: string, refreshToken: string) {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');

  console.log('Attempting token refresh for company:', companyId);

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
  
  if (!response.ok) {
    console.error('Token refresh failed:', data);
    throw new Error(data.error_description || data.error || 'Failed to refresh access token');
  }
  
  const expiresAt = new Date(Date.now() + (data.expires_in * 1000));
  const refreshTokenExpiresAt = new Date(Date.now() + (data.x_refresh_token_expires_in || 8726400) * 1000);

  await supabase
    .from('quickbooks_settings')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: expiresAt.toISOString(),
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
      last_error: null,
      last_error_at: null,
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

    // Get auth header for user verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is vibe_admin
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is vibe_admin
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'vibe_admin'
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Only Vibe admins can sync projects from QuickBooks' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get VibePKG's QuickBooks settings
    const { data: vibeAdmin } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('role', 'vibe_admin')
      .limit(1)
      .single();

    if (!vibeAdmin) {
      throw new Error('VibePKG company not found');
    }

    const { data: qbSettings } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('company_id', vibeAdmin.company_id)
      .single();

    if (!qbSettings?.is_connected) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'QuickBooks not connected',
          synced: { invoices: 0, bills: 0, payments: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let accessToken = qbSettings.access_token;
    const refreshToken = qbSettings.refresh_token;

    // Check if token needs refresh
    const tokenExpiry = qbSettings.token_expires_at ? new Date(qbSettings.token_expires_at) : new Date(0);
    if (tokenExpiry <= new Date()) {
      console.log('Refreshing access token...');
      accessToken = await refreshAccessToken(supabase, vibeAdmin.company_id, refreshToken);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    // Get all orders that have qb_project_id set (linked to QBO)
    const { data: linkedOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, qb_project_id, company_id')
      .not('qb_project_id', 'is', null)
      .is('deleted_at', null);

    if (ordersError) {
      throw ordersError;
    }

    console.log(`Found ${linkedOrders?.length || 0} orders linked to QuickBooks`);

    // Also get companies that have quickbooks_id (customers in QBO)
    const { data: linkedCompanies } = await supabase
      .from('companies')
      .select('id, name, quickbooks_id')
      .not('quickbooks_id', 'is', null);

    console.log(`Found ${linkedCompanies?.length || 0} companies linked to QuickBooks`);

    let syncedInvoices = 0;
    let syncedBills = 0;
    let syncedPayments = 0;
    const syncErrors: string[] = [];

    // For each linked company, fetch their QBO invoices and payments
    for (const company of linkedCompanies || []) {
      try {
        console.log(`Syncing invoices for company: ${company.name} (QB ID: ${company.quickbooks_id})`);

        // Get invoices from QBO for this customer
        const invoicesQuery = `SELECT * FROM Invoice WHERE CustomerRef='${company.quickbooks_id}' MAXRESULTS 100`;
        const invoicesResponse = await fetch(
          `${qbApiUrl}/query?query=${encodeURIComponent(invoicesQuery)}&minorversion=65`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          }
        );

        if (!invoicesResponse.ok) {
          const errorData = await invoicesResponse.json();
          console.error(`Error fetching invoices for ${company.name}:`, errorData);
          syncErrors.push(`Failed to fetch invoices for ${company.name}`);
          continue;
        }

        const invoicesData = await invoicesResponse.json();
        const qbInvoices = invoicesData.QueryResponse?.Invoice || [];
        console.log(`Found ${qbInvoices.length} invoices in QBO for ${company.name}`);

        // Get orders for this company to link invoices
        const { data: companyOrders } = await supabase
          .from('orders')
          .select('id, order_number, qb_estimate_id')
          .eq('company_id', company.id)
          .is('deleted_at', null);

        // For each QBO invoice, check if we need to create/update it
        for (const qbInvoice of qbInvoices) {
          // Check if invoice already exists
          const { data: existingInvoice } = await supabase
            .from('invoices')
            .select('id, quickbooks_id')
            .eq('quickbooks_id', qbInvoice.Id)
            .single();

          if (existingInvoice) {
            // Update existing invoice sync status
            await supabase
              .from('invoices')
              .update({
                quickbooks_sync_status: 'synced',
                quickbooks_synced_at: new Date().toISOString(),
                total: qbInvoice.TotalAmt,
                total_paid: qbInvoice.TotalAmt - (qbInvoice.Balance || 0),
                status: qbInvoice.Balance === 0 ? 'paid' : qbInvoice.Balance < qbInvoice.TotalAmt ? 'partial' : 'open',
              })
              .eq('id', existingInvoice.id);
            syncedInvoices++;
          } else {
            // Try to find a matching order to link to
            // First try by estimate reference, then by order number in memo
            let matchingOrder = null;
            
            // Check if invoice references an estimate
            if (qbInvoice.LinkedTxn?.some((t: any) => t.TxnType === 'Estimate')) {
              const estimateId = qbInvoice.LinkedTxn.find((t: any) => t.TxnType === 'Estimate')?.TxnId;
              matchingOrder = companyOrders?.find(o => o.qb_estimate_id === estimateId);
            }

            // If we found a matching order, create the invoice
            if (matchingOrder) {
              const { error: insertError } = await supabase
                .from('invoices')
                .insert({
                  company_id: company.id,
                  order_id: matchingOrder.id,
                  invoice_number: qbInvoice.DocNumber || `QB-${qbInvoice.Id}`,
                  invoice_date: qbInvoice.TxnDate,
                  due_date: qbInvoice.DueDate,
                  subtotal: qbInvoice.TotalAmt,
                  tax: 0,
                  total: qbInvoice.TotalAmt,
                  total_paid: qbInvoice.TotalAmt - (qbInvoice.Balance || 0),
                  status: qbInvoice.Balance === 0 ? 'paid' : qbInvoice.Balance < qbInvoice.TotalAmt ? 'partial' : 'open',
                  quickbooks_id: qbInvoice.Id,
                  quickbooks_sync_status: 'synced',
                  quickbooks_synced_at: new Date().toISOString(),
                });

              if (!insertError) {
                syncedInvoices++;
                console.log(`Created invoice ${qbInvoice.DocNumber} from QBO`);
              }
            }
          }
        }

        // Sync payments
        const paymentsQuery = `SELECT * FROM Payment WHERE CustomerRef='${company.quickbooks_id}' MAXRESULTS 100`;
        const paymentsResponse = await fetch(
          `${qbApiUrl}/query?query=${encodeURIComponent(paymentsQuery)}&minorversion=65`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          }
        );

        if (paymentsResponse.ok) {
          const paymentsData = await paymentsResponse.json();
          const qbPayments = paymentsData.QueryResponse?.Payment || [];
          console.log(`Found ${qbPayments.length} payments in QBO for ${company.name}`);

          for (const qbPayment of qbPayments) {
            // Check if payment already exists
            const { data: existingPayment } = await supabase
              .from('payments')
              .select('id')
              .eq('quickbooks_id', qbPayment.Id)
              .single();

            if (!existingPayment && qbPayment.Line?.length > 0) {
              // Find the invoice this payment is for
              for (const line of qbPayment.Line) {
                if (line.LinkedTxn?.some((t: any) => t.TxnType === 'Invoice')) {
                  const invoiceId = line.LinkedTxn.find((t: any) => t.TxnType === 'Invoice')?.TxnId;
                  
                  // Find our invoice with this QB ID
                  const { data: invoice } = await supabase
                    .from('invoices')
                    .select('id')
                    .eq('quickbooks_id', invoiceId)
                    .single();

                  if (invoice) {
                    const { error: insertError } = await supabase
                      .from('payments')
                      .insert({
                        company_id: company.id,
                        invoice_id: invoice.id,
                        amount: line.Amount || qbPayment.TotalAmt,
                        payment_date: qbPayment.TxnDate,
                        payment_method: qbPayment.PaymentMethodRef?.name || 'Other',
                        reference_number: qbPayment.PaymentRefNum,
                        quickbooks_id: qbPayment.Id,
                        quickbooks_sync_status: 'synced',
                        quickbooks_synced_at: new Date().toISOString(),
                      });

                    if (!insertError) {
                      syncedPayments++;
                      console.log(`Created payment from QBO`);
                    }
                  }
                }
              }
            }
          }
        }

      } catch (companyError: any) {
        console.error(`Error syncing company ${company.name}:`, companyError);
        syncErrors.push(`Error syncing ${company.name}: ${companyError.message}`);
      }
    }

    // Sync bills (vendor POs) from QBO
    try {
      console.log('Syncing bills from QuickBooks...');
      
      const billsQuery = `SELECT * FROM Bill MAXRESULTS 200`;
      const billsResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(billsQuery)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (billsResponse.ok) {
        const billsData = await billsResponse.json();
        const qbBills = billsData.QueryResponse?.Bill || [];
        console.log(`Found ${qbBills.length} bills in QBO`);

        for (const qbBill of qbBills) {
          // Check if vendor PO already exists with this QB ID
          const { data: existingPO } = await supabase
            .from('vendor_pos')
            .select('id')
            .eq('quickbooks_id', qbBill.Id)
            .single();

          if (existingPO) {
            // Update sync status
            await supabase
              .from('vendor_pos')
              .update({
                quickbooks_sync_status: 'synced',
                quickbooks_synced_at: new Date().toISOString(),
                total: qbBill.TotalAmt,
              })
              .eq('id', existingPO.id);
            syncedBills++;
          }
          // Note: We don't create new vendor POs from QBO bills automatically
          // as that requires manual mapping to orders and vendors
        }
      }
    } catch (billsError: any) {
      console.error('Error syncing bills:', billsError);
      syncErrors.push(`Error syncing bills: ${billsError.message}`);
    }

    // Update last sync timestamp
    await supabase
      .from('quickbooks_settings')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', vibeAdmin.company_id);

    console.log(`Sync complete: ${syncedInvoices} invoices, ${syncedBills} bills, ${syncedPayments} payments`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: {
          invoices: syncedInvoices,
          bills: syncedBills,
          payments: syncedPayments,
        },
        errors: syncErrors.length > 0 ? syncErrors : undefined,
        linkedCompanies: linkedCompanies?.length || 0,
        linkedOrders: linkedOrders?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in quickbooks-sync-projects:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        synced: { invoices: 0, bills: 0, payments: 0 }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

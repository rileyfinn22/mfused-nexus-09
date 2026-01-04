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

async function qbQuery(qbApiUrl: string, accessToken: string, query: string) {
  const response = await fetch(
    `${qbApiUrl}/query?query=${encodeURIComponent(query)}&minorversion=65`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );
  if (!response.ok) {
    const err = await response.json();
    console.error('QB Query error:', query, err);
    throw new Error(err?.Fault?.Error?.[0]?.Message || 'QB query failed');
  }
  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Support both authenticated calls and cron (no auth header)
    const authHeader = req.headers.get('Authorization');
    let isAuthorized = false;

    if (authHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: isAdmin } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'vibe_admin'
        });
        isAuthorized = !!isAdmin;
      }
    } else {
      // Allow unauthenticated calls (for cron) - function is protected by verify_jwt=false in config
      isAuthorized = true;
    }

    if (!isAuthorized) {
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

    const vibePkgCompanyId = vibeAdmin.company_id;

    const { data: qbSettings } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('company_id', vibePkgCompanyId)
      .single();

    if (!qbSettings?.is_connected) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'QuickBooks not connected',
          synced: { projects: 0, invoices: 0, estimates: 0, purchaseOrders: 0, bills: 0, payments: 0 }
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
      accessToken = await refreshAccessToken(supabase, vibePkgCompanyId, refreshToken);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    // ========== STEP 1: Pull ALL customers (including sub-customers = projects) ==========
    console.log('Fetching all customers from QuickBooks...');
    const customersData = await qbQuery(qbApiUrl, accessToken, 'SELECT * FROM Customer MAXRESULTS 1000');
    const qbCustomers = customersData.QueryResponse?.Customer || [];
    console.log(`Found ${qbCustomers.length} customers in QBO`);

    // Separate parent customers from sub-customers (projects)
    const parentCustomers = qbCustomers.filter((c: any) => !c.ParentRef);
    const subCustomers = qbCustomers.filter((c: any) => c.ParentRef); // These are "Projects" in QBO

    console.log(`Parent customers: ${parentCustomers.length}, Sub-customers (Projects): ${subCustomers.length}`);

    // Build lookup maps
    const customerById = new Map<string, any>();
    for (const c of qbCustomers) {
      customerById.set(c.Id, c);
    }

    // ========== STEP 2: Ensure all parent customers exist as Companies ==========
    const { data: existingCompanies } = await supabase
      .from('companies')
      .select('id, name, quickbooks_id');

    const companyByQBId = new Map<string, string>();
    const companyByName = new Map<string, string>();
    for (const c of existingCompanies || []) {
      if (c.quickbooks_id) companyByQBId.set(c.quickbooks_id, c.id);
      companyByName.set(c.name.toLowerCase().trim(), c.id);
    }

    let createdCompanies = 0;
    for (const parent of parentCustomers) {
      if (companyByQBId.has(parent.Id)) continue;

      // Check by name as fallback
      const nameKey = (parent.DisplayName || parent.CompanyName || '').toLowerCase().trim();
      if (companyByName.has(nameKey)) {
        // Link existing company to QB
        const existingId = companyByName.get(nameKey)!;
        await supabase.from('companies').update({ quickbooks_id: parent.Id }).eq('id', existingId);
        companyByQBId.set(parent.Id, existingId);
        continue;
      }

      // Create new company
      const { data: newCompany, error } = await supabase
        .from('companies')
        .insert({
          name: parent.DisplayName || parent.CompanyName || `QB Customer ${parent.Id}`,
          quickbooks_id: parent.Id,
          email: parent.PrimaryEmailAddr?.Address,
          phone: parent.PrimaryPhone?.FreeFormNumber,
          billing_street: parent.BillAddr?.Line1,
          billing_city: parent.BillAddr?.City,
          billing_state: parent.BillAddr?.CountrySubDivisionCode,
          billing_zip: parent.BillAddr?.PostalCode,
          shipping_street: parent.ShipAddr?.Line1,
          shipping_city: parent.ShipAddr?.City,
          shipping_state: parent.ShipAddr?.CountrySubDivisionCode,
          shipping_zip: parent.ShipAddr?.PostalCode,
        })
        .select()
        .single();

      if (!error && newCompany) {
        companyByQBId.set(parent.Id, newCompany.id);
        companyByName.set((newCompany.name || '').toLowerCase().trim(), newCompany.id);
        createdCompanies++;
        console.log(`Created company: ${newCompany.name}`);
      }
    }

    // ========== STEP 3: Create Orders for each sub-customer (Project) ==========
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('id, qb_project_id, order_number')
      .not('qb_project_id', 'is', null);

    const orderByQBProjectId = new Map<string, string>();
    for (const o of existingOrders || []) {
      if (o.qb_project_id) orderByQBProjectId.set(o.qb_project_id, o.id);
    }

    // Get next order number
    const { data: lastOrder } = await supabase
      .from('orders')
      .select('order_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let orderCounter = 1;
    if (lastOrder?.order_number) {
      const match = lastOrder.order_number.match(/\d+/);
      if (match) orderCounter = parseInt(match[0], 10) + 1;
    }

    let createdProjects = 0;
    for (const project of subCustomers) {
      if (orderByQBProjectId.has(project.Id)) continue;

      // Find parent company
      const parentQBId = project.ParentRef?.value;
      let companyId = parentQBId ? companyByQBId.get(parentQBId) : null;

      // If parent not found, use VibePKG as fallback
      if (!companyId) {
        companyId = vibePkgCompanyId;
      }

      const orderNumber = `ORD-${String(orderCounter++).padStart(5, '0')}`;

      const { data: newOrder, error } = await supabase
        .from('orders')
        .insert({
          company_id: companyId,
          order_number: orderNumber,
          customer_name: project.DisplayName || project.FullyQualifiedName || 'QB Project',
          qb_project_id: project.Id,
          status: 'pending',
          order_type: 'standard',
          order_date: new Date().toISOString().split('T')[0],
          shipping_name: project.DisplayName || 'TBD',
          shipping_street: project.ShipAddr?.Line1 || 'TBD',
          shipping_city: project.ShipAddr?.City || 'TBD',
          shipping_state: project.ShipAddr?.CountrySubDivisionCode || 'CA',
          shipping_zip: project.ShipAddr?.PostalCode || '00000',
          subtotal: 0,
          tax: 0,
          total: 0,
          description: `Imported from QuickBooks: ${project.FullyQualifiedName || project.DisplayName}`,
        })
        .select()
        .single();

      if (!error && newOrder) {
        orderByQBProjectId.set(project.Id, newOrder.id);
        createdProjects++;
        console.log(`Created project/order: ${orderNumber} for ${project.DisplayName}`);
      }
    }

    // ========== STEP 4: Pull Estimates ==========
    console.log('Fetching estimates from QuickBooks...');
    const estimatesData = await qbQuery(qbApiUrl, accessToken, 'SELECT * FROM Estimate MAXRESULTS 500');
    const qbEstimates = estimatesData.QueryResponse?.Estimate || [];
    console.log(`Found ${qbEstimates.length} estimates in QBO`);

    const { data: existingQuotes } = await supabase.from('quotes').select('id, quote_number');
    const quoteByNumber = new Map<string, string>();
    for (const q of existingQuotes || []) {
      quoteByNumber.set(q.quote_number, q.id);
    }

    let syncedEstimates = 0;
    for (const est of qbEstimates) {
      const quoteNumber = `QBO-${est.DocNumber || est.Id}`;
      if (quoteByNumber.has(quoteNumber)) continue;

      // Find company by customer
      const custId = est.CustomerRef?.value;
      const cust = custId ? customerById.get(custId) : null;
      const parentId = cust?.ParentRef?.value || custId;
      const companyId = parentId ? companyByQBId.get(parentId) : vibePkgCompanyId;

      const { data: newQuote, error } = await supabase
        .from('quotes')
        .insert({
          company_id: companyId || vibePkgCompanyId,
          quote_number: quoteNumber,
          customer_name: est.CustomerRef?.name || 'Unknown',
          description: est.CustomerMemo?.value || `QB Estimate #${est.DocNumber || est.Id}`,
          status: est.TxnStatus === 'Accepted' ? 'accepted' : 
                  est.TxnStatus === 'Closed' ? 'accepted' : 
                  est.TxnStatus === 'Rejected' ? 'rejected' : 'sent',
          subtotal: est.TotalAmt || 0,
          shipping_cost: 0,
          tax: 0,
          total: est.TotalAmt || 0,
          valid_until: est.ExpirationDate,
        })
        .select()
        .single();

      if (!error && newQuote) {
        // Create quote items
        const lines = est.Line?.filter((l: any) => l.DetailType === 'SalesItemLineDetail') || [];
        for (const line of lines) {
          await supabase.from('quote_items').insert({
            quote_id: newQuote.id,
            name: line.SalesItemLineDetail?.ItemRef?.name || line.Description || 'Item',
            sku: line.SalesItemLineDetail?.ItemRef?.name || 'QB-ITEM',
            description: line.Description,
            quantity: line.SalesItemLineDetail?.Qty || 1,
            unit_price: line.SalesItemLineDetail?.UnitPrice || 0,
            total: line.Amount || 0,
          });
        }
        syncedEstimates++;
      }
    }

    // ========== STEP 5: Pull Invoices ==========
    console.log('Fetching invoices from QuickBooks...');
    const invoicesData = await qbQuery(qbApiUrl, accessToken, 'SELECT * FROM Invoice MAXRESULTS 500');
    const qbInvoices = invoicesData.QueryResponse?.Invoice || [];
    console.log(`Found ${qbInvoices.length} invoices in QBO`);

    const { data: existingInvoices } = await supabase.from('invoices').select('id, quickbooks_id');
    const invoiceByQBId = new Map<string, string>();
    for (const inv of existingInvoices || []) {
      if (inv.quickbooks_id) invoiceByQBId.set(inv.quickbooks_id, inv.id);
    }

    let syncedInvoices = 0;
    for (const inv of qbInvoices) {
      if (invoiceByQBId.has(inv.Id)) {
        // Update existing
        await supabase.from('invoices').update({
          total: inv.TotalAmt,
          total_paid: inv.TotalAmt - (inv.Balance || 0),
          status: inv.Balance === 0 ? 'paid' : inv.Balance < inv.TotalAmt ? 'partial' : 'open',
          quickbooks_sync_status: 'synced',
          quickbooks_synced_at: new Date().toISOString(),
        }).eq('quickbooks_id', inv.Id);
        syncedInvoices++;
        continue;
      }

      // Find order by project (customer could be a sub-customer)
      const custId = inv.CustomerRef?.value;
      const orderId = custId ? orderByQBProjectId.get(custId) : null;

      if (!orderId) continue; // No matching project/order

      // Get company from order
      const { data: order } = await supabase.from('orders').select('company_id').eq('id', orderId).single();

      const { error } = await supabase.from('invoices').insert({
        company_id: order?.company_id || vibePkgCompanyId,
        order_id: orderId,
        invoice_number: inv.DocNumber || `QB-${inv.Id}`,
        invoice_date: inv.TxnDate,
        due_date: inv.DueDate,
        subtotal: inv.TotalAmt,
        tax: 0,
        total: inv.TotalAmt,
        total_paid: inv.TotalAmt - (inv.Balance || 0),
        status: inv.Balance === 0 ? 'paid' : inv.Balance < inv.TotalAmt ? 'partial' : 'open',
        quickbooks_id: inv.Id,
        quickbooks_sync_status: 'synced',
        quickbooks_synced_at: new Date().toISOString(),
      });

      if (!error) {
        invoiceByQBId.set(inv.Id, 'new');
        syncedInvoices++;
      }
    }

    // ========== STEP 6: Pull Payments ==========
    console.log('Fetching payments from QuickBooks...');
    const paymentsData = await qbQuery(qbApiUrl, accessToken, 'SELECT * FROM Payment MAXRESULTS 500');
    const qbPayments = paymentsData.QueryResponse?.Payment || [];
    console.log(`Found ${qbPayments.length} payments in QBO`);

    const { data: existingPayments } = await supabase.from('payments').select('id, quickbooks_id');
    const paymentByQBId = new Set<string>();
    for (const p of existingPayments || []) {
      if (p.quickbooks_id) paymentByQBId.add(p.quickbooks_id);
    }

    let syncedPayments = 0;
    for (const pmt of qbPayments) {
      if (paymentByQBId.has(pmt.Id)) continue;

      // Find linked invoices
      for (const line of pmt.Line || []) {
        const linkedInv = line.LinkedTxn?.find((t: any) => t.TxnType === 'Invoice');
        if (!linkedInv) continue;

        const { data: invoice } = await supabase
          .from('invoices')
          .select('id, company_id')
          .eq('quickbooks_id', linkedInv.TxnId)
          .maybeSingle();

        if (invoice) {
          await supabase.from('payments').insert({
            company_id: invoice.company_id,
            invoice_id: invoice.id,
            amount: line.Amount || pmt.TotalAmt,
            payment_date: pmt.TxnDate,
            payment_method: pmt.PaymentMethodRef?.name || 'Other',
            reference_number: pmt.PaymentRefNum,
            quickbooks_id: pmt.Id,
            quickbooks_sync_status: 'synced',
            quickbooks_synced_at: new Date().toISOString(),
          });
          syncedPayments++;
          paymentByQBId.add(pmt.Id);
          break;
        }
      }
    }

    // ========== STEP 7: Pull Purchase Orders ==========
    console.log('Fetching purchase orders from QuickBooks...');
    const posData = await qbQuery(qbApiUrl, accessToken, 'SELECT * FROM PurchaseOrder MAXRESULTS 500');
    const qbPOs = posData.QueryResponse?.PurchaseOrder || [];
    console.log(`Found ${qbPOs.length} purchase orders in QBO`);

    const { data: existingVendorPOs } = await supabase.from('vendor_pos').select('id, quickbooks_id');
    const vendorPOByQBId = new Map<string, string>();
    for (const vp of existingVendorPOs || []) {
      if (vp.quickbooks_id) vendorPOByQBId.set(vp.quickbooks_id, vp.id);
    }

    const { data: vendors } = await supabase.from('vendors').select('id, name, company_id');
    const vendorByName = new Map<string, { id: string; company_id: string }>();
    for (const v of vendors || []) {
      vendorByName.set((v.name || '').toLowerCase().trim(), { id: v.id, company_id: v.company_id });
    }

    let syncedPurchaseOrders = 0;
    for (const po of qbPOs) {
      if (vendorPOByQBId.has(po.Id)) {
        await supabase.from('vendor_pos').update({
          total: po.TotalAmt,
          status: po.POStatus === 'Closed' ? 'completed' : 'pending',
          quickbooks_sync_status: 'synced',
          quickbooks_synced_at: new Date().toISOString(),
        }).eq('quickbooks_id', po.Id);
        syncedPurchaseOrders++;
        continue;
      }

      const vendorName = (po.VendorRef?.name || '').toLowerCase().trim();
      const vendor = vendorByName.get(vendorName);
      if (!vendor) {
        console.log(`No matching vendor for PO: ${po.VendorRef?.name}`);
        continue;
      }

      const poNumber = `QBO-PO-${po.DocNumber || po.Id}`;
      const { data: newPO, error } = await supabase.from('vendor_pos').insert({
        company_id: vendor.company_id,
        vendor_id: vendor.id,
        po_number: poNumber,
        po_type: 'expense',
        status: po.POStatus === 'Closed' ? 'completed' : 'pending',
        order_date: po.TxnDate,
        expected_delivery_date: po.DueDate || po.ShipDate,
        total: po.TotalAmt || 0,
        description: po.Memo || `QB PO #${po.DocNumber || po.Id}`,
        quickbooks_id: po.Id,
        quickbooks_sync_status: 'synced',
        quickbooks_synced_at: new Date().toISOString(),
      }).select().single();

      if (!error && newPO) {
        const lines = po.Line?.filter((l: any) => l.DetailType === 'ItemBasedExpenseLineDetail') || [];
        for (const line of lines) {
          await supabase.from('vendor_po_items').insert({
            vendor_po_id: newPO.id,
            name: line.ItemBasedExpenseLineDetail?.ItemRef?.name || line.Description || 'Item',
            sku: line.ItemBasedExpenseLineDetail?.ItemRef?.name || 'QB-ITEM',
            description: line.Description,
            quantity: line.ItemBasedExpenseLineDetail?.Qty || 1,
            unit_cost: line.ItemBasedExpenseLineDetail?.UnitPrice || 0,
            total: line.Amount || 0,
            shipped_quantity: 0,
          });
        }
        vendorPOByQBId.set(po.Id, newPO.id);
        syncedPurchaseOrders++;
        console.log(`Created vendor PO: ${poNumber}`);
      }
    }

    // ========== STEP 8: Pull Bills ==========
    console.log('Fetching bills from QuickBooks...');
    const billsData = await qbQuery(qbApiUrl, accessToken, 'SELECT * FROM Bill MAXRESULTS 500');
    const qbBills = billsData.QueryResponse?.Bill || [];
    console.log(`Found ${qbBills.length} bills in QBO`);

    let syncedBills = 0;
    for (const bill of qbBills) {
      if (vendorPOByQBId.has(bill.Id)) {
        await supabase.from('vendor_pos').update({
          total: bill.TotalAmt,
          quickbooks_sync_status: 'synced',
          quickbooks_synced_at: new Date().toISOString(),
        }).eq('quickbooks_id', bill.Id);
        syncedBills++;
        continue;
      }

      const vendorName = (bill.VendorRef?.name || '').toLowerCase().trim();
      const vendor = vendorByName.get(vendorName);
      if (!vendor) continue;

      const poNumber = `QBO-BILL-${bill.DocNumber || bill.Id}`;
      const { error } = await supabase.from('vendor_pos').insert({
        company_id: vendor.company_id,
        vendor_id: vendor.id,
        po_number: poNumber,
        po_type: 'expense',
        status: 'completed',
        order_date: bill.TxnDate,
        total: bill.TotalAmt || 0,
        description: bill.Memo || `QB Bill #${bill.DocNumber || bill.Id}`,
        quickbooks_id: bill.Id,
        quickbooks_sync_status: 'synced',
        quickbooks_synced_at: new Date().toISOString(),
      });

      if (!error) {
        vendorPOByQBId.set(bill.Id, 'new');
        syncedBills++;
      }
    }

    // Update last sync timestamp
    await supabase.from('quickbooks_settings').update({
      updated_at: new Date().toISOString(),
    }).eq('company_id', vibePkgCompanyId);

    console.log(`Sync complete: ${createdCompanies} companies, ${createdProjects} projects, ${syncedEstimates} estimates, ${syncedInvoices} invoices, ${syncedPayments} payments, ${syncedPurchaseOrders} POs, ${syncedBills} bills`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: {
          companies: createdCompanies,
          projects: createdProjects,
          estimates: syncedEstimates,
          invoices: syncedInvoices,
          payments: syncedPayments,
          purchaseOrders: syncedPurchaseOrders,
          bills: syncedBills,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in quickbooks-sync-projects:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        synced: { companies: 0, projects: 0, estimates: 0, invoices: 0, payments: 0, purchaseOrders: 0, bills: 0 }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

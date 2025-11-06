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

  // Store new tokens encrypted in vault
  const { data: accessSecretId } = await supabase
    .rpc('store_qb_token_encrypted', {
      p_company_id: companyId,
      p_token_type: 'access',
      p_token_value: data.access_token
    });

  const { data: refreshSecretId } = await supabase
    .rpc('store_qb_token_encrypted', {
      p_company_id: companyId,
      p_token_type: 'refresh',
      p_token_value: data.refresh_token
    });

  await supabase
    .from('quickbooks_settings')
    .update({
      access_token: data.access_token, // Keep temporarily for backwards compatibility
      refresh_token: data.refresh_token, // Keep temporarily for backwards compatibility
      access_token_secret_id: accessSecretId,
      refresh_token_secret_id: refreshSecretId,
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

    const { invoiceId } = await req.json();

    console.log('Syncing invoice:', invoiceId);

    // Get invoice with items and allocations
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        orders(*, order_items(*))
      `)
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      throw new Error('Invoice not found');
    }

    // Get inventory allocations for this invoice to determine actual shipped quantities
    const { data: allocations } = await supabase
      .from('inventory_allocations')
      .select(`
        *,
        order_items(*)
      `)
      .eq('invoice_id', invoiceId)
      .eq('status', 'allocated');

    console.log('Invoice total from DB:', invoice.total);
    console.log('Invoice type:', invoice.invoice_type);
    console.log('Inventory allocations found:', allocations?.length || 0);

    // Get VibePKG's company_id (the vibe_admin's company that manages QuickBooks)
    const { data: vibeAdmin, error: vibeAdminError } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('role', 'vibe_admin')
      .limit(1)
      .single();

    if (vibeAdminError || !vibeAdmin) {
      throw new Error('VibePKG company not found');
    }

    // Get QuickBooks settings from VibePKG (not the customer's company)
    const { data: qbSettings, error: qbError } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('company_id', vibeAdmin.company_id)
      .single();

    if (qbError || !qbSettings || !qbSettings.is_connected) {
      throw new Error('QuickBooks not connected');
    }

    // Decrypt tokens from vault (fallback to plain text for backwards compatibility)
    let accessToken = qbSettings.access_token;
    let refreshToken = qbSettings.refresh_token;
    
    if (qbSettings.access_token_secret_id) {
      const { data: decryptedAccess } = await supabase
        .rpc('get_qb_token_decrypted', {
          p_company_id: invoice.company_id,
          p_token_type: 'access'
        });
      accessToken = decryptedAccess || accessToken;
    }
    
    if (qbSettings.refresh_token_secret_id) {
      const { data: decryptedRefresh } = await supabase
        .rpc('get_qb_token_decrypted', {
          p_company_id: invoice.company_id,
          p_token_type: 'refresh'
        });
      refreshToken = decryptedRefresh || refreshToken;
    }

    // Check if token needs refresh
    const tokenExpiry = new Date(qbSettings.token_expires_at);
    if (tokenExpiry <= new Date()) {
      console.log('Refreshing access token...');
      accessToken = await refreshAccessToken(supabase, invoice.company_id, refreshToken);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    // Find or create customer in QuickBooks
    const customerName = invoice.orders?.customer_name || 'Unknown Customer';
    const customerSearchResponse = await fetch(
      `${qbApiUrl}/query?query=SELECT * FROM Customer WHERE DisplayName='${encodeURIComponent(customerName)}' MAXRESULTS 1&minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );
    const customerSearchData = await customerSearchResponse.json();
    
    if (!customerSearchResponse.ok) {
      console.error('Failed to search for customer:', customerSearchData);
      throw new Error(customerSearchData.Fault?.Error?.[0]?.Message || 'Failed to search for customer in QuickBooks');
    }
    
    let customerId;
    if (customerSearchData.QueryResponse?.Customer?.length > 0) {
      customerId = customerSearchData.QueryResponse.Customer[0].Id;
    } else {
      // Create new customer
      const customerPayload = {
        DisplayName: customerName,
        PrimaryEmailAddr: { Address: invoice.orders?.customer_email || '' },
        PrimaryPhone: { FreeFormNumber: invoice.orders?.customer_phone || '' },
        BillAddr: {
          Line1: invoice.orders?.billing_street || invoice.orders?.shipping_street || '',
          City: invoice.orders?.billing_city || invoice.orders?.shipping_city || '',
          CountrySubDivisionCode: invoice.orders?.billing_state || invoice.orders?.shipping_state || '',
          PostalCode: invoice.orders?.billing_zip || invoice.orders?.shipping_zip || '',
        },
      };

      const createCustomerResponse = await fetch(`${qbApiUrl}/customer?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customerPayload),
      });

      const newCustomer = await createCustomerResponse.json();
      
      if (!createCustomerResponse.ok || !newCustomer.Customer) {
        console.error('Failed to create customer:', newCustomer);
        throw new Error(newCustomer.Fault?.Error?.[0]?.Message || 'Failed to create customer in QuickBooks');
      }
      
      customerId = newCustomer.Customer.Id;
    }

    // Build invoice line items using inventory allocations or shipped quantities
    let lineItems = [];
    let calculatedSubtotal = 0;

    if (allocations && allocations.length > 0) {
      // Use inventory allocations for line items
      console.log('Using inventory allocations for line items');
      lineItems = allocations.map((alloc: any) => {
        const item = alloc.order_items;
        const qty = alloc.quantity_allocated;
        const amount = qty * item.unit_price;
        calculatedSubtotal += amount;
        
        console.log(`Item: ${item.name}, Allocated Qty: ${qty}, Unit Price: ${item.unit_price}, Amount: ${amount}`);
        
        return {
          DetailType: 'SalesItemLineDetail',
          Amount: amount,
          SalesItemLineDetail: {
            ItemRef: {
              value: '1', // Default item ID
            },
            Qty: qty,
            UnitPrice: item.unit_price,
          },
          Description: item.description || item.name,
        };
      });
    } else {
      // Fallback: Use order items with shipped_quantity
      console.log('No allocations found, using order items with shipped_quantity');
      lineItems = invoice.orders?.order_items
        ?.filter((item: any) => item.shipped_quantity > 0)
        .map((item: any) => {
          const qty = item.shipped_quantity;
          const amount = qty * item.unit_price;
          calculatedSubtotal += amount;
          
          console.log(`Item: ${item.name}, Shipped Qty: ${qty}, Unit Price: ${item.unit_price}, Amount: ${amount}`);
          
          return {
            DetailType: 'SalesItemLineDetail',
            Amount: amount,
            SalesItemLineDetail: {
              ItemRef: {
                value: '1',
              },
              Qty: qty,
              UnitPrice: item.unit_price,
            },
            Description: item.description || item.name,
          };
        }) || [];
    }

    // Add shipping as a line item if present
    if (invoice.shipping_cost > 0) {
      calculatedSubtotal += Number(invoice.shipping_cost);
      lineItems.push({
        DetailType: 'SalesItemLineDetail',
        Amount: invoice.shipping_cost,
        Description: 'Shipping',
        SalesItemLineDetail: {
          ItemRef: { value: '1' }, // Default shipping item
        },
      });
    }

    // Validate calculated total matches database total
    const calculatedTotal = calculatedSubtotal + Number(invoice.tax || 0);
    const dbTotal = Number(invoice.total);
    
    console.log('Calculated subtotal:', calculatedSubtotal);
    console.log('Calculated total (with tax):', calculatedTotal);
    console.log('Database total:', dbTotal);
    console.log('Difference:', Math.abs(calculatedTotal - dbTotal));

    if (Math.abs(calculatedTotal - dbTotal) > 0.01) {
      console.warn('WARNING: Calculated total does not match database total!');
      console.warn(`Calculated: ${calculatedTotal}, Database: ${dbTotal}, Diff: ${calculatedTotal - dbTotal}`);
      // Don't throw error, but log the discrepancy for investigation
    }

    // Create invoice payload
    const invoicePayload = {
      CustomerRef: {
        value: customerId,
      },
      Line: lineItems,
      TxnDate: invoice.invoice_date.split('T')[0],
      DueDate: invoice.due_date ? invoice.due_date.split('T')[0] : undefined,
      DocNumber: invoice.invoice_number.substring(0, 21), // QuickBooks max 21 chars
      PrivateNote: invoice.notes || '',
      CustomerMemo: {
        value: invoice.orders?.memo || '',
      },
      BillAddr: {
        Line1: invoice.orders?.billing_street || invoice.orders?.shipping_street || '',
        City: invoice.orders?.billing_city || invoice.orders?.shipping_city || '',
        CountrySubDivisionCode: invoice.orders?.billing_state || invoice.orders?.shipping_state || '',
        PostalCode: invoice.orders?.billing_zip || invoice.orders?.shipping_zip || '',
      },
      ShipAddr: {
        Line1: invoice.orders?.shipping_street || '',
        City: invoice.orders?.shipping_city || '',
        CountrySubDivisionCode: invoice.orders?.shipping_state || '',
        PostalCode: invoice.orders?.shipping_zip || '',
      },
    };

    let qbResponse;
    if (invoice.quickbooks_id) {
      // Update existing invoice
      console.log('Updating existing QuickBooks invoice:', invoice.quickbooks_id);
      
      const getResponse = await fetch(`${qbApiUrl}/invoice/${invoice.quickbooks_id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      const currentInvoice = await getResponse.json();

      qbResponse = await fetch(`${qbApiUrl}/invoice?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...invoicePayload,
          Id: invoice.quickbooks_id,
          SyncToken: currentInvoice.Invoice.SyncToken,
        }),
      });
    } else {
      // Create new invoice
      console.log('Creating new QuickBooks invoice');
      qbResponse = await fetch(`${qbApiUrl}/invoice?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoicePayload),
      });
    }

    const qbData = await qbResponse.json();

    if (!qbResponse.ok) {
      console.error('QuickBooks API error:', qbData);
      throw new Error(qbData.Fault?.Error?.[0]?.Message || 'QuickBooks API error');
    }

    const qbInvoiceId = qbData.Invoice.Id;
    console.log('QuickBooks invoice ID:', qbInvoiceId);

    // Update invoice with QuickBooks ID
    await supabase
      .from('invoices')
      .update({
        quickbooks_id: qbInvoiceId,
        quickbooks_synced_at: new Date().toISOString(),
        quickbooks_sync_status: 'synced',
      })
      .eq('id', invoiceId);

    console.log('Invoice synced successfully');

    return new Response(
      JSON.stringify({ success: true, quickbooks_id: qbInvoiceId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Sync error:', error);
    
    const { invoiceId } = await req.json().catch(() => ({}));
    if (invoiceId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase
        .from('invoices')
        .update({ quickbooks_sync_status: 'failed' })
        .eq('id', invoiceId);
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
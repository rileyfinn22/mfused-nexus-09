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

    // Get invoice with items
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
      customerId = newCustomer.Customer.Id;
    }

    // Build invoice line items
    const lineItems = invoice.orders?.order_items?.map((item: any, index: number) => ({
      DetailType: 'SalesItemLineDetail',
      Amount: item.total,
      SalesItemLineDetail: {
        ItemRef: {
          value: item.product_id ? '1' : '1', // Use QBO item ID if product is synced
        },
        Qty: item.quantity,
        UnitPrice: item.unit_price,
      },
      Description: item.description || item.name,
    })) || [];

    // Add shipping as a line item if present
    if (invoice.shipping_cost > 0) {
      lineItems.push({
        DetailType: 'SalesItemLineDetail',
        Amount: invoice.shipping_cost,
        Description: 'Shipping',
        SalesItemLineDetail: {
          ItemRef: { value: '1' }, // Default shipping item
        },
      });
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
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
        JSON.stringify({ error: 'Only Vibe admins can pull from QuickBooks' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, projectName, customerId } = await req.json();
    console.log('QuickBooks pull request:', { action, projectName, customerId });

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
      throw new Error('QuickBooks not connected');
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

    // Search for customers/projects in QuickBooks
    if (action === 'search-customers') {
      console.log('Searching for customers...');
      
      const searchQuery = projectName 
        ? `SELECT * FROM Customer WHERE DisplayName LIKE '%${projectName.replace(/'/g, "\\'")}%' MAXRESULTS 50`
        : 'SELECT * FROM Customer MAXRESULTS 100';
      
      const response = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(searchQuery)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        console.error('QB search error:', data);
        throw new Error(data.Fault?.Error?.[0]?.Message || 'Failed to search QuickBooks');
      }

      const customers = data.QueryResponse?.Customer || [];
      console.log(`Found ${customers.length} customers`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          customers: customers.map((c: any) => ({
            id: c.Id,
            name: c.DisplayName,
            email: c.PrimaryEmailAddr?.Address,
            phone: c.PrimaryPhone?.FreeFormNumber,
            balance: c.Balance,
            companyName: c.CompanyName,
            billingAddress: c.BillAddr ? {
              street: c.BillAddr.Line1,
              city: c.BillAddr.City,
              state: c.BillAddr.CountrySubDivisionCode,
              zip: c.BillAddr.PostalCode,
            } : null,
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get full customer details with estimates and invoices
    if (action === 'get-customer-details') {
      if (!customerId) {
        throw new Error('Customer ID required');
      }

      console.log('Getting customer details for:', customerId);

      // Get customer
      const customerResponse = await fetch(
        `${qbApiUrl}/customer/${customerId}?minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      const customerData = await customerResponse.json();
      if (!customerResponse.ok) {
        throw new Error(customerData.Fault?.Error?.[0]?.Message || 'Failed to get customer');
      }

      const customer = customerData.Customer;

      // Get estimates for this customer
      const estimatesQuery = `SELECT * FROM Estimate WHERE CustomerRef='${customerId}' MAXRESULTS 100`;
      const estimatesResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(estimatesQuery)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      const estimatesData = await estimatesResponse.json();
      const estimates = estimatesData.QueryResponse?.Estimate || [];

      // Get invoices for this customer
      const invoicesQuery = `SELECT * FROM Invoice WHERE CustomerRef='${customerId}' MAXRESULTS 100`;
      const invoicesResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(invoicesQuery)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      const invoicesData = await invoicesResponse.json();
      const invoices = invoicesData.QueryResponse?.Invoice || [];

      // Get payments for this customer
      const paymentsQuery = `SELECT * FROM Payment WHERE CustomerRef='${customerId}' MAXRESULTS 100`;
      const paymentsResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(paymentsQuery)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      const paymentsData = await paymentsResponse.json();
      const payments = paymentsData.QueryResponse?.Payment || [];

      console.log(`Found ${estimates.length} estimates, ${invoices.length} invoices, ${payments.length} payments`);

      return new Response(
        JSON.stringify({
          success: true,
          customer: {
            id: customer.Id,
            name: customer.DisplayName,
            email: customer.PrimaryEmailAddr?.Address,
            phone: customer.PrimaryPhone?.FreeFormNumber,
            companyName: customer.CompanyName,
            billingAddress: customer.BillAddr ? {
              street: customer.BillAddr.Line1,
              city: customer.BillAddr.City,
              state: customer.BillAddr.CountrySubDivisionCode,
              zip: customer.BillAddr.PostalCode,
            } : null,
            shippingAddress: customer.ShipAddr ? {
              street: customer.ShipAddr.Line1,
              city: customer.ShipAddr.City,
              state: customer.ShipAddr.CountrySubDivisionCode,
              zip: customer.ShipAddr.PostalCode,
            } : null,
          },
          estimates: estimates.map((e: any) => ({
            id: e.Id,
            docNumber: e.DocNumber,
            txnDate: e.TxnDate,
            expirationDate: e.ExpirationDate,
            totalAmt: e.TotalAmt,
            status: e.TxnStatus,
            customerMemo: e.CustomerMemo?.value,
            lineItems: e.Line?.filter((l: any) => l.DetailType === 'SalesItemLineDetail').map((l: any) => ({
              description: l.Description,
              amount: l.Amount,
              quantity: l.SalesItemLineDetail?.Qty,
              unitPrice: l.SalesItemLineDetail?.UnitPrice,
              itemName: l.SalesItemLineDetail?.ItemRef?.name,
            })) || [],
          })),
          invoices: invoices.map((i: any) => ({
            id: i.Id,
            docNumber: i.DocNumber,
            txnDate: i.TxnDate,
            dueDate: i.DueDate,
            totalAmt: i.TotalAmt,
            balance: i.Balance,
            status: i.Balance === 0 ? 'Paid' : i.Balance < i.TotalAmt ? 'Partial' : 'Open',
            lineItems: i.Line?.filter((l: any) => l.DetailType === 'SalesItemLineDetail').map((l: any) => ({
              description: l.Description,
              amount: l.Amount,
              quantity: l.SalesItemLineDetail?.Qty,
              unitPrice: l.SalesItemLineDetail?.UnitPrice,
              itemName: l.SalesItemLineDetail?.ItemRef?.name,
            })) || [],
          })),
          payments: payments.map((p: any) => ({
            id: p.Id,
            txnDate: p.TxnDate,
            totalAmt: p.TotalAmt,
            paymentMethod: p.PaymentMethodRef?.name,
          })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create import request for admin approval
    if (action === 'create-import-request') {
      const { customerData, selectedItems } = await req.json();
      
      // First check if company already exists
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id, name')
        .eq('quickbooks_id', customerData.id)
        .single();

      if (existingCompany) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Company already exists',
            existingCompany 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create import request
      const { data: importRequest, error: insertError } = await supabase
        .from('qb_import_requests')
        .insert({
          company_id: vibeAdmin.company_id, // Temporary, will be updated when company is created
          qb_customer_id: customerData.id,
          qb_customer_name: customerData.name,
          qb_project_name: customerData.name,
          import_type: 'customer',
          status: 'pending',
          data: { customer: customerData, selectedItems },
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return new Response(
        JSON.stringify({ success: true, importRequest }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in quickbooks-pull-project:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
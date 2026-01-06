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
  
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Failed to refresh access token');
  }
  
  const expiresAt = new Date(Date.now() + (data.expires_in * 1000));
  const refreshTokenExpiresAt = new Date(Date.now() + (data.x_refresh_token_expires_in || 8726400) * 1000);

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
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_token_secret_id: accessSecretId,
      refresh_token_secret_id: refreshSecretId,
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

    const { searchTerm, customerId } = await req.json();

    console.log('Querying QBO projects with searchTerm:', searchTerm, 'customerId:', customerId);

    // Get VibePKG admin company settings
    const { data: vibeCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('name', 'VibePKG')
      .single();

    if (!vibeCompany) {
      throw new Error('VibePKG company not found');
    }

    // Get QuickBooks settings
    const { data: qbSettings, error: qbError } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('company_id', vibeCompany.id)
      .single();

    if (qbError || !qbSettings) {
      throw new Error('QuickBooks not connected');
    }

    // Get decrypted tokens from vault
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    if (qbSettings.access_token_secret_id) {
      const { data: decryptedAccess } = await supabase.rpc('get_qb_token_decrypted', {
        p_company_id: vibeCompany.id,
        p_token_type: 'access'
      });
      accessToken = decryptedAccess;
    }
    accessToken = accessToken || qbSettings.access_token;

    if (qbSettings.refresh_token_secret_id) {
      const { data: decryptedRefresh } = await supabase.rpc('get_qb_token_decrypted', {
        p_company_id: vibeCompany.id,
        p_token_type: 'refresh'
      });
      refreshToken = decryptedRefresh;
    }
    refreshToken = refreshToken || qbSettings.refresh_token;

    if (!accessToken || !refreshToken) {
      throw new Error('QuickBooks tokens not found');
    }

    // Refresh token if expired
    const tokenExpiresAt = new Date(qbSettings.token_expires_at);
    if (tokenExpiresAt <= new Date()) {
      console.log('Token expired, refreshing...');
      accessToken = await refreshAccessToken(supabase, vibeCompany.id, refreshToken);
    }

    const realmId = qbSettings.realm_id;
    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;

    // Query customers/projects from QuickBooks
    // Projects in QBO are sub-customers (customers with a parent)
    let query = `SELECT * FROM Customer WHERE Job = true`;
    
    if (searchTerm) {
      query += ` AND DisplayName LIKE '%${searchTerm}%'`;
    }
    
    if (customerId) {
      // Get all sub-customers (projects) under this parent customer
      query = `SELECT * FROM Customer WHERE ParentRef = '${customerId}'`;
    }
    
    query += ` MAXRESULTS 50`;

    console.log('QBO Query:', query);

    const queryResponse = await fetch(
      `${qbApiUrl}/query?query=${encodeURIComponent(query)}&minorversion=70`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    const queryData = await queryResponse.json();

    if (!queryResponse.ok) {
      console.error('QBO query error:', queryData);
      throw new Error(queryData?.Fault?.Error?.[0]?.Message || 'Failed to query QuickBooks');
    }

    const customers = queryData?.QueryResponse?.Customer || [];
    
    // Also try to get parent customers to show in results
    let parentCustomers: any[] = [];
    if (!customerId && searchTerm) {
      const parentQuery = `SELECT * FROM Customer WHERE Job = false AND DisplayName LIKE '%${searchTerm}%' MAXRESULTS 20`;
      const parentResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(parentQuery)}&minorversion=70`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      const parentData = await parentResponse.json();
      if (parentResponse.ok) {
        parentCustomers = parentData?.QueryResponse?.Customer || [];
      }
    }

    // Format the response
    const projects = customers.map((c: any) => ({
      id: c.Id,
      name: c.DisplayName,
      fullName: c.FullyQualifiedName,
      parentId: c.ParentRef?.value || null,
      parentName: c.ParentRef?.name || null,
      isProject: c.Job === true,
      active: c.Active,
    }));

    const parents = parentCustomers.map((c: any) => ({
      id: c.Id,
      name: c.DisplayName,
      fullName: c.FullyQualifiedName,
      isProject: false,
      active: c.Active,
    }));

    console.log(`Found ${projects.length} projects and ${parents.length} parent customers`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        projects,
        customers: parents,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error querying QBO projects:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

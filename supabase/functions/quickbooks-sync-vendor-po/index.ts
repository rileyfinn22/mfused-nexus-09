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
    console.error('Token refresh failed:', data);
    throw new Error(data.error_description || data.error || 'Failed to refresh access token');
  }
  
  if (!data.access_token || !data.refresh_token || typeof data.expires_in !== 'number' || data.expires_in <= 0) {
    console.error('Invalid token response:', data);
    throw new Error('Invalid token response from QuickBooks');
  }
  
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
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

    const { vendorPoId } = await req.json();

    console.log('Syncing vendor PO:', vendorPoId);

    // Get vendor PO with items and linked order's QB project
    const { data: vendorPo, error: poError } = await supabase
      .from('vendor_pos')
      .select(`
        *,
        vendors(name, contact_email),
        vendor_po_items(*),
        orders:order_id(qb_project_id)
      `)
      .eq('id', vendorPoId)
      .single();

    if (poError || !vendorPo) {
      throw new Error('Vendor PO not found');
    }

    // Get the QB Project ID from the linked order (for P&L tracking)
    const qbProjectId = (vendorPo.orders as any)?.qb_project_id;
    console.log('QB Project ID for vendor PO:', qbProjectId);

    // Get QuickBooks settings and decrypt tokens
    const { data: qbSettings, error: qbError } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('company_id', vendorPo.company_id)
      .single();

    // If QuickBooks not connected, update status and skip sync gracefully
    if (qbError || !qbSettings || !qbSettings.is_connected) {
      console.log('QuickBooks not connected, skipping sync');
      
      await supabase
        .from('vendor_pos')
        .update({ 
          quickbooks_sync_status: 'not_connected',
        })
        .eq('id', vendorPoId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          skipped: true, 
          reason: 'QuickBooks not connected' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt tokens from vault (fallback to plain text for backwards compatibility)
    let accessToken = qbSettings.access_token;
    let refreshToken = qbSettings.refresh_token;
    
    if (qbSettings.access_token_secret_id) {
      const { data: decryptedAccess } = await supabase
        .rpc('get_qb_token_decrypted', {
          p_company_id: vendorPo.company_id,
          p_token_type: 'access'
        });
      accessToken = decryptedAccess || accessToken;
    }
    
    if (qbSettings.refresh_token_secret_id) {
      const { data: decryptedRefresh } = await supabase
        .rpc('get_qb_token_decrypted', {
          p_company_id: vendorPo.company_id,
          p_token_type: 'refresh'
        });
      refreshToken = decryptedRefresh || refreshToken;
    }

    // Check if token needs refresh
    const tokenExpiry = new Date(qbSettings.token_expires_at);
    if (tokenExpiry <= new Date()) {
      console.log('Refreshing access token...');
      accessToken = await refreshAccessToken(supabase, vendorPo.company_id, refreshToken);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    async function isValidQbProjectRef(projectId: string): Promise<boolean> {
      try {
        // Check if this is a valid sub-customer (Job) in QBO
        const resp = await fetch(`${qbApiUrl}/customer/${projectId}?minorversion=65`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });

        if (!resp.ok) {
          console.warn('Sub-customer not found or invalid:', projectId, resp.status);
          return false;
        }

        const data = await resp.json();
        return !!data?.Customer;
      } catch (e) {
        console.warn('Failed to validate ProjectRef:', projectId, e);
        return false;
      }
    }

    let safeQbProjectId: string | null = qbProjectId ? String(qbProjectId) : null;
    if (safeQbProjectId) {
      const valid = await isValidQbProjectRef(safeQbProjectId);
      if (!valid) {
        console.warn('Invalid QB ProjectRef for vendor PO, clearing order link:', safeQbProjectId);
        await supabase.from('orders').update({ qb_project_id: null }).eq('id', vendorPo.order_id);
        safeQbProjectId = null;
      }
    }

    // Find or create vendor in QuickBooks

    const vendorName = vendorPo.vendors?.name || 'Unknown Vendor';
    const vendorSearchResponse = await fetch(
      `${qbApiUrl}/query?query=SELECT * FROM Vendor WHERE DisplayName='${encodeURIComponent(vendorName)}' MAXRESULTS 1&minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );
    const vendorSearchData = await vendorSearchResponse.json();
    
    let qbVendorId;
    if (vendorSearchData.QueryResponse?.Vendor?.length > 0) {
      qbVendorId = vendorSearchData.QueryResponse.Vendor[0].Id;
    } else {
      // Create new vendor
      const vendorPayload = {
        DisplayName: vendorName,
        PrimaryEmailAddr: { Address: vendorPo.vendors?.contact_email || '' },
      };

      const createVendorResponse = await fetch(`${qbApiUrl}/vendor?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vendorPayload),
      });

      const newVendor = await createVendorResponse.json();
      qbVendorId = newVendor.Vendor.Id;
    }

    // Build bill line items
    // IMPORTANT: When we use sub-customers (Jobs) to represent “projects”, QuickBooks expects the Job
    // to be set as CustomerRef on each expense line (ProjectRef will fail with ValidationFault 9341).
    const lineItems = vendorPo.vendor_po_items?.map((item: any) => ({
      DetailType: 'ItemBasedExpenseLineDetail',
      Amount: item.total,
      ItemBasedExpenseLineDetail: {
        ItemRef: {
          value: '1', // Default expense item
        },
        Qty: item.quantity,
        UnitPrice: item.unit_cost,
        ...(safeQbProjectId
          ? {
              CustomerRef: {
                value: safeQbProjectId,
              },
            }
          : {}),
      },
      Description: item.description || item.name,
    })) || [];

    // Create bill payload
    const billPayload: any = {
      VendorRef: {
        value: qbVendorId,
      },
      Line: lineItems,
      TxnDate: vendorPo.order_date.split('T')[0],
      DueDate: vendorPo.expected_delivery_date ? vendorPo.expected_delivery_date.split('T')[0] : undefined,
      DocNumber: vendorPo.po_number,
      PrivateNote: `Vendor PO: ${vendorPo.po_number}`,
    };

    if (safeQbProjectId) {
      console.log('Using sub-customer (Job) as bill line CustomerRef:', safeQbProjectId);
    }

    let qbResponse;
    if (vendorPo.quickbooks_id) {
      // Update existing bill
      console.log('Updating existing QuickBooks bill:', vendorPo.quickbooks_id);
      
      const getResponse = await fetch(`${qbApiUrl}/bill/${vendorPo.quickbooks_id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      const currentBill = await getResponse.json();

      qbResponse = await fetch(`${qbApiUrl}/bill?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...billPayload,
          Id: vendorPo.quickbooks_id,
          SyncToken: currentBill.Bill.SyncToken,
        }),
      });
    } else {
      // Create new bill
      console.log('Creating new QuickBooks bill');
      qbResponse = await fetch(`${qbApiUrl}/bill?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(billPayload),
      });
    }

    const qbData = await qbResponse.json();

    if (!qbResponse.ok) {
      console.error('QuickBooks API error:', qbData);
      throw new Error(qbData.Fault?.Error?.[0]?.Message || 'QuickBooks API error');
    }

    const qbBillId = qbData.Bill.Id;
    console.log('QuickBooks bill ID:', qbBillId);

    // Update vendor PO with QuickBooks ID
    await supabase
      .from('vendor_pos')
      .update({
        quickbooks_id: qbBillId,
        quickbooks_synced_at: new Date().toISOString(),
        quickbooks_sync_status: 'synced',
      })
      .eq('id', vendorPoId);

    console.log('Vendor PO synced successfully');

    return new Response(
      JSON.stringify({ success: true, quickbooks_id: qbBillId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Sync error:', error);
    
    // Check if it's a token expiration error
    const isTokenError = error.message?.includes('refresh') || error.message?.includes('token') || error.message?.includes('expired');
    const errorMessage = isTokenError 
      ? 'QuickBooks connection expired. Please reconnect in Settings.'
      : error.message;
    
    const { vendorPoId } = await req.json().catch(() => ({}));
    if (vendorPoId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase
        .from('vendor_pos')
        .update({ quickbooks_sync_status: 'failed' })
        .eq('id', vendorPoId);
      
      // Update error in settings if it's a token issue
      if (isTokenError) {
        const { data: vendorPo } = await supabase
          .from('vendor_pos')
          .select('company_id')
          .eq('id', vendorPoId)
          .single();
        
        if (vendorPo) {
          await supabase
            .from('quickbooks_settings')
            .update({
              last_error: errorMessage,
              last_error_at: new Date().toISOString(),
            })
            .eq('company_id', vendorPo.company_id);
        }
      }
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
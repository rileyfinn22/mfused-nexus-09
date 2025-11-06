import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(companyId: string, realmId: string, refreshToken: string) {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');

  console.log('Refreshing token for company:', companyId);

  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error('Token refresh failed for company', companyId, ':', data);
    throw new Error(data.error_description || data.error || 'Failed to refresh access token');
  }
  
  if (!data.access_token || !data.refresh_token || typeof data.expires_in !== 'number' || data.expires_in <= 0) {
    console.error('Invalid token response for company', companyId, ':', data);
    throw new Error('Invalid token response from QuickBooks');
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    x_refresh_token_expires_in: data.x_refresh_token_expires_in || 8726400 // 101 days default
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting proactive token refresh check...');

    // Find all companies with tokens expiring in the next 30 minutes
    const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    
    const { data: companies, error: fetchError } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('is_connected', true)
      .lt('token_expires_at', thirtyMinutesFromNow);

    if (fetchError) {
      console.error('Error fetching companies:', fetchError);
      throw fetchError;
    }

    if (!companies || companies.length === 0) {
      console.log('No tokens need refreshing at this time');
      return new Response(
        JSON.stringify({ success: true, message: 'No tokens need refreshing', refreshed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Found ${companies.length} companies with tokens needing refresh`);

    const results = [];
    
    for (const company of companies) {
      try {
        const refreshToken = company.refresh_token;
        
        if (!refreshToken) {
          console.error(`No refresh token for company ${company.company_id}`);
          await supabase
            .from('quickbooks_settings')
            .update({
              last_error: 'No refresh token available. Please reconnect QuickBooks.',
              last_error_at: new Date().toISOString(),
            })
            .eq('company_id', company.company_id);
          
          results.push({ company_id: company.company_id, success: false, error: 'No refresh token' });
          continue;
        }

        const tokens = await refreshAccessToken(company.company_id, company.realm_id, refreshToken);
        
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
        const refreshTokenExpiresAt = new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000);

        await supabase
          .from('quickbooks_settings')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expires_at: expiresAt.toISOString(),
            refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
            last_error: null,
            last_error_at: null,
          })
          .eq('company_id', company.company_id);

        console.log(`Successfully refreshed tokens for company ${company.company_id}`);
        results.push({ company_id: company.company_id, success: true });

      } catch (error: any) {
        console.error(`Failed to refresh tokens for company ${company.company_id}:`, error);
        
        await supabase
          .from('quickbooks_settings')
          .update({
            last_error: error.message || 'Failed to refresh tokens. Please reconnect QuickBooks.',
            last_error_at: new Date().toISOString(),
          })
          .eq('company_id', company.company_id);
        
        results.push({ company_id: company.company_id, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Token refresh complete. ${successCount}/${results.length} successful`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Refreshed ${successCount} of ${results.length} tokens`,
        refreshed: successCount,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Error in refresh tokens function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

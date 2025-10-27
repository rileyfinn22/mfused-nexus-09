import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthCallbackRequest {
  code: string;
  realmId: string;
  state: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle GET request from QuickBooks OAuth callback
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const realmId = url.searchParams.get('realmId');

    console.log('GET OAuth callback received:', { hasCode: !!code, hasState: !!state, hasRealmId: !!realmId });

    if (!code || !state || !realmId) {
      const html = `<!DOCTYPE html><html><body><p>Missing parameters. You can close this window.</p><script>setTimeout(() => window.close(), 2000);</script></body></html>`;
      return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
      const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        throw new Error('QuickBooks credentials not configured');
      }

      // Validate and decode state parameter
      let companyId: string;
      try {
        const stateData = JSON.parse(atob(state));
        companyId = stateData.companyId;
        
        // Validate state timestamp (prevent replay attacks - valid for 10 minutes)
        const stateAge = Date.now() - stateData.timestamp;
        if (stateAge > 10 * 60 * 1000) {
          throw new Error('OAuth state expired');
        }
      } catch (error) {
        console.error('Invalid state parameter:', error);
        throw new Error('Invalid OAuth state parameter');
      }

      console.log('Exchanging auth code for tokens...');

      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: `${supabaseUrl}/functions/v1/quickbooks-oauth`,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', errorText);
        throw new Error(`Failed to exchange auth code: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      console.log('Successfully obtained tokens');

      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      // Store tokens in database
      const { error: upsertError } = await supabase
        .from('quickbooks_settings')
        .upsert({
          company_id: companyId,
          realm_id: realmId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          is_connected: true,
        }, {
          onConflict: 'company_id'
        });

      if (upsertError) {
        console.error('Database error:', upsertError);
        throw upsertError;
      }

      console.log('QuickBooks connected successfully');

      // Return HTML that closes popup and notifies parent
      const html = `<!DOCTYPE html>
<html>
<head><title>Success</title></head>
<body>
  <p>QuickBooks connected successfully! Closing...</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ 
        type: 'quickbooks-oauth-success',
        data: { success: true, realmId: '${realmId}' }
      }, '*');
    }
    setTimeout(() => window.close(), 500);
  </script>
</body>
</html>`;

      return new Response(html, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });

    } catch (error: any) {
      console.error('OAuth GET error:', error);
      const html = `<!DOCTYPE html><html><body><p>Error: ${error.message}</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`;
      return new Response(html, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }
  }

  // Handle POST request (for backwards compatibility or manual calls)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('QuickBooks credentials not configured');
    }

    const { code, realmId, state }: OAuthCallbackRequest = await req.json();

    // Validate and decode state parameter
    let companyId: string;
    try {
      const stateData = JSON.parse(atob(state));
      companyId = stateData.companyId;
      
      // Validate state timestamp (prevent replay attacks - valid for 10 minutes)
      const stateAge = Date.now() - stateData.timestamp;
      if (stateAge > 10 * 60 * 1000) {
        throw new Error('OAuth state expired');
      }
    } catch (error) {
      console.error('Invalid state parameter:', error);
      throw new Error('Invalid OAuth state parameter');
    }

    console.log('Exchanging auth code for tokens...');

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${supabaseUrl}/functions/v1/quickbooks-oauth`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      throw new Error(`Failed to exchange auth code: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('Successfully obtained tokens');

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store tokens in database
    const { error: upsertError } = await supabase
      .from('quickbooks_settings')
      .upsert({
        company_id: companyId,
        realm_id: realmId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        is_connected: true,
      }, {
        onConflict: 'company_id'
      });

    if (upsertError) {
      console.error('Database error:', upsertError);
      throw upsertError;
    }

    console.log('QuickBooks connected successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'QuickBooks connected successfully',
        realmId 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('OAuth error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
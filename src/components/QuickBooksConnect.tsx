import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Link2, Unlink, CheckCircle, AlertCircle } from "lucide-react";

export const QuickBooksConnect = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [realmId, setRealmId] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [refreshTokenExpiresAt, setRefreshTokenExpiresAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) return;

      const { data: qbSettings } = await supabase
        .from('quickbooks_settings')
        .select('*')
        .eq('company_id', userRole.company_id)
        .single();

      if (qbSettings?.is_connected) {
        setIsConnected(true);
        setRealmId(qbSettings.realm_id);
        setTokenExpiresAt(qbSettings.token_expires_at);
        setRefreshTokenExpiresAt(qbSettings.refresh_token_expires_at);
        setLastError(qbSettings.last_error);
      }
    } catch (error) {
      console.error('Error checking QuickBooks connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      // Get client ID from edge function
      const { data: initData, error: initError } = await supabase.functions.invoke('quickbooks-init-oauth');
      
      if (initError || !initData?.clientId) {
        throw new Error('Failed to initialize OAuth');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("No company found");
      
      const clientId = initData.clientId;
      // Standard QuickBooks accounting scope - Projects scope requires partner tier
      const scope = 'com.intuit.quickbooks.accounting';
      const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-oauth`;
      
      // Generate secure state parameter with company_id and random nonce
      const nonce = crypto.randomUUID();
      const state = btoa(JSON.stringify({
        companyId: userRole.company_id,
        nonce,
        timestamp: Date.now()
      }));
      sessionStorage.setItem('qb_oauth_state', state);

      // Build OAuth URL
      const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
        `client_id=${clientId}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `state=${encodeURIComponent(state)}`;

      // Open in popup window
      const popup = window.open(authUrl, 'QuickBooks OAuth', 'width=800,height=600');
      
      // Poll to check when popup closes
      const checkPopup = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkPopup);
          setConnecting(false);
          // Refresh connection status after popup closes
          setTimeout(() => checkConnection(), 500);
        }
      }, 500);

    } catch (error: any) {
      toast({
        title: "Connection Error",
        description: error.message,
        variant: "destructive"
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) return;

      await supabase
        .from('quickbooks_settings')
        .update({
          is_connected: false,
          access_token: null,
          refresh_token: null,
        })
        .eq('company_id', userRole.company_id);

      setIsConnected(false);
      setRealmId(null);
      setTokenExpiresAt(null);
      setRefreshTokenExpiresAt(null);
      setLastError(null);
      
      toast({
        title: "Disconnected",
        description: "QuickBooks has been disconnected"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("No company found");

      // Try to invoke the refresh function
      const { error } = await supabase.functions.invoke('quickbooks-refresh-tokens');

      if (error) throw error;

      toast({
        title: "Connection OK",
        description: "QuickBooks connection is working properly"
      });

      // Refresh status
      await checkConnection();
    } catch (error: any) {
      toast({
        title: "Connection Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  const getTokenStatus = () => {
    if (!tokenExpiresAt) return { type: 'unknown', message: '' };
    
    const expiryDate = new Date(tokenExpiresAt);
    const now = new Date();
    const minutesUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60));
    
    if (minutesUntilExpiry < 0) {
      return { type: 'expired', message: 'Access token expired' };
    } else if (minutesUntilExpiry < 30) {
      return { type: 'expiring', message: `Token expires in ${minutesUntilExpiry} minutes` };
    }
    
    return { type: 'ok', message: 'Token is valid' };
  };

  const getRefreshTokenStatus = () => {
    if (!refreshTokenExpiresAt) return { type: 'unknown', message: '' };
    
    const expiryDate = new Date(refreshTokenExpiresAt);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return { type: 'expired', message: 'Refresh token expired - reconnection required' };
    } else if (daysUntilExpiry < 7) {
      return { type: 'warning', message: `Refresh token expires in ${daysUntilExpiry} days` };
    }
    
    return { type: 'ok', message: `Refresh token valid for ${daysUntilExpiry} days` };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>QuickBooks Online Integration</CardTitle>
          <CardDescription>Loading connection status...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          QuickBooks Online Integration
          {isConnected ? (
            <Badge className="bg-success text-white">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary">
              <AlertCircle className="h-3 w-3 mr-1" />
              Not Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Sync products, invoices, and vendor POs automatically to QuickBooks Online
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <div className="space-y-4">
            {lastError && (
              <div className="bg-destructive/10 border border-destructive/20 p-4 rounded">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-destructive">Connection Issue</p>
                    <p className="text-xs text-destructive/80 mt-1">{lastError}</p>
                  </div>
                </div>
              </div>
            )}

            {(() => {
              const refreshStatus = getRefreshTokenStatus();
              return refreshStatus.type === 'warning' || refreshStatus.type === 'expired' ? (
                <div className="bg-warning/10 border border-warning/20 p-4 rounded">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-warning mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-warning">Action Required</p>
                      <p className="text-xs text-warning/80 mt-1">{refreshStatus.message}</p>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            <div className="bg-muted p-4 rounded space-y-3">
              <div>
                <p className="text-sm font-medium mb-1">Connected Company ID</p>
                <p className="text-xs text-muted-foreground font-mono">{realmId}</p>
              </div>
              
              {tokenExpiresAt && (
                <div>
                  <p className="text-sm font-medium mb-1">Token Status</p>
                  <p className="text-xs text-muted-foreground">{getTokenStatus().message}</p>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Auto-Sync Enabled For:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>✓ Products → Non-Inventory Items</li>
                <li>✓ Invoices → Sales Invoices</li>
                <li>✓ Vendor POs → Bills</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Tokens are automatically refreshed every 30 minutes
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleTestConnection}
                disabled={testing}
                className="flex-1"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDisconnect}
                className="flex-1"
              >
                <Unlink className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your QuickBooks Online account to automatically sync:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Products as Non-Inventory Items</li>
              <li>• Customer Invoices as Sales Invoices</li>
              <li>• Vendor Purchase Orders as Bills</li>
            </ul>
            
            <Button 
              onClick={handleConnect}
              disabled={connecting}
              className="w-full"
            >
              <Link2 className="h-4 w-4 mr-2" />
              {connecting ? 'Connecting...' : 'Connect QuickBooks Online'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
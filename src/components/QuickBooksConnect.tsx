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
      const scope = 'com.intuit.quickbooks.accounting';
      const redirectUri = `${window.location.origin}/settings`;
      
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
        `scope=${scope}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `state=${encodeURIComponent(state)}`;

      // Open in popup window
      const popup = window.open(authUrl, 'QuickBooks OAuth', 'width=800,height=600');
      
      // Listen for callback
      const checkPopup = setInterval(() => {
        try {
          if (popup?.closed) {
            clearInterval(checkPopup);
            setConnecting(false);
            checkConnection(); // Refresh connection status
          }
        } catch (e) {
          // Cross-origin error expected
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
            <div className="bg-muted p-4 rounded">
              <p className="text-sm font-medium mb-1">Connected Company ID</p>
              <p className="text-xs text-muted-foreground font-mono">{realmId}</p>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Auto-Sync Enabled For:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>✓ Products → Non-Inventory Items</li>
                <li>✓ Invoices → Sales Invoices</li>
                <li>✓ Vendor POs → Bills</li>
              </ul>
            </div>

            <Button 
              variant="destructive" 
              onClick={handleDisconnect}
              className="w-full"
            >
              <Unlink className="h-4 w-4 mr-2" />
              Disconnect QuickBooks
            </Button>
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
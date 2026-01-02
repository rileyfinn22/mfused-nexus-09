import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Bell, Users, Save, Link2, Shield } from "lucide-react";
import { QuickBooksConnect } from "@/components/QuickBooksConnect";
import { VibeAdminManagement } from "@/components/VibeAdminManagement";

export default function Settings() {
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [settings, setSettings] = useState({
    primary_contact_name: "",
    primary_contact_email: "",
    primary_contact_phone: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    session_timeout_minutes: 30,
    notification_preferences: {
      order_updates: true,
      inventory_alerts: true,
      invoice_notifications: true,
    },
  });

  useEffect(() => {
    loadSettings();
    handleOAuthCallback();
    checkVibeAdmin();
  }, []);

  const checkVibeAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "vibe_admin",
      });

      setIsVibeAdmin(!!data);
    } catch (error) {
      console.error("Error checking vibe admin status:", error);
    }
  };

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRole } = await supabase
        .from("user_roles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!userRole) return;
      setCompanyId(userRole.company_id);

      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("id", userRole.company_id)
        .single();

      if (company) setCompanyName(company.name);

      const { data: companySettings } = await supabase
        .from("company_settings")
        .select("*")
        .eq("company_id", userRole.company_id)
        .maybeSingle();

      if (companySettings) {
        const prefs = companySettings.notification_preferences as any;
        setSettings({
          primary_contact_name: companySettings.primary_contact_name || "",
          primary_contact_email: companySettings.primary_contact_email || "",
          primary_contact_phone: companySettings.primary_contact_phone || "",
          address_street: companySettings.address_street || "",
          address_city: companySettings.address_city || "",
          address_state: companySettings.address_state || "",
          address_zip: companySettings.address_zip || "",
          session_timeout_minutes: companySettings.session_timeout_minutes || 30,
          notification_preferences: (typeof prefs === 'object' && prefs !== null) ? prefs : {
            order_updates: true,
            inventory_alerts: true,
            invoice_notifications: true,
          },
        });
      }
    } catch (error: any) {
      toast({
        title: "Error loading settings",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleOAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const realmId = urlParams.get('realmId');

    if (!code || !state || !realmId) return;

    console.log('QuickBooks OAuth callback received:', { 
      hasCode: !!code, 
      hasState: !!state, 
      hasRealmId: !!realmId 
    });

    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);

    try {
      // Call the OAuth edge function to complete the connection
      console.log('Invoking quickbooks-oauth edge function...');
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
        body: { code, state, realmId }
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(`OAuth error: ${error.message || JSON.stringify(error)}`);
      }

      if (!data?.success) {
        console.error('OAuth failed:', data);
        throw new Error(data?.error || 'Failed to connect QuickBooks');
      }

      console.log('QuickBooks connected successfully');
      toast({
        title: "Connected",
        description: "QuickBooks has been connected successfully",
      });
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Unable to connect to QuickBooks. Please try again.",
        variant: "destructive",
      });
    }
  };

  const saveSettings = async () => {
    if (!companyId) return;
    setLoading(true);

    try {
      const { data: existing } = await supabase
        .from("company_settings")
        .select("id")
        .eq("company_id", companyId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("company_settings")
          .update(settings)
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .insert({ ...settings, company_id: companyId });
        if (error) throw error;
      }

      toast({
        title: "Settings saved",
        description: "Your settings have been updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error saving settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your company settings and preferences</p>
      </div>

      <Tabs defaultValue="company" className="space-y-4">
        <TabsList>
          <TabsTrigger value="company" className="gap-2">
            <Building2 className="h-4 w-4" />
            Company
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Link2 className="h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Users className="h-4 w-4" />
            Team
          </TabsTrigger>
          {isVibeAdmin && (
            <TabsTrigger value="vibe-admin" className="gap-2">
              <Shield className="h-4 w-4" />
              Vibe Admin
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="company" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
              <CardDescription>Update your company information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={companyName} disabled />
                <p className="text-xs text-muted-foreground">Contact support to change company name</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Primary Contact Name</Label>
                  <Input
                    id="contactName"
                    value={settings.primary_contact_name}
                    onChange={(e) => setSettings({ ...settings, primary_contact_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Primary Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={settings.primary_contact_email}
                    onChange={(e) => setSettings({ ...settings, primary_contact_email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Primary Contact Phone</Label>
                <Input
                  id="contactPhone"
                  value={settings.primary_contact_phone}
                  onChange={(e) => setSettings({ ...settings, primary_contact_phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="street">Street Address</Label>
                <Input
                  id="street"
                  value={settings.address_street}
                  onChange={(e) => setSettings({ ...settings, address_street: e.target.value })}
                />
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={settings.address_city}
                    onChange={(e) => setSettings({ ...settings, address_city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={settings.address_state}
                    onChange={(e) => setSettings({ ...settings, address_state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">ZIP Code</Label>
                  <Input
                    id="zip"
                    value={settings.address_zip}
                    onChange={(e) => setSettings({ ...settings, address_zip: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what notifications you want to receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Order Updates</Label>
                  <p className="text-sm text-muted-foreground">Receive notifications about order status changes</p>
                </div>
                <Switch
                  checked={settings.notification_preferences.order_updates}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notification_preferences: { ...settings.notification_preferences, order_updates: checked },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Inventory Alerts</Label>
                  <p className="text-sm text-muted-foreground">Get notified when inventory is low</p>
                </div>
                <Switch
                  checked={settings.notification_preferences.inventory_alerts}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notification_preferences: { ...settings.notification_preferences, inventory_alerts: checked },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Invoice Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive notifications about new invoices</p>
                </div>
                <Switch
                  checked={settings.notification_preferences.invoice_notifications}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notification_preferences: { ...settings.notification_preferences, invoice_notifications: checked },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <QuickBooksConnect />
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team Management</CardTitle>
              <CardDescription>Manage your team members and their roles</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Team management features coming soon. Contact support to add team members.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {isVibeAdmin && (
          <TabsContent value="vibe-admin" className="space-y-4">
            <VibeAdminManagement />
          </TabsContent>
        )}
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={loading} className="gap-2">
          <Save className="h-4 w-4" />
          {loading ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

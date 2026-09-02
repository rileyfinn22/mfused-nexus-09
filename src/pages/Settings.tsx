import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Bell, Users, Save, Link2, Shield, Download, UserPlus, Trash2 } from "lucide-react";
import { QuickBooksConnect } from "@/components/QuickBooksConnect";
import { VibeAdminManagement } from "@/components/VibeAdminManagement";
import { QBImportManager } from "@/components/QBImportManager";

interface CompanyInfo {
  name: string;
  primary_contact_name?: string;
  primary_contact_email?: string;
  primary_contact_phone?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
}

interface TeamMember {
  user_id: string;
  role: string;
  email?: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  is_expired: boolean;
}

export default function Settings() {
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [isCompanyUser, setIsCompanyUser] = useState(false);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState<string | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
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
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: vibeAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "vibe_admin",
      });

      setIsVibeAdmin(!!vibeAdmin);

      // Check if user is a company user
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role, company_id")
        .eq("user_id", user.id)
        .single();

      if (userRole && userRole.role === "company") {
        setIsCompanyUser(true);
        // Extract domain from user email
        const emailDomain = user.email?.split("@")[1] || null;
        setCompanyDomain(emailDomain);
      }
    } catch (error) {
      console.error("Error checking user role:", error);
    }
  };

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRole } = await supabase
        .from("user_roles")
        .select("company_id, role")
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

        // Store company info for read-only display
        setCompanyInfo({
          name: company?.name || "",
          primary_contact_name: companySettings.primary_contact_name || "",
          primary_contact_email: companySettings.primary_contact_email || "",
          primary_contact_phone: companySettings.primary_contact_phone || "",
          address_street: companySettings.address_street || "",
          address_city: companySettings.address_city || "",
          address_state: companySettings.address_state || "",
          address_zip: companySettings.address_zip || "",
        });
      } else {
        setCompanyInfo({
          name: company?.name || "",
        });
      }

      // Load team members and outstanding invites for this company
      await Promise.all([
        loadTeamMembers(userRole.company_id),
        loadPendingInvites(userRole.company_id),
      ]);
    } catch (error: any) {
      toast({
        title: "Error loading settings",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Both lists come from SECURITY DEFINER RPCs. Querying user_roles directly
  // returned only the viewer (its SELECT policy is `auth.uid() = user_id`), and
  // company_invitations is vibe-admin-only, so the customer portal always showed
  // a company of one and no invites at all.
  const loadTeamMembers = async (companyIdParam: string) => {
    try {
      const { data, error } = await (supabase as any).rpc("company_team_members", {
        p_company_id: companyIdParam,
      });
      if (error) throw error;
      setTeamMembers((data || []) as TeamMember[]);
    } catch (error) {
      console.error("Error loading team members:", error);
    }
  };

  const loadPendingInvites = async (companyIdParam: string) => {
    try {
      const { data, error } = await (supabase as any).rpc("company_pending_invitations", {
        p_company_id: companyIdParam,
      });
      if (error) throw error;
      setPendingInvites((data || []) as PendingInvite[]);
    } catch (error) {
      console.error("Error loading pending invitations:", error);
    }
  };

  const handleInviteTeamMember = async () => {
    if (!inviteEmail || !companyId) {
      toast({
        title: "Missing information",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setInviteLoading(true);
    try {
      // Inserting straight into company_invitations is denied for company users,
      // and the RPC also pins the new seat to the `company` role so a member
      // can't mint an admin seat for their own company.
      const { data, error } = await (supabase as any).rpc("create_company_invitation", {
        p_company_id: companyId,
        p_email: inviteEmail,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Could not create the invitation");

      const link = `${window.location.origin}/accept-invite?token=${data.invitation_token}`;
      await navigator.clipboard.writeText(link);

      toast({
        title: data.reused ? "Invitation refreshed" : "Invitation created",
        description: `Invite link for ${data.email} copied to clipboard. Send it to them to give them access.`,
      });

      setInviteEmail("");
      await loadPendingInvites(companyId);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setInviteLoading(false);
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
          {isVibeAdmin && (
            <TabsTrigger value="integrations" className="gap-2">
              <Link2 className="h-4 w-4" />
              Integrations
            </TabsTrigger>
          )}
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
              <CardDescription>
                {isCompanyUser ? "Your company information (managed by VibePKG)" : "Update your company information"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={companyName} disabled />
                {!isCompanyUser && (
                  <p className="text-xs text-muted-foreground">Contact support to change company name</p>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Primary Contact Name</Label>
                  <Input
                    id="contactName"
                    value={isCompanyUser ? (companyInfo?.primary_contact_name || "-") : settings.primary_contact_name}
                    onChange={(e) => setSettings({ ...settings, primary_contact_name: e.target.value })}
                    disabled={isCompanyUser}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Primary Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={isCompanyUser ? (companyInfo?.primary_contact_email || "-") : settings.primary_contact_email}
                    onChange={(e) => setSettings({ ...settings, primary_contact_email: e.target.value })}
                    disabled={isCompanyUser}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Primary Contact Phone</Label>
                <Input
                  id="contactPhone"
                  value={isCompanyUser ? (companyInfo?.primary_contact_phone || "-") : settings.primary_contact_phone}
                  onChange={(e) => setSettings({ ...settings, primary_contact_phone: e.target.value })}
                  disabled={isCompanyUser}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="street">Street Address</Label>
                <Input
                  id="street"
                  value={isCompanyUser ? (companyInfo?.address_street || "-") : settings.address_street}
                  onChange={(e) => setSettings({ ...settings, address_street: e.target.value })}
                  disabled={isCompanyUser}
                />
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={isCompanyUser ? (companyInfo?.address_city || "-") : settings.address_city}
                    onChange={(e) => setSettings({ ...settings, address_city: e.target.value })}
                    disabled={isCompanyUser}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={isCompanyUser ? (companyInfo?.address_state || "-") : settings.address_state}
                    onChange={(e) => setSettings({ ...settings, address_state: e.target.value })}
                    disabled={isCompanyUser}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">ZIP Code</Label>
                  <Input
                    id="zip"
                    value={isCompanyUser ? (companyInfo?.address_zip || "-") : settings.address_zip}
                    onChange={(e) => setSettings({ ...settings, address_zip: e.target.value })}
                    disabled={isCompanyUser}
                  />
                </div>
              </div>
              {isCompanyUser && (
                <p className="text-xs text-muted-foreground mt-4">
                  Contact VibePKG support to update your company information.
                </p>
              )}
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
          {isVibeAdmin && <QBImportManager />}
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team Management</CardTitle>
              <CardDescription>
                {isCompanyUser 
                  ? "View your team members"
                  : "Manage your team members and their roles"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Invite Section - Anyone with team access can invite teammates as Company Users */}
              <div className="space-y-4">
                <Label>Invite Team Member</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="email@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleInviteTeamMember} disabled={inviteLoading}>
                    {inviteLoading ? (
                      <span className="animate-spin mr-2">⏳</span>
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Invite
                  </Button>
                </div>
              </div>

              {/* Who has access */}
              {teamMembers.length > 0 ? (
                <div className="space-y-4">
                  <Label>Who Has Access</Label>
                  <div className="space-y-2">
                    {teamMembers.map((member) => (
                      <div key={member.user_id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <p className="text-sm font-medium">{member.email || "Unknown"}</p>
                        </div>
                        <Badge variant="secondary" className="capitalize">{member.role}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No team members yet. Invite someone to get started.
                </p>
              )}

              {/* Invites sent but not yet accepted */}
              {pendingInvites.length > 0 && (
                <div className="space-y-4">
                  <Label>Pending Invitations</Label>
                  <div className="space-y-2">
                    {pendingInvites.map((invite) => (
                      <div key={invite.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <UserPlus className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{invite.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Invited {new Date(invite.created_at).toLocaleDateString()}
                              {" · "}
                              {invite.is_expired
                                ? "expired"
                                : `expires ${new Date(invite.expires_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <Badge variant={invite.is_expired ? "destructive" : "outline"}>
                          {invite.is_expired ? "Expired" : "Pending"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Re-inviting the same address refreshes its link for another 7 days.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isVibeAdmin && (
          <TabsContent value="vibe-admin" className="space-y-4">
            <VibeAdminManagement />
          </TabsContent>
        )}
      </Tabs>

      {!isCompanyUser && (
        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={loading} className="gap-2">
            <Save className="h-4 w-4" />
            {loading ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      )}
    </div>
  );
}

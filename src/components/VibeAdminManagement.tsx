import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserPlus, Trash2, Shield, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface VibeAdmin {
  id: string;
  user_id: string;
  email: string;
}

export function VibeAdminManagement() {
  const [admins, setAdmins] = useState<VibeAdmin[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [vibePkgCompanyId, setVibePkgCompanyId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadVibeAdmins();
  }, []);

  const loadVibeAdmins = async () => {
    setLoading(true);
    try {
      // Get VibePKG company ID
      const { data: vibePkg } = await supabase
        .from("companies")
        .select("id")
        .eq("name", "VibePKG")
        .single();

      if (!vibePkg) {
        toast({
          title: "Error",
          description: "VibePKG company not found",
          variant: "destructive",
        });
        return;
      }

      setVibePkgCompanyId(vibePkg.id);

      // Get all vibe_admin users with emails using the database function
      const { data: adminsData, error } = await supabase
        .rpc("get_vibe_admins");

      if (error) throw error;

      setAdmins(adminsData || []);
    } catch (error: any) {
      toast({
        title: "Error loading admins",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addVibeAdmin = async () => {
    if (!newEmail.trim()) return;
    
    // Validate @vibepkg.com email
    if (!newEmail.toLowerCase().endsWith("@vibepkg.com")) {
      toast({
        title: "Invalid email",
        description: "Only @vibepkg.com emails can be added as Vibe Admins",
        variant: "destructive",
      });
      return;
    }

    if (!vibePkgCompanyId) {
      toast({
        title: "Error",
        description: "VibePKG company not found",
        variant: "destructive",
      });
      return;
    }

    setAdding(true);
    try {
      // Check if user exists in auth by looking for their user_id
      // Since we can't query auth.users directly, we'll create an invitation-like flow
      // For now, let's check if they already have a role
      
      // Check if we already have this user
      const existingAdmin = admins.find(a => a.user_id === newEmail.toLowerCase());
      
      if (existingAdmin) {
        toast({
          title: "Already an admin",
          description: "This user is already a Vibe Admin",
          variant: "destructive",
        });
        return;
      }

      // Create a pending invitation for vibe_admin
      // We'll use company_invitations table with VibePKG company
      const token = crypto.randomUUID();
      
      const { error } = await supabase
        .from("company_invitations")
        .insert({
          email: newEmail.toLowerCase(),
          company_id: vibePkgCompanyId,
          role: "vibe_admin",
          invitation_token: token,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        });

      if (error) throw error;

      const portalUrl = "https://vibepkgportal.com";
      const inviteLink = `${portalUrl}/accept-invite?token=${token}`;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(inviteLink);

      toast({
        title: "Invitation created",
        description: "Invite link copied to clipboard. Share it with the new admin.",
      });

      setNewEmail("");
      loadVibeAdmins();
    } catch (error: any) {
      toast({
        title: "Error adding admin",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const removeAdmin = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;

      toast({
        title: "Admin removed",
        description: "User has been removed from Vibe Admins",
      });

      loadVibeAdmins();
    } catch (error: any) {
      toast({
        title: "Error removing admin",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          VibePKG Admin Management
        </CardTitle>
        <CardDescription>
          Manage users with full administrative access. Only @vibepkg.com emails allowed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new admin */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Label htmlFor="newAdminEmail" className="sr-only">Email</Label>
            <Input
              id="newAdminEmail"
              type="email"
              placeholder="email@vibepkg.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addVibeAdmin()}
            />
          </div>
          <Button onClick={addVibeAdmin} disabled={adding} className="gap-2">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invite Admin
          </Button>
        </div>

        {/* Current admins list */}
        <div className="space-y-2">
          <Label>Current Vibe Admins</Label>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : admins.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No Vibe Admins yet. Add your first admin above.
            </p>
          ) : (
            <div className="space-y-2">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">vibe_admin</Badge>
                    <span className="text-sm">{admin.email}</span>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Admin?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove administrative access for this user. They will no longer be able to manage companies, vendors, or system settings.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeAdmin(admin.id)}>
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending invitations */}
        <PendingInvitations companyId={vibePkgCompanyId} />
      </CardContent>
    </Card>
  );
}

function PendingInvitations({ companyId }: { companyId: string | null }) {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (companyId) loadInvitations();
  }, [companyId]);

  const loadInvitations = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_invitations")
        .select("*")
        .eq("company_id", companyId)
        .eq("role", "vibe_admin")
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      if (error) throw error;
      setInvitations(data || []);
    } catch (error: any) {
      console.error("Error loading invitations:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = async (token: string) => {
    const portalUrl = "https://vibepkgportal.com";
    const link = `${portalUrl}/accept-invite?token=${token}`;
    await navigator.clipboard.writeText(link);
    toast({
      title: "Link copied",
      description: "Invite link copied to clipboard",
    });
  };

  const cancelInvitation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("company_invitations")
        .delete()
        .eq("id", id);

      if (error) throw error;
      loadInvitations();
      toast({
        title: "Invitation cancelled",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading || invitations.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label>Pending Invitations</Label>
      <div className="space-y-2">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <Badge variant="outline">pending</Badge>
              <span className="text-sm">{inv.email}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyInviteLink(inv.invitation_token)}
              >
                Copy Link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => cancelInvitation(inv.id)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
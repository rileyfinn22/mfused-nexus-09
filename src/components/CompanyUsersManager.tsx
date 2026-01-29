import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, UserPlus, Users, Shield, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { InviteCompanyUserDialog } from "@/components/InviteCompanyUserDialog";
import { useActiveCompany } from "@/hooks/useActiveCompany";

interface CompanyUser {
  id: string;
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
}

interface CompanyUsersManagerProps {
  companyId: string;
  companyName?: string;
}

export function CompanyUsersManager({ companyId, companyName }: CompanyUsersManagerProps) {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);
  const [removing, setRemoving] = useState(false);
  const { isVibeAdmin } = useActiveCompany();

  useEffect(() => {
    if (companyId) {
      fetchUsers();
      fetchPendingInvites();
    }
  }, [companyId]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch user roles for this company
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role")
        .eq("company_id", companyId);

      if (error) throw error;

      // We can't directly query auth.users, so we'll show user IDs
      // In a real scenario, you'd have a profiles table to join with
      const usersWithData: CompanyUser[] = (roles || []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        role: r.role,
      }));

      setUsers(usersWithData);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to load company users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingInvites = async () => {
    try {
      const { data, error } = await supabase
        .from("company_invitations")
        .select("id, email, role, status, created_at, expires_at")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendingInvites(data || []);
    } catch (error) {
      console.error("Error fetching invites:", error);
    }
  };

  const handleRemoveUser = async () => {
    if (!selectedUser) return;

    setRemoving(true);
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", selectedUser.id);

      if (error) throw error;

      toast({
        title: "User Removed",
        description: "User access has been revoked for this company",
      });

      setShowRemoveDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error("Error removing user:", error);
      toast({
        title: "Error",
        description: "Failed to remove user",
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from("company_invitations")
        .update({ status: "cancelled" })
        .eq("id", inviteId);

      if (error) throw error;

      toast({
        title: "Invitation Cancelled",
        description: "The pending invitation has been cancelled",
      });

      fetchPendingInvites();
    } catch (error) {
      console.error("Error cancelling invite:", error);
      toast({
        title: "Error",
        description: "Failed to cancel invitation",
        variant: "destructive",
      });
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "vibe_admin":
        return "default";
      case "admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "vibe_admin":
        return "Vibe Admin";
      case "admin":
        return "Company Admin";
      case "company":
        return "Company User";
      case "vendor":
        return "Vendor";
      default:
        return role;
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading users...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {users.length} user{users.length !== 1 ? "s" : ""} with access
          {pendingInvites.length > 0 && ` • ${pendingInvites.length} pending invite${pendingInvites.length !== 1 ? "s" : ""}`}
        </p>
        {isVibeAdmin && (
          <Button onClick={() => setShowInviteDialog(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        )}
      </div>

      {users.length === 0 && pendingInvites.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No users have access to this company</p>
            {isVibeAdmin && (
              <Button onClick={() => setShowInviteDialog(true)} variant="outline" className="mt-4">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite First User
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Active Users */}
          {users.map((user) => (
            <div key={user.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  {user.role === "vibe_admin" ? (
                    <Shield className="h-5 w-5 text-primary" />
                  ) : (
                    <User className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">
                    User ID: {user.user_id.slice(0, 8)}...
                  </p>
                  <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs mt-1">
                    {getRoleLabel(user.role)}
                  </Badge>
                </div>
              </div>
              {isVibeAdmin && user.role !== "vibe_admin" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedUser(user);
                    setShowRemoveDialog(true);
                  }}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          {/* Pending Invitations */}
          {pendingInvites.length > 0 && (
            <>
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Pending Invitations</p>
              </div>
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="border rounded-lg p-4 flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <UserPlus className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{invite.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {getRoleLabel(invite.role)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Expires {new Date(invite.expires_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isVibeAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelInvite(invite.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Invite User Dialog */}
      <InviteCompanyUserDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        preselectedCompanyId={companyId}
        onInviteSent={() => {
          fetchPendingInvites();
        }}
      />

      {/* Remove User Confirmation */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User Access</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this user's access to {companyName || "this company"}? 
              They will no longer be able to view or manage data for this company.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Removing..." : "Remove Access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

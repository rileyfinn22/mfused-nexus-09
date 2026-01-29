import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, UserPlus, Users, Shield, User, Search, Link } from "lucide-react";
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

interface PortalUser {
  user_id: string;
  email: string;
  companies: string[];
}

interface CompanyUsersManagerProps {
  companyId: string;
  companyName?: string;
}

export function CompanyUsersManager({ companyId, companyName }: CompanyUsersManagerProps) {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [allPortalUsers, setAllPortalUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showAddExistingDialog, setShowAddExistingDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);
  const [removing, setRemoving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("company");
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
      // Use the RPC function to get users with emails (vibe admin only)
      const { data, error } = await supabase.rpc("get_company_users", {
        p_company_id: companyId,
      });

      if (error) {
        console.error("Error fetching users via RPC:", error);
        // Fallback to basic query without emails
        const { data: roles, error: rolesError } = await supabase
          .from("user_roles")
          .select("id, user_id, role")
          .eq("company_id", companyId);

        if (rolesError) throw rolesError;

        setUsers(
          (roles || []).map((r) => ({
            id: r.id,
            user_id: r.user_id,
            role: r.role,
          }))
        );
      } else {
        setUsers(
          (data || []).map((r: any) => ({
            id: r.id,
            user_id: r.user_id,
            role: r.role,
            email: r.email,
          }))
        );
      }
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

  const fetchAllPortalUsers = async () => {
    try {
      const { data, error } = await supabase.rpc("get_all_portal_users");

      if (error) throw error;

      // Filter out users who already have access to this company
      const existingUserIds = users.map((u) => u.user_id);
      const availableUsers = (data || []).filter(
        (u: PortalUser) => !existingUserIds.includes(u.user_id)
      );

      setAllPortalUsers(availableUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      toast({
        title: "Error",
        description: "Failed to load portal users",
        variant: "destructive",
      });
    }
  };

  const handleOpenAddExisting = () => {
    fetchAllPortalUsers();
    setShowAddExistingDialog(true);
    setSearchQuery("");
    setSelectedUserId("");
    setSelectedRole("company");
  };

  const handleAddExistingUser = async () => {
    if (!selectedUserId) {
      toast({
        title: "Error",
        description: "Please select a user",
        variant: "destructive",
      });
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase.from("user_roles").insert({
        user_id: selectedUserId,
        company_id: companyId,
        role: selectedRole as "admin" | "company" | "customer" | "vendor" | "vibe_admin",
      });

      if (error) throw error;

      toast({
        title: "User Added",
        description: "User now has access to this company",
      });

      setShowAddExistingDialog(false);
      setSelectedUserId("");
      fetchUsers();
    } catch (error: any) {
      console.error("Error adding user:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add user",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
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
      case "customer":
        return "Customer";
      case "vendor":
        return "Vendor";
      default:
        return role;
    }
  };

  const filteredPortalUsers = allPortalUsers.filter(
    (u) =>
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.companies && u.companies.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading users...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {users.length} user{users.length !== 1 ? "s" : ""} with access
          {pendingInvites.length > 0 &&
            ` • ${pendingInvites.length} pending invite${pendingInvites.length !== 1 ? "s" : ""}`}
        </p>
        {isVibeAdmin && (
          <div className="flex gap-2">
            <Button onClick={handleOpenAddExisting} size="sm" variant="outline">
              <Link className="h-4 w-4 mr-2" />
              Add Existing User
            </Button>
            <Button onClick={() => setShowInviteDialog(true)} size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite New User
            </Button>
          </div>
        )}
      </div>

      {users.length === 0 && pendingInvites.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No users have access to this company</p>
            {isVibeAdmin && (
              <div className="flex gap-2 justify-center mt-4">
                <Button onClick={handleOpenAddExisting} variant="outline">
                  <Link className="h-4 w-4 mr-2" />
                  Add Existing User
                </Button>
                <Button onClick={() => setShowInviteDialog(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite New User
                </Button>
              </div>
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
                    {user.email || `User ID: ${user.user_id.slice(0, 8)}...`}
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
                <div
                  key={invite.id}
                  className="border rounded-lg p-4 flex items-center justify-between bg-muted/30"
                >
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

      {/* Add Existing User Dialog */}
      <Dialog open={showAddExistingDialog} onOpenChange={setShowAddExistingDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Existing User</DialogTitle>
            <DialogDescription>
              Give an existing portal user access to {companyName || "this company"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Search Users</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select User</Label>
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {filteredPortalUsers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {allPortalUsers.length === 0
                      ? "Loading users..."
                      : "No matching users found"}
                  </div>
                ) : (
                  filteredPortalUsers.map((user) => (
                    <div
                      key={user.user_id}
                      className={`p-3 cursor-pointer border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                        selectedUserId === user.user_id ? "bg-primary/10" : ""
                      }`}
                      onClick={() => setSelectedUserId(user.user_id)}
                    >
                      <p className="font-medium text-sm">{user.email}</p>
                      {user.companies && user.companies.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Current: {user.companies.join(", ")}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company User</SelectItem>
                  <SelectItem value="admin">Company Admin</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Admins can manage products, orders, and invoices. Regular users have view-only access.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddExistingDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddExistingUser} disabled={adding || !selectedUserId}>
              {adding ? "Adding..." : "Add User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

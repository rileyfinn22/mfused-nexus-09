import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";

interface VendorInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  vendorName: string;
  companyId: string;
}

export default function VendorInviteDialog({
  open,
  onOpenChange,
  vendorId,
  vendorName,
  companyId,
}: VendorInviteDialogProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitationLink, setInvitationLink] = useState("");
  const [copied, setCopied] = useState(false);

  // Create account directly
  const [acctEmail, setAcctEmail] = useState("");
  const [acctPassword, setAcctPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);

  const { toast } = useToast();

  const handleInvite = async () => {
    if (!email.trim()) {
      toast({ title: "Email required", description: "Please enter a vendor email address", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("vendor_invitations")
        .insert({ email, vendor_id: vendorId, company_id: companyId, invited_by: user.id })
        .select()
        .single();

      if (error) throw error;

      const portalUrl = "https://vibepkgportal.com";
      const link = `${portalUrl}/vendor-signup?token=${data.invitation_token}`;
      setInvitationLink(link);

      toast({ title: "Invitation created", description: "Copy the link and send it to the vendor" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!acctPassword || acctPassword.length < 6) {
      toast({ title: "Password required", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-vendor-user", {
        body: {
          vendor_id: vendorId,
          company_id: companyId,
          email: acctEmail.trim() || undefined,
          password: acctPassword,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCreatedInfo({ email: data.email, password: acctPassword });
      toast({ title: "Vendor account created", description: `Login: ${data.email}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(invitationLink);
    setCopied(true);
    toast({ title: "Copied!", description: "Invitation link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setEmail("");
    setInvitationLink("");
    setCopied(false);
    setAcctEmail("");
    setAcctPassword("");
    setCreatedInfo(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vendor Portal Access: {vendorName}</DialogTitle>
          <DialogDescription>
            Send an invitation link or create a login account directly.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="create">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create Account</TabsTrigger>
            <TabsTrigger value="invite">Send Invite Link</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 pt-4">
            {createdInfo ? (
              <div className="space-y-3">
                <div className="rounded-md border p-3 space-y-2 bg-muted/40">
                  <div className="text-sm"><span className="text-muted-foreground">Email:</span> <span className="font-mono">{createdInfo.email}</span></div>
                  <div className="text-sm"><span className="text-muted-foreground">Password:</span> <span className="font-mono">{createdInfo.password}</span></div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Save these credentials — the password will not be shown again. The vendor can log in at the portal login page.
                </p>
                <Button onClick={handleClose} className="w-full">Done</Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="acctEmail">Email (optional)</Label>
                  <Input
                    id="acctEmail"
                    type="email"
                    value={acctEmail}
                    onChange={(e) => setAcctEmail(e.target.value)}
                    placeholder="Leave blank for a test account"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to auto-generate a placeholder email (e.g. for testing). The vendor will still log in with the generated email + password.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acctPassword">Password</Label>
                  <Input
                    id="acctPassword"
                    type="text"
                    value={acctPassword}
                    onChange={(e) => setAcctPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                <Button onClick={handleCreateAccount} disabled={creating} className="w-full">
                  {creating ? "Creating..." : "Create Vendor Account"}
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="invite" className="space-y-4 pt-4">
            {!invitationLink ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="vendorEmail">Vendor Email</Label>
                  <Input
                    id="vendorEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vendor@example.com"
                  />
                </div>
                <Button onClick={handleInvite} disabled={loading} className="w-full">
                  {loading ? "Creating..." : "Create Invitation"}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Invitation Link</Label>
                  <div className="flex gap-2">
                    <Input value={invitationLink} readOnly className="flex-1" />
                    <Button onClick={handleCopy} variant="outline" size="icon">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Link expires in 7 days. Send this to {email}
                  </p>
                </div>
                <Button onClick={handleClose} variant="outline" className="w-full">Done</Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}


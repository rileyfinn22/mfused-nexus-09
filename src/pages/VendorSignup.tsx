import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character');

export default function VendorSignup() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [invitationValid, setInvitationValid] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    validateInvitation();
  }, [token]);

  const validateInvitation = async () => {
    if (!token) {
      toast({
        title: "Invalid Link",
        description: "No invitation token found",
        variant: "destructive",
      });
      setValidating(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("vendor_invitations")
        .select(`
          *,
          vendors!inner(name)
        `)
        .eq("invitation_token", token)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !data) {
        toast({
          title: "Invalid or Expired",
          description: "This invitation link is invalid or has expired",
          variant: "destructive",
        });
        setInvitationValid(false);
      } else {
        setEmail(data.email);
        setVendorName(data.vendors.name);
        setInvitationValid(true);
      }
    } catch (error) {
      setInvitationValid(false);
    } finally {
      setValidating(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password
    const passwordValidation = passwordSchema.safeParse(password);
    if (!passwordValidation.success) {
      toast({
        title: "Invalid Password",
        description: passwordValidation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    try {
      // Create the user account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            vendor_invitation_token: token,
          },
        },
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error("User creation failed");

      // Accept the invitation (links vendor to user and creates role)
      const { data: acceptData, error: acceptError } = await supabase.rpc(
        "accept_vendor_invitation",
        {
          invitation_token_param: token,
          user_email: email,
        }
      );

      if (acceptError) throw acceptError;
      
      const result = acceptData as any;
      if (!result.success) throw new Error(result.error || "Failed to accept invitation");

      toast({
        title: "Success!",
        description: "Vendor account created successfully",
      });

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Validating invitation...</p>
      </div>
    );
  }

  if (!invitationValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid or has expired. Please contact your administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Vendor Sign Up</CardTitle>
          <CardDescription>
            Create your vendor account for {vendorName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min 8 chars, uppercase, number, special char"
              />
              <p className="text-xs text-muted-foreground">
                Must contain at least 8 characters, including uppercase, lowercase, number, and special character
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating Account..." : "Create Vendor Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

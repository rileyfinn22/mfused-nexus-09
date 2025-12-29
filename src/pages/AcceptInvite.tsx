import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character');

interface InvitationInfo {
  email: string;
  company_name: string;
  role: string;
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      validateInvitation();
    } else {
      setError("Invalid invitation link");
      setLoading(false);
    }
  }, [token]);

  const validateInvitation = async () => {
    try {
      // Fetch invitation details using raw query
      const { data, error } = await supabase
        .from('company_invitations')
        .select(`
          email,
          role,
          expires_at,
          companies (name)
        `)
        .eq('invitation_token', token)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error || !data) {
        setError("This invitation is invalid or has expired");
        return;
      }

      const companyData = data.companies as { name: string } | null;
      
      setInvitation({
        email: data.email,
        company_name: companyData?.name || 'Unknown Company',
        role: data.role,
      });
    } catch (err) {
      setError("Failed to validate invitation");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!invitation || !token) return;

    // Validate passwords match
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    // Validate password strength
    const passwordValidation = passwordSchema.safeParse(password);
    if (!passwordValidation.success) {
      toast({
        title: "Invalid Password",
        description: passwordValidation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Sign up the user
      const { error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        }
      });

      if (signUpError) throw signUpError;

      // Accept the invitation using the database function
      const { data: acceptResult, error: acceptError } = await supabase.rpc(
        'accept_company_invitation',
        {
          invitation_token_param: token,
          user_email: invitation.email
        }
      );

      if (acceptError) throw acceptError;

      const result = acceptResult as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to accept invitation');
      }

      toast({
        title: "Account created!",
        description: `Welcome to ${invitation.company_name}`,
      });

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">Validating invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center">
            <XCircle className="h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-lg font-semibold">Invalid Invitation</h2>
            <p className="mt-2 text-muted-foreground text-center">{error}</p>
            <Button className="mt-6" onClick={() => navigate('/login')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm text-green-500 font-medium">Valid Invitation</span>
          </div>
          <CardTitle>Create Your Account</CardTitle>
          <CardDescription>
            You've been invited to join <strong>{invitation?.company_name}</strong> as a {invitation?.role === 'admin' ? 'Company Admin' : 'Company User'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAcceptInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={invitation?.email || ""}
                disabled
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
                placeholder="Min 8 chars, uppercase, number, special char"
              />
              <p className="text-xs text-muted-foreground">
                Must contain at least 8 characters, including uppercase, lowercase, number, and special character
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter your password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account & Join
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

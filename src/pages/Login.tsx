import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Check for invoice redirect context
  const invoiceId = searchParams.get("invoice");
  const redirectTo = searchParams.get("redirect");

  // Store invoice context in sessionStorage when we have it from URL
  useEffect(() => {
    if (invoiceId) {
      sessionStorage.setItem("pendingInvoiceAccess", invoiceId);
      if (redirectTo) {
        sessionStorage.setItem("pendingRedirect", redirectTo);
      }
    }
  }, [invoiceId, redirectTo]);

  // If the user is already logged in and this is an invoice deep-link, skip the login screen.
  useEffect(() => {
    if (!redirectTo) return;

    let active = true;

    const go = () => {
      if (!active) return;
      navigate(redirectTo);
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [redirectTo, navigate]);

  const associateWithInvoice = async (userEmail: string) => {
    const pendingInvoiceId = sessionStorage.getItem("pendingInvoiceAccess");
    if (!pendingInvoiceId) return { invoiceId: null as string | null, error: null as string | null };

    // Retry because right after sign-up the auth user may not be queryable by email yet.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { data, error } = await supabase.rpc("associate_customer_with_invoice", {
          p_invoice_id: pendingInvoiceId,
          p_user_email: userEmail,
        });

        if (error) {
          return { invoiceId: null, error: error.message };
        }

        const result = data as { success: boolean; company_id?: string; error?: string } | null;

        if (result?.success) {
          sessionStorage.removeItem("pendingInvoiceAccess");
          return { invoiceId: pendingInvoiceId, error: null };
        }

        if (result?.error === "User not found" && attempt < 4) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }

        return { invoiceId: null, error: result?.error || "Failed to connect your account to this invoice." };
      } catch (err: any) {
        return { invoiceId: null, error: err?.message || "Failed to connect your account to this invoice." };
      }
    }

    return { invoiceId: null, error: "Failed to connect your account to this invoice." };
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters");
        }

        const emailRedirectTo = `${window.location.origin}${redirectTo || "/dashboard"}`;

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
          },
        });
        if (error) throw error;

        // With auto-confirm enabled, we should be able to sign-in immediately.
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (!signInError && signInData.user) {
          const association = await associateWithInvoice(email);
          const associatedInvoiceId = association.invoiceId;

          if (association.error) {
            toast({
              title: "Account created",
              description: association.error,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Account created!",
              description: associatedInvoiceId
                ? "You now have access to view your invoice."
                : "Welcome to your portal.",
            });
          }

          const pendingRedirect = sessionStorage.getItem("pendingRedirect");
          sessionStorage.removeItem("pendingRedirect");

          navigate(
            pendingRedirect ||
              (associatedInvoiceId ? `/invoices/${associatedInvoiceId}` : "/dashboard")
          );
          return;
        }

        // If sign-in didn't work (e.g. email confirmation required), user must login after confirming email.
        toast({
          title: "Account created!",
          description: "Check your email to confirm, then log in to view the invoice.",
        });

        setIsSignUp(false);
        setPassword("");
        setConfirmPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        const association = await associateWithInvoice(email);
        const associatedInvoiceId = association.invoiceId;

        if (association.error) {
          toast({
            title: "Logged in, but not linked",
            description: association.error,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Welcome back!",
            description: "You've been logged in successfully",
          });
        }

        const pendingRedirect = sessionStorage.getItem("pendingRedirect");
        sessionStorage.removeItem("pendingRedirect");

        if (associatedInvoiceId) {
          navigate(pendingRedirect || `/invoices/${associatedInvoiceId}`);
        } else if (pendingRedirect) {
          navigate(pendingRedirect);
        } else {
          navigate("/dashboard");
        }
      }
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

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isSignUp ? "Sign Up" : "Login"}</CardTitle>
          <CardDescription>
            {invoiceId 
              ? (isSignUp 
                  ? "Create an account to view your invoice" 
                  : "Log in to view your invoice")
              : (isSignUp 
                  ? "Create your account" 
                  : "Login to your company portal")
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
                placeholder="Enter your password"
              />
            </div>
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm your password"
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : (isSignUp ? "Sign Up" : "Login")}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-2">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setPassword("");
                setConfirmPassword("");
              }}
              className="text-sm text-muted-foreground hover:text-primary block w-full"
            >
              {isSignUp ? "Already have an account? Login" : "Need an account? Sign Up"}
            </button>
            {!isSignUp && (
              <a
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:text-primary block"
              >
                Forgot password?
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

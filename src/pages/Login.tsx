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

  const associateWithInvoice = async (userEmail: string) => {
    const pendingInvoiceId = sessionStorage.getItem("pendingInvoiceAccess");
    if (!pendingInvoiceId) return null;

    try {
      const { data, error } = await supabase.rpc("associate_customer_with_invoice", {
        p_invoice_id: pendingInvoiceId,
        p_user_email: userEmail,
      });

      if (error) {
        console.error("Error associating customer:", error);
        return null;
      }

      const result = data as { success: boolean; company_id?: string; error?: string };
      if (result.success) {
        // Clear the pending invoice access
        sessionStorage.removeItem("pendingInvoiceAccess");
        return pendingInvoiceId;
      }
      return null;
    } catch (err) {
      console.error("Error associating customer:", err);
      return null;
    }
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
        
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`
          }
        });
        if (error) throw error;
        
        // After signup, try to associate with invoice if pending
        const associatedInvoiceId = await associateWithInvoice(email);
        
        toast({
          title: "Account created!",
          description: associatedInvoiceId 
            ? "You now have access to view your invoice."
            : "You can now log in with your credentials.",
        });
        
        // If we associated with an invoice, auto-login and redirect
        if (associatedInvoiceId) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (!signInError) {
            const pendingRedirect = sessionStorage.getItem("pendingRedirect");
            sessionStorage.removeItem("pendingRedirect");
            navigate(pendingRedirect || `/invoices/${associatedInvoiceId}`);
            return;
          }
        }
        
        setIsSignUp(false);
        setPassword("");
        setConfirmPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        // After login, try to associate with invoice if pending
        const associatedInvoiceId = await associateWithInvoice(email);
        
        toast({
          title: "Welcome back!",
          description: "You've been logged in successfully",
        });
        
        // Redirect to pending invoice or dashboard
        const pendingRedirect = sessionStorage.getItem("pendingRedirect");
        sessionStorage.removeItem("pendingRedirect");
        
        if (associatedInvoiceId) {
          navigate(pendingRedirect || `/invoices/${associatedInvoiceId}`);
        } else if (pendingRedirect) {
          navigate(pendingRedirect);
        } else {
          navigate('/dashboard');
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

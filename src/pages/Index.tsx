import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  // If the user is already authenticated, take them straight into the app.
  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) navigate("/dashboard", { replace: true });
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Welcome to VibePKG Portal</h1>
        <p className="text-xl text-muted-foreground">Manage your packaging and orders</p>
        <div className="flex gap-4 justify-center">
          <Button onClick={() => navigate('/login')} size="lg">
            Login
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;

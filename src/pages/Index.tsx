import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  // If the user is already authenticated, take them straight into the app.
  useEffect(() => {
    let active = true;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session) return;

      // Check if user is finance-only — send them straight to /financing
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id);

      const roleList = (roles || []).map((r: any) => r.role);
      if (roleList.length === 1 && roleList[0] === "finance") {
        navigate("/financing", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    })();

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

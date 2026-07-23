import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { ThemeToggle } from "./ThemeToggle";
import { useCompany } from "@/contexts/CompanyContext";
import { CompanyHeaderSwitcher } from "./CompanyHeaderSwitcher";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeCompany, loading: companyLoading, isFinancePortalUser, isForwarderPortalUser, isVendorPortalUser } = useCompany();
  const [loading, setLoading] = useState(true);

  // Finance portal users should only ever see /financing routes
  useEffect(() => {
    if (!companyLoading && isFinancePortalUser) {
      const path = window.location.pathname;
      if (!path.startsWith('/financing')) {
        navigate('/financing', { replace: true });
      }
    }
  }, [isFinancePortalUser, companyLoading, navigate]);

  // Forwarder portal users should only ever see /forwarder routes
  useEffect(() => {
    if (!companyLoading && isForwarderPortalUser) {
      const path = window.location.pathname;
      if (!path.startsWith('/forwarder')) {
        navigate('/forwarder/orders', { replace: true });
      }
    }
  }, [isForwarderPortalUser, companyLoading, navigate]);

  // Vendor portal users should only ever see /vendor-portal routes
  useEffect(() => {
    if (!companyLoading && isVendorPortalUser) {
      const path = window.location.pathname;
      if (!path.startsWith('/vendor-portal')) {
        navigate('/vendor-portal', { replace: true });
      }
    }
  }, [isVendorPortalUser, companyLoading, navigate]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_OUT') {
          navigate('/login');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!companyLoading) {
      if (!activeCompany && !isFinancePortalUser && !isForwarderPortalUser && !isVendorPortalUser) {
        navigate('/login');
      }
      setLoading(false);
    }
  }, [companyLoading, activeCompany, isFinancePortalUser, isForwarderPortalUser, isVendorPortalUser, navigate]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Logged out",
        description: "You've been logged out successfully",
      });
      navigate('/login');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const companyName = activeCompany?.name || "Packaging Portal";

  if (loading || companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Modern header */}
          <header className="h-14 border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-40 flex items-center px-4 gap-4">
            <SidebarTrigger className="h-9 w-9 shrink-0" />
            
            <div className="flex-1 min-w-0">
              {/* Header company indicator + switcher (for multi-company users) */}
              <CompanyHeaderSwitcher />
              {/* Fallback text while company is still resolving */}
              {!activeCompany && (
                <h1 className="text-sm font-medium text-foreground truncate">
                  {companyName}
                </h1>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <NotificationsDropdown />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Logout</span>
              </Button>
            </div>
          </header>
          
          {/* Main content with proper padding */}
          <main className="flex-1 p-6 overflow-auto">
            <div className="animate-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
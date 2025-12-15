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

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState("Packaging Portal");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setCompanyName("Packaging Portal");
          navigate('/login');
        } else if (event === 'SIGNED_IN' && session?.user) {
          setTimeout(() => {
            fetchCompanyName(session.user.id);
          }, 0);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchCompanyName = async (userId: string) => {
    try {
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('company_id, role')
        .eq('user_id', userId)
        .maybeSingle();

      if (roleError) {
        console.error('Error fetching user role:', roleError);
        return;
      }

      if (userRole?.role === 'vendor') {
        const { data: vendor } = await supabase
          .from('vendors')
          .select('name, company_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (vendor) {
          setCompanyName(vendor.name);
          return;
        }
      }

      if (userRole?.company_id) {
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('name')
          .eq('id', userRole.company_id)
          .maybeSingle();

        if (companyError) {
          console.error('Error fetching company:', companyError);
          return;
        }

        if (company) {
          setCompanyName(company.name);
        }
      }
    } catch (error) {
      console.error('Error fetching company name:', error);
    }
  };

  const checkAuth = async () => {
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth check timeout')), 5000)
      );
      
      const authPromise = supabase.auth.getUser();
      const { data: { user } } = await Promise.race([authPromise, timeoutPromise]) as any;
      
      if (!user) {
        navigate('/login');
        return;
      }

      await fetchCompanyName(user.id);
    } catch (error) {
      console.error('Auth check error:', error);
      if (error instanceof Error && error.message === 'Auth check timeout') {
        console.error('Auth check timed out - showing default state');
      } else {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
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
        <AppSidebar companyName={companyName} />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Modern header */}
          <header className="h-14 border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-40 flex items-center px-4 gap-4">
            <SidebarTrigger className="h-9 w-9 shrink-0" />
            
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-medium text-foreground truncate">
                {companyName}
              </h1>
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
            <div className="max-w-7xl mx-auto animate-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
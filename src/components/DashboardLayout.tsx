import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { NotificationsDropdown } from "./NotificationsDropdown";

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
    
    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setCompanyName("Packaging Portal");
          navigate('/login');
        } else if (event === 'SIGNED_IN' && session?.user) {
          // Use setTimeout to defer the Supabase call
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
      console.log('Fetching company for user:', userId);
      // Get user's company
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('company_id, role')
        .eq('user_id', userId)
        .maybeSingle();

      console.log('User role result:', userRole, roleError);

      if (roleError) {
        console.error('Error fetching user role:', roleError);
        return;
      }

      // If user is a vendor, get vendor name instead
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

        console.log('Company result:', company, companyError);

        if (companyError) {
          console.error('Error fetching company:', companyError);
          return;
        }

        if (company) {
          console.log('Setting company name to:', company.name);
          setCompanyName(company.name);
        }
      }
    } catch (error) {
      console.error('Error fetching company name:', error);
    }
  };

  const checkAuth = async () => {
    try {
      console.log('Checking auth...');
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth check timeout')), 5000)
      );
      
      const authPromise = supabase.auth.getUser();
      const { data: { user } } = await Promise.race([authPromise, timeoutPromise]) as any;
      
      console.log('User:', user);
      
      if (!user) {
        console.log('No user found, redirecting to login');
        navigate('/login');
        return;
      }

      console.log('User found, fetching company name');
      await fetchCompanyName(user.id);
    } catch (error) {
      console.error('Auth check error:', error);
      // Don't redirect on timeout, just stop loading
      if (error instanceof Error && error.message === 'Auth check timeout') {
        console.error('Auth check timed out - showing default state');
      } else {
        navigate('/login');
      }
    } finally {
      console.log('Setting loading to false');
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar companyName={companyName} />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-6">
            <SidebarTrigger className="mr-4" />
            <div className="flex-1">
              <h1 className="text-lg font-semibold">{companyName} Portal</h1>
            </div>
            <div className="flex items-center gap-2">
              <NotificationsDropdown />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </header>
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
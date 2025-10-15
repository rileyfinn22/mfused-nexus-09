import { 
  LayoutDashboard, 
  Package, 
  Archive, 
  ClipboardList, 
  FileText, 
  Image, 
  Truck,
  FolderOpen,
  Building2,
  Factory
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const customerNavigationItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Products", url: "/products", icon: Package },
  { title: "Inventory", url: "/inventory", icon: Archive },
  { title: "Orders", url: "/orders", icon: ClipboardList },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Artwork", url: "/artwork", icon: Image },
  { title: "Pull & Ship", url: "/pull-ship", icon: Truck },
  { title: "My POs", url: "/my-pos", icon: FolderOpen },
];

const vibeAdminNavigationItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "All Orders", url: "/orders", icon: ClipboardList },
  { title: "Production", url: "/production", icon: Factory },
  { title: "Pull & Ship", url: "/pull-ship", icon: Truck },
  { title: "Vendors", url: "/vendors", icon: Building2 },
  { title: "Vendor POs", url: "/vendor-pos", icon: FolderOpen },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Products", url: "/products", icon: Package },
  { title: "Inventory", url: "/inventory", icon: Archive },
  { title: "Artwork", url: "/artwork", icon: Image },
];

interface AppSidebarProps {
  companyName: string;
}

export function AppSidebar({ companyName }: AppSidebarProps) {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);

  useEffect(() => {
    checkVibeAdmin();
  }, []);

  const checkVibeAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      setIsVibeAdmin((data?.role as string) === 'vibe_admin');
    }
  };

  const navigationItems = isVibeAdmin ? vibeAdminNavigationItems : customerNavigationItems;

  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive 
      ? "bg-sidebar-accent text-sidebar-primary font-medium" 
      : "hover:bg-sidebar-accent/50 text-sidebar-foreground";

  const isCollapsed = state === "collapsed";
  const companyInitial = companyName.charAt(0).toUpperCase();

  return (
    <Sidebar
      className={isCollapsed ? "w-16" : "w-64"}
      collapsible="icon"
    >
      <SidebarContent>
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">{companyInitial}</span>
            </div>
            {!isCollapsed && (
              <div>
                <h2 className="font-semibold text-sidebar-foreground">{companyName}</h2>
                <p className="text-xs text-muted-foreground">Packaging Portal</p>
              </div>
            )}
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={getNavCls}>
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
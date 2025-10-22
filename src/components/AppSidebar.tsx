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
  Factory,
  Settings,
  BarChart3
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
  { title: "Production", url: "/production", icon: Factory },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Artwork", url: "/artwork", icon: Image },
  { title: "Pull & Ship", url: "/pull-ship", icon: Truck },
  { title: "My POs", url: "/my-pos", icon: FolderOpen },
  { title: "Settings", url: "/settings", icon: Settings },
];

const vibeAdminNavigationItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "All Orders", url: "/orders", icon: ClipboardList },
  { title: "Production", url: "/production", icon: Factory },
  { title: "Create Pull & Ship", url: "/pull-ship", icon: Truck },
  { title: "Pull & Ship Orders", url: "/pull-ship-orders", icon: FileText },
  { title: "Vendors", url: "/vendors", icon: Building2 },
  { title: "Vendor POs", url: "/vendor-pos", icon: FolderOpen },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Products", url: "/products", icon: Package },
  { title: "Inventory", url: "/inventory", icon: Archive },
  { title: "Artwork", url: "/artwork", icon: Image },
  { title: "Reports", url: "/reports", icon: BarChart3 },
];

const vendorNavigationItems = [
  { title: "My Production", url: "/production", icon: Factory },
];

interface AppSidebarProps {
  companyName: string;
}

export function AppSidebar({ companyName }: AppSidebarProps) {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);

  useEffect(() => {
    checkRole();
  }, []);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      const role = data?.role as string;
      setIsVibeAdmin(role === 'vibe_admin');
      setIsVendor(role === 'vendor');
    }
  };

  const navigationItems = isVendor 
    ? vendorNavigationItems 
    : (isVibeAdmin ? vibeAdminNavigationItems : customerNavigationItems);

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
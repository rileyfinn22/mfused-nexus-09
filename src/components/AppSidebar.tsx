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
  BarChart3,
  Users,
  ChevronRight
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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
  { title: "Companies", url: "/customers", icon: Building2 },
  { title: "Products", url: "/products", icon: Package },
  { title: "Inventory", url: "/inventory", icon: Archive },
  { title: "Artwork", url: "/artwork", icon: Image },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
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
  const isCollapsed = state === "collapsed";
  const companyInitial = companyName.charAt(0).toUpperCase();

  return (
    <Sidebar
      className={cn(
        "border-r border-sidebar-border bg-sidebar transition-all duration-200",
        isCollapsed ? "w-[60px]" : "w-[240px]"
      )}
      collapsible="icon"
    >
      <SidebarContent className="py-4">
        {/* Logo/Brand area */}
        <div className={cn(
          "px-4 mb-6 transition-all duration-200",
          isCollapsed ? "px-2" : "px-4"
        )}>
          <div className={cn(
            "flex items-center gap-3",
            isCollapsed && "justify-center"
          )}>
            <div className="w-9 h-9 bg-gradient-primary rounded-lg flex items-center justify-center shadow-glow shrink-0">
              <span className="text-primary-foreground font-bold text-sm">{companyInitial}</span>
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-sidebar-foreground text-sm truncate">{companyName}</h2>
                <p className="text-[10px] text-muted-foreground">Invoice Portal</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="px-2 space-y-0.5">
              {navigationItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="p-0">
                      <NavLink 
                        to={item.url} 
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 group",
                          active 
                            ? "bg-primary/10 text-primary" 
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          isCollapsed && "justify-center px-2"
                        )}
                      >
                        <item.icon className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground"
                        )} />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-sm font-medium">{item.title}</span>
                            {active && (
                              <ChevronRight className="h-4 w-4 text-primary" />
                            )}
                          </>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
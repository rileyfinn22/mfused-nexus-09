import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, CheckCircle2, Clock, Circle, ChevronRight, Factory, CalendarClock, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ProductionProgressBar, ProductionStatusIndicator } from "@/components/ProductionProgressBar";
import { cn } from "@/lib/utils";

interface ProductionOrder {
  id: string;
  order_number: string;
  customer_name: string;
  order_date: string;
  company_id: string;
  po_number: string | null;
  description: string | null;
  shipping_state: string;
  total: number;
  estimated_delivery_date: string | null;
  companies: {
    name: string;
  };
  production_progress?: number;
}

export default function Production() {
  const navigate = useNavigate();
const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [completedOrders, setCompletedOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (roleChecked) {
      fetchProductionOrders();
    }
  }, [roleChecked, isVibeAdmin, isVendor, vendorId]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRoleChecked(true);
      return;
    }

    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const role = data?.role as string;
    setIsVibeAdmin(role === 'vibe_admin');
    setIsVendor(role === 'vendor');

    if (role === 'vendor') {
      // Get vendor ID for this user
      const { data: vendorData } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      setVendorId(vendorData?.id || null);
    }
    
    setRoleChecked(true);
  };

  const fetchProductionOrders = async () => {
    try {
      let ordersData: any[] = [];
      let completedOrdersData: any[] = [];

      if (isVendor && vendorId) {
        // Vendors: get orders where they have assigned stages (exclude pull_ship)
        const { data: stages, error: stagesError } = await supabase
          .from('production_stages')
          .select('order_id')
          .eq('vendor_id', vendorId);

        if (stagesError) throw stagesError;

        const orderIds = [...new Set(stages?.map(s => s.order_id) || [])];
        
        if (orderIds.length > 0) {
          // Fetch in-production orders
          const { data, error } = await supabase
            .from('orders')
            .select(`
              id,
              order_number,
              customer_name,
              order_date,
              company_id,
              po_number,
              description,
              shipping_state,
              total,
              estimated_delivery_date,
              companies (
                name
              )
            `)
            .in('id', orderIds)
            .eq('status', 'in production')
            .neq('order_type', 'pull_ship')
            .is('parent_order_id', null)
            .order('order_date', { ascending: false });

          if (error) throw error;
          ordersData = data || [];

          // Fetch completed orders
          const { data: completedData, error: completedError } = await supabase
            .from('orders')
            .select(`
              id,
              order_number,
              customer_name,
              order_date,
              company_id,
              po_number,
              description,
              shipping_state,
              total,
              estimated_delivery_date,
              companies (
                name
              )
            `)
            .in('id', orderIds)
            .in('status', ['shipped', 'delivered', 'completed'])
            .neq('order_type', 'pull_ship')
            .is('parent_order_id', null)
            .order('order_date', { ascending: false });

          if (completedError) throw completedError;
          completedOrdersData = completedData || [];
        }
      } else {
        // Admin/Customer: get all production orders (exclude pull_ship and child orders)
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            customer_name,
            order_date,
            company_id,
            po_number,
            description,
            shipping_state,
            total,
            estimated_delivery_date,
            companies (
              name
            )
          `)
          .eq('status', 'in production')
          .neq('order_type', 'pull_ship')
          .is('parent_order_id', null)
          .order('order_date', { ascending: false });

        if (error) throw error;
        ordersData = data || [];

        // Fetch completed orders for admin/customer
        const { data: completedData, error: completedError } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            customer_name,
            order_date,
            company_id,
            po_number,
            description,
            shipping_state,
            total,
            estimated_delivery_date,
            companies (
              name
            )
          `)
          .in('status', ['shipped', 'delivered', 'completed'])
          .neq('order_type', 'pull_ship')
          .is('parent_order_id', null)
          .order('order_date', { ascending: false });

        if (completedError) throw completedError;
        completedOrdersData = completedData || [];
      }
      
      // Fetch production stages for each order to calculate progress
      const ordersWithProgress = await Promise.all(
        ordersData.map(async (order) => {
          let stagesQuery = supabase
            .from('production_stages')
            .select('status')
            .eq('order_id', order.id);

          // Vendors only see their assigned stages
          if (isVendor && vendorId) {
            stagesQuery = stagesQuery.eq('vendor_id', vendorId);
          }

          const { data: stages } = await stagesQuery;
          const progress = calculateProgress(stages || []);
          return { ...order, production_progress: progress };
        })
      );

      // Mark completed orders with 100% progress
      const completedWithProgress = completedOrdersData.map(order => ({
        ...order,
        production_progress: 100
      }));
      
      setOrders(ordersWithProgress);
      setCompletedOrders(completedWithProgress);
    } catch (error: any) {
      console.error('Error fetching production orders:', error);
      toast({
        title: "Error",
        description: "Failed to load production orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = (stages: any[]) => {
    if (stages.length === 0) return 0;
    // Each stage contributes 20% max: 10% for in_progress, 20% for completed
    const maxPerStage = 100 / stages.length;
    const progressPerStage = maxPerStage / 2; // Half for in_progress, full for completed
    
    let totalProgress = 0;
    stages.forEach(stage => {
      if (stage.status === 'completed') {
        totalProgress += maxPerStage; // Full 20% (or proportional amount)
      } else if (stage.status === 'in_progress') {
        totalProgress += progressPerStage; // Half = 10% (or proportional amount)
      }
    });
    
    return Math.round(totalProgress);
  };

  const filteredOrders = orders.filter(order =>
    order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (isVibeAdmin && order.companies.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredCompletedOrders = completedOrders.filter(order =>
    order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (isVibeAdmin && order.companies.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const getProgressStatus = (progress: number) => {
    if (progress >= 100) return { icon: CheckCircle2, color: 'text-green-500', label: 'Complete' };
    if (progress > 0) return { icon: Clock, color: 'text-blue-500', label: 'In Progress' };
    return { icon: Circle, color: 'text-muted-foreground', label: 'Pending' };
  };

  const OrderCard = ({ order }: { order: ProductionOrder }) => {
    const progress = order.production_progress || 0;
    const status = getProgressStatus(progress);
    const StatusIcon = status.icon;

    const formatDeliveryDate = (dateStr: string | null) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      const today = new Date();
      const diffTime = date.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (diffDays < 0) return { text: formatted, status: 'overdue' as const };
      if (diffDays <= 7) return { text: formatted, status: 'soon' as const };
      return { text: formatted, status: 'normal' as const };
    };

    const deliveryInfo = formatDeliveryDate(order.estimated_delivery_date);

    return (
      <div
        className={cn(
          "group border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer",
          progress >= 100 ? "border-green-500/30 bg-green-50/5" :
          progress > 0 ? "border-blue-500/30 bg-blue-50/5" :
          "border-border bg-card"
        )}
        onClick={() => navigate(`/production/${order.id}`)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-semibold text-foreground">{order.order_number}</span>
              <Badge variant="outline" className="text-xs">{order.shipping_state}</Badge>
            </div>
            {isVibeAdmin && (
              <p className="text-sm font-medium text-foreground truncate">{order.companies?.name || '-'}</p>
            )}
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0">
            <ProductionStatusIndicator progress={progress} size="md" />
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>
        
        {/* Description - More Prominent */}
        {order.description && (
          <div className="mt-2 flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-snug">{order.description}</p>
          </div>
        )}
        
        <div className="mt-3">
          <ProductionProgressBar progress={progress} size="sm" />
        </div>
        
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>${order.total?.toFixed(2)}</span>
          <div className="flex items-center gap-3">
            {deliveryInfo && (
              <span className={cn(
                "flex items-center gap-1 font-medium",
                deliveryInfo.status === 'overdue' && "text-red-600",
                deliveryInfo.status === 'soon' && "text-amber-600",
                deliveryInfo.status === 'normal' && "text-muted-foreground"
              )}>
                <CalendarClock className="h-3.5 w-3.5" />
                Est. {deliveryInfo.text}
              </span>
            )}
            <span>{new Date(order.order_date).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    );
  };

  const OrderTable = ({ orderList, title, emptyMessage }: { orderList: ProductionOrder[], title: string, emptyMessage: string }) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Factory className="h-5 w-5 text-primary" />
          {title}
          <Badge variant="secondary" className="ml-2">{orderList.length}</Badge>
        </h2>
      </div>
      
      {orderList.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <Circle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderList.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {isVendor ? "My Production Orders" : "Production Tracking"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isVendor 
                ? "View and update your assigned production stages" 
                : "Monitor orders in production and track stage progress"}
            </p>
          </div>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="space-y-8">
          {/* In Production Orders */}
          <OrderTable 
            orderList={filteredOrders} 
            title="Orders in Production" 
            emptyMessage="No orders in production"
          />

          {/* Completed Orders */}
          {filteredCompletedOrders.length > 0 && (
            <OrderTable 
              orderList={filteredCompletedOrders} 
              title="Completed Orders" 
              emptyMessage="No completed orders"
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Loader2, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ProductionOrder {
  id: string;
  order_number: string;
  customer_name: string;
  order_date: string;
  company_id: string;
  po_number: string | null;
  shipping_state: string;
  total: number;
  companies: {
    name: string;
  };
  production_progress?: number;
}

export default function Production() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
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

      if (isVendor && vendorId) {
        // Vendors: get orders where they have assigned stages
        const { data: stages, error: stagesError } = await supabase
          .from('production_stages')
          .select('order_id')
          .eq('vendor_id', vendorId);

        if (stagesError) throw stagesError;

        const orderIds = [...new Set(stages?.map(s => s.order_id) || [])];
        
        if (orderIds.length > 0) {
          const { data, error } = await supabase
            .from('orders')
            .select(`
              id,
              order_number,
              customer_name,
              order_date,
              company_id,
              po_number,
              shipping_state,
              total,
              companies (
                name
              )
            `)
            .in('id', orderIds)
            .eq('status', 'in production')
            .order('order_date', { ascending: false });

          if (error) throw error;
          ordersData = data || [];
        }
      } else {
        // Admin/Customer: get all production orders
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            customer_name,
            order_date,
            company_id,
            po_number,
            shipping_state,
            total,
            companies (
              name
            )
          `)
          .eq('status', 'in production')
          .order('order_date', { ascending: false });

        if (error) throw error;
        ordersData = data || [];
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
      
      setOrders(ordersWithProgress);
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
    const completedStages = stages.filter(s => s.status === 'completed').length;
    return Math.round((completedStages / stages.length) * 100);
  };

  const filteredOrders = orders.filter(order =>
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-table-border pb-4">
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

        <div className="border border-table-border rounded">
          <div className="bg-table-header border-b border-table-border">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div className="col-span-2">Order #</div>
              {isVibeAdmin && <div className="col-span-2">Company</div>}
              <div className={isVibeAdmin ? "col-span-2" : "col-span-3"}>Customer</div>
              <div className="col-span-1">PO #</div>
              <div className="col-span-1">State</div>
              <div className="col-span-1">Total</div>
              <div className="col-span-2">Progress</div>
              <div className="col-span-1">Order Date</div>
            </div>
          </div>
          <div className="divide-y divide-table-border">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                Loading orders...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No orders in production
              </div>
            ) : (
              filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors cursor-pointer"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <div className="col-span-2 font-medium font-mono text-sm">{order.order_number}</div>
                  {isVibeAdmin && (
                    <div className="col-span-2 text-sm font-medium">{order.companies?.name || '-'}</div>
                  )}
                  <div className={isVibeAdmin ? "col-span-2 text-sm" : "col-span-3 text-sm"}>{order.customer_name}</div>
                  <div className="col-span-1 text-sm">{order.po_number || '-'}</div>
                  <div className="col-span-1">
                    <Badge variant="outline" className="text-xs">{order.shipping_state}</Badge>
                  </div>
                  <div className="col-span-1 text-sm">${order.total?.toFixed(2)}</div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <Progress value={order.production_progress || 0} className="h-2 flex-1" />
                      <span className="text-xs font-medium text-muted-foreground w-8">
                        {order.production_progress || 0}%
                      </span>
                    </div>
                  </div>
                  <div className="col-span-1 text-sm text-muted-foreground">
                    {new Date(order.order_date).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

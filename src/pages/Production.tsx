import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, CheckCircle2, Clock, Circle, ChevronRight, Factory, CalendarClock, FileText, CalendarDays, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ProductionProgressBar, ProductionStatusIndicator } from "@/components/ProductionProgressBar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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
  updated_at: string;
  status: string;
  companies: {
    name: string;
  };
  production_progress?: number;
}

interface Company {
  id: string;
  name: string;
}

export default function Production() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [completedOrders, setCompletedOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(searchParams.get('company') || 'all');

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (roleChecked && isVibeAdmin) {
      fetchCompanies();
    }
  }, [roleChecked, isVibeAdmin]);

  useEffect(() => {
    if (roleChecked) {
      fetchProductionOrders();
    }
  }, [roleChecked, isVibeAdmin, isVendor, vendorId, selectedCompanyId]);

  const handleCompanyChange = (value: string) => {
    setSelectedCompanyId(value);
    if (value === 'all') {
      searchParams.delete('company');
    } else {
      searchParams.set('company', value);
    }
    setSearchParams(searchParams);
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

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
              updated_at,
              status,
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
              updated_at,
              status,
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
        let query = supabase
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
            updated_at,
            status,
            companies (
              name
            )
          `)
          .eq('status', 'in production')
          .neq('order_type', 'pull_ship')
          .is('parent_order_id', null);

        // Apply company filter if selected
        if (selectedCompanyId && selectedCompanyId !== 'all') {
          query = query.eq('company_id', selectedCompanyId);
        }

        const { data, error } = await query.order('order_date', { ascending: false });

        if (error) throw error;
        ordersData = data || [];

        // Fetch completed orders for admin/customer
        let completedQuery = supabase
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
            updated_at,
            status,
            companies (
              name
            )
          `)
          .in('status', ['shipped', 'delivered', 'completed'])
          .neq('order_type', 'pull_ship')
          .is('parent_order_id', null);

        // Apply company filter if selected
        if (selectedCompanyId && selectedCompanyId !== 'all') {
          completedQuery = completedQuery.eq('company_id', selectedCompanyId);
        }

        const { data: completedData, error: completedError } = await completedQuery.order('order_date', { ascending: false });

        if (completedError) throw completedError;
        completedOrdersData = completedData || [];
      }
      
      // Fetch production stages for each order to calculate progress
      const ordersWithProgress = await Promise.all(
        ordersData.map(async (order) => {
          let stagesQuery = supabase
            .from('production_stages')
            .select('status, stage_name')
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

  // Weighted progress calculation: PO Sent 5% (admin only), Material 15%, Print 50%, QC 15%, Shipped 10%, Delivered 5%
  const STAGE_WEIGHTS: Record<string, number> = {
    'po_sent': 5,
    'production_proceeding_part_1': 15,
    'production_proceeding_part_2': 50,
    'complete_qc': 15,
    'shipped': 10,
    'delivered': 5,
  };

  const calculateProgress = (stages: any[]) => {
    if (stages.length === 0) return 0;
    
    let totalProgress = 0;
    stages.forEach(stage => {
      const weight = STAGE_WEIGHTS[stage.stage_name] || (100 / stages.length);
      if (stage.status === 'completed') {
        totalProgress += weight;
      } else if (stage.status === 'in_progress') {
        totalProgress += weight * 0.5; // In-progress = 50% of stage weight
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const getProgressStatus = (progress: number) => {
    if (progress >= 100) return { icon: CheckCircle2, color: 'text-green-500', label: 'Complete' };
    if (progress > 0) return { icon: Clock, color: 'text-blue-500', label: 'In Progress' };
    return { icon: Circle, color: 'text-muted-foreground', label: 'Pending' };
  };

  const handleUpdateDeliveryDate = async (orderId: string, date: Date | undefined) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          estimated_delivery_date: date ? format(date, 'yyyy-MM-dd') : null 
        })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setOrders(prev => prev.map(o => 
        o.id === orderId 
          ? { ...o, estimated_delivery_date: date ? format(date, 'yyyy-MM-dd') : null }
          : o
      ));
      setCompletedOrders(prev => prev.map(o => 
        o.id === orderId 
          ? { ...o, estimated_delivery_date: date ? format(date, 'yyyy-MM-dd') : null }
          : o
      ));

      toast({
        title: "Updated",
        description: date ? `Delivery date set to ${format(date, 'MMM d, yyyy')}` : "Delivery date cleared",
      });
    } catch (error: any) {
      console.error('Error updating delivery date:', error);
      toast({
        title: "Error",
        description: "Failed to update delivery date",
        variant: "destructive",
      });
    }
  };

  const OrderCard = ({ order }: { order: ProductionOrder }) => {
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const progress = order.production_progress || 0;
    const status = getProgressStatus(progress);
    const StatusIcon = status.icon;
    const isCompleted = ['shipped', 'delivered', 'completed'].includes(order.status);

    const formatDeliveryDate = (dateStr: string | null) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      const today = new Date();
      const diffTime = date.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (diffDays < 0) return { text: formatted, status: 'overdue' as const, date };
      if (diffDays <= 7) return { text: formatted, status: 'soon' as const, date };
      return { text: formatted, status: 'normal' as const, date };
    };

    const formatCompletionDate = (dateStr: string | null) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const deliveryInfo = formatDeliveryDate(order.estimated_delivery_date);
    const completionDate = isCompleted ? formatCompletionDate(order.updated_at) : null;

    return (
      <div
        className={cn(
          "group border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer",
          progress >= 100 ? "border-success/30 bg-success/5" :
          progress > 0 ? "border-info/30 bg-info/5" :
          "border-border bg-card"
        )}
        onClick={() => navigate(`/production/${order.id}`)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold text-lg text-foreground">{order.order_number}</span>
              {isVibeAdmin && (
                <span className="text-xs text-muted-foreground">({order.companies?.name || '-'})</span>
              )}
            </div>
            
            {/* Description - Prominent */}
            {order.description && (
              <p className="text-sm text-foreground leading-snug line-clamp-2">{order.description}</p>
            )}
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0">
            <ProductionStatusIndicator progress={progress} size="md" />
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>

        {/* Date Badges Row - Side by Side */}
        <div className="mt-3 flex items-center gap-3">
          {/* Delivery Date */}
          {deliveryInfo && (
            <Badge 
              variant={isCompleted ? "success" : "secondary"}
              className="text-xs px-2.5 py-1 flex items-center gap-1.5"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Delivery:</span> {deliveryInfo.text}
            </Badge>
          )}
          
          {/* Completion Date */}
          {completionDate && (
            <Badge 
              variant="success"
              className="text-xs px-2.5 py-1 flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Completion:</span> {completionDate}
            </Badge>
          )}
        </div>

        {/* Editable Delivery Date for Vibe Admins */}
        {isVibeAdmin && !isCompleted && (
          <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 text-xs gap-1.5 font-normal",
                    deliveryInfo?.status === 'overdue' && "border-danger/50 text-danger hover:bg-danger/10",
                    deliveryInfo?.status === 'soon' && "border-warning/50 text-warning hover:bg-warning/10",
                    !deliveryInfo && "text-muted-foreground"
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  {deliveryInfo ? `Est. ${deliveryInfo.text}` : "Set Delivery Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={order.estimated_delivery_date ? new Date(order.estimated_delivery_date) : undefined}
                  onSelect={(date) => {
                    handleUpdateDeliveryDate(order.id, date);
                    setDatePickerOpen(false);
                  }}
                  initialFocus
                />
                {order.estimated_delivery_date && (
                  <div className="p-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground"
                      onClick={() => {
                        handleUpdateDeliveryDate(order.id, undefined);
                        setDatePickerOpen(false);
                      }}
                    >
                      Clear Date
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
        
        <div className="mt-3">
          <ProductionProgressBar progress={progress} size="sm" />
        </div>
        
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>${order.total?.toFixed(2)}</span>
          <span>{new Date(order.order_date).toLocaleDateString()}</span>
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

      <div className="flex flex-col sm:flex-row gap-3">
        {isVibeAdmin && (
          <Select value={selectedCompanyId} onValueChange={handleCompanyChange}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
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
  );
}

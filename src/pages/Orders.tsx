import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Search, 
  Plus, 
  Edit,
  Eye,
  CheckCircle,
  Trash2,
  Circle,
  Truck,
  Factory,
  Download
} from "lucide-react";
import { exportToCSV } from "@/lib/exportUtils";
import { EditableDescription } from "@/components/EditableDescription";

const Orders = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Read company filter from URL, default to "all"
  const companyFilter = searchParams.get("company") || "all";
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);

  // Update URL when company filter changes
  const setCompanyFilter = (value: string) => {
    if (value === "all") {
      searchParams.delete("company");
    } else {
      searchParams.set("company", value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isVibeAdmin !== null) {
      fetchOrders();
      if (isVibeAdmin) {
        fetchCompanies();
      }
    }
  }, [isVibeAdmin, companyFilter]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    setIsVibeAdmin(userRole?.role === 'vibe_admin');
  };

  const handleDescriptionChange = async (orderId: string, description: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ description: description || null })
      .eq("id", orderId);

    if (error) {
      console.error("Error updating order description:", error);
      return;
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, description: description || null } : o))
    );
  };

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setCompanies(data);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('*, order_items(*), companies(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Filter by company if not "all" and user is vibe_admin
    if (isVibeAdmin && companyFilter !== 'all') {
      query = query.eq('company_id', companyFilter);
    }

    const { data, error } = await query;
    
    if (!error && data) {
      // For non-vibe admins, filter out draft orders (they can only see pending and later)
      const filteredData = isVibeAdmin 
        ? data 
        : data.filter(order => order.status !== 'draft');
      
      // Fetch artwork approval status and production stages for all orders
      const ordersWithChecklist = await Promise.all(filteredData.map(async (order) => {
        // Fetch production stages for progress calculation
        let productionProgress = 0;
        if (order.status === 'in production') {
          const { data: stages } = await supabase
            .from('production_stages')
            .select('status')
            .eq('order_id', order.id);
          
          if (stages && stages.length > 0) {
            // Each stage contributes proportionally: 10% for in_progress, 20% for completed
            const maxPerStage = 100 / stages.length;
            const progressPerStage = maxPerStage / 2;
            
            let totalProgress = 0;
            stages.forEach(s => {
              if (s.status === 'completed') {
                totalProgress += maxPerStage;
              } else if (s.status === 'in_progress') {
                totalProgress += progressPerStage;
              }
            });
            productionProgress = Math.round(totalProgress);
          }
        }
        
        if (order.order_items && order.order_items.length > 0) {
          const { data: artworkData } = await supabase
            .from('artwork_files')
            .select('is_approved, sku')
            .in('sku', order.order_items.map((item: any) => item.sku));
          
          const allApproved = order.order_items.every((item: any) => 
            artworkData?.some((art: any) => art.sku === item.sku && art.is_approved)
          );
          
          return {
            ...order,
            artApproved: allApproved,
            checklistComplete: allApproved && order.order_finalized && order.vibe_processed,
            productionProgress
          };
        }
        return {
          ...order,
          artApproved: false,
          checklistComplete: false,
          productionProgress
        };
      }));
      
      setOrders(ordersWithChecklist);
    }
    setLoading(false);
  };

  const handleDeleteOrder = async () => {
    if (!deleteOrderId) return;

    try {
      // Get all invoices for this order
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', deleteOrderId)
        .is('deleted_at', null);

      // Soft delete all related invoices (this will trigger inventory restoration via existing logic)
      if (invoices && invoices.length > 0) {
        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', invoices.map(inv => inv.id));

        if (invoiceError) throw invoiceError;
      }

      // Soft delete the order
      const { error } = await supabase
        .from('orders')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteOrderId);

      if (error) throw error;

      fetchOrders();
    } catch (error: any) {
      console.error('Error deleting order:', error);
      alert(`Failed to delete order: ${error.message}`);
    }
    setDeleteOrderId(null);
  };

  const confirmDelete = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteOrderId(orderId);
  };

  const canEditOrder = (order: any) => {
    // Vibe admins can always edit
    if (isVibeAdmin) return true;
    
    // Can't edit if order is in production or later stages, or if vibe_processed
    const restrictedStatuses = ['in production', 'shipped', 'delivered'];
    return !restrictedStatuses.includes(order.status) && !order.vibe_processed;
  };

  const getProgressForStatus = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft': return 0;
      case 'pending': return 5;
      case 'pending_pull': return 5;
      case 'confirmed': return 15;
      case 'picked': return 30;
      case 'in production': return 50;
      case 'qc review': return 85;
      case 'ready to ship': return 100;
      case 'shipped': return 100;
      default: return 0;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft': return 'text-muted-foreground';
      case 'pending': return 'text-blue-500';
      case 'pending_pull': return 'text-blue-500';
      case 'picked': return 'text-blue-600';
      case 'order placed': return 'text-muted-foreground';
      case 'in production': return 'text-primary';
      case 'qc review': return 'text-warning';
      case 'ready to ship': return 'text-success';
      default: return 'text-muted-foreground';
    }
  };

  const getOrderTypeDisplay = (orderType: string, status?: string) => {
    if (orderType === 'pull_ship') {
      return {
        label: 'Pull & Ship',
        icon: Truck,
        badgeColor: 'bg-blue-600 text-white text-[10px] px-1.5 py-0.5',
        textColor: 'text-blue-600',
        show: true
      };
    }
    // Only show badge when status is actually 'in production'
    const isInProduction = status?.toLowerCase() === 'in production';
    return {
      label: 'Production',
      icon: Factory,
      badgeColor: 'bg-purple-600 text-white text-[10px] px-1.5 py-0.5',
      textColor: 'text-purple-600',
      show: isInProduction
    };
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (order.customer_name && order.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (order.companies?.name && order.companies.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || order.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    fetchOrders();
  }, [companyFilter]);

  const draftOrders = filteredOrders.filter(o => o.status.toLowerCase() === 'draft');
  const pendingOrdersList = filteredOrders.filter(o => 
    ['pending', 'pending_pull'].includes(o.status.toLowerCase()) ||
    // Include "in production" orders with 0% progress in pending section
    (o.status.toLowerCase() === 'in production' && o.productionProgress === 0 && o.order_type !== 'pull_ship' && !o.parent_order_id)
  );
  const completedStatuses = ['shipped', 'delivered', 'completed'];
  const productionOrders = filteredOrders.filter(o => 
    !['draft', 'pending', 'pending_pull'].includes(o.status.toLowerCase()) &&
    !completedStatuses.includes(o.status.toLowerCase()) &&
    o.order_type !== 'pull_ship' &&
    !o.parent_order_id &&
    // Exclude 0% progress orders (they show in pending)
    !(o.status.toLowerCase() === 'in production' && o.productionProgress === 0)
  );
  const completedOrders = filteredOrders.filter(o => 
    completedStatuses.includes(o.status.toLowerCase()) &&
    o.order_type !== 'pull_ship' &&
    !o.parent_order_id
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Orders & Production</h1>
          <p className="text-sm text-muted-foreground mt-1">Track order progress and production pipeline</p>
        </div>
        <div className="flex gap-3">
          <Button size="sm" variant="outline" onClick={() => exportToCSV(filteredOrders, 'orders')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => navigate("/orders/create")}>
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {isVibeAdmin && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Company" />
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="pending_pull">Pending Pull</SelectItem>
            <SelectItem value="picked">Picked</SelectItem>
            <SelectItem value="in production">In Production</SelectItem>
            <SelectItem value="qc review">QC Review</SelectItem>
            <SelectItem value="ready to ship">Ready to Ship</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-8">
        {/* Draft Orders */}
        {draftOrders.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium">Draft Orders - Incomplete</h2>
            <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
              <div className="bg-muted border-b-2 border-border">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-2">Order # / Type</div>
                  <div className="col-span-1">Date</div>
                  {isVibeAdmin && <div className="col-span-2">Company</div>}
                  <div className={isVibeAdmin ? "col-span-2" : "col-span-4"}>Description</div>
                  <div className="col-span-1">Total</div>
                  <div className="col-span-1">Status</div>
                  <div className="col-span-1">Est. Delivery</div>
                  <div className="col-span-2">Actions</div>
                </div>
              </div>
              <div className="divide-y divide-border">
                {draftOrders.map((order) => {
                  const estDelivery = order.estimated_delivery_date ? new Date(order.estimated_delivery_date).toLocaleDateString() : 'Not set';
                  const orderTypeInfo = getOrderTypeDisplay(order.order_type, order.status);
                  const OrderIcon = orderTypeInfo.icon;
                  
                  return (
                    <div 
                      key={order.id} 
                      className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/50 transition-colors even:bg-muted/40"
                    >
                      <div className="col-span-2 space-y-1">
                        <div className="font-medium font-mono text-sm">{order.order_number}</div>
                        {orderTypeInfo.show && (
                          <Badge variant="secondary" className={`${orderTypeInfo.badgeColor} flex items-center gap-0.5 w-fit font-normal`}>
                            <OrderIcon className="h-2.5 w-2.5" />
                            {orderTypeInfo.label}
                          </Badge>
                        )}
                      </div>
                      <div className="col-span-1 text-sm text-muted-foreground">
                        {order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}
                      </div>
                      {isVibeAdmin && (
                        <div className="col-span-2 text-sm font-medium">{order.companies?.name || '-'}</div>
                      )}
                      <div className={isVibeAdmin ? "col-span-2" : "col-span-4"}>
                        <EditableDescription 
                          value={order.description} 
                          onSave={(text) => handleDescriptionChange(order.id, text)} 
                        />
                      </div>
                      <div className="col-span-1 text-sm">${order.total?.toFixed(2)}</div>
                      <div className="col-span-1 text-sm capitalize text-muted-foreground">
                        Draft
                      </div>
                      <div className="col-span-1 text-sm text-muted-foreground">
                        {estDelivery}
                      </div>
                      <div className="col-span-2 flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(order.order_type === 'pull_ship' ? `/pull-ship-orders/${order.id}` : `/orders/${order.id}`);
                          }}
                          title="View Order"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        {canEditOrder(order) && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(order.order_type === 'pull_ship' ? `/pull-ship-orders/${order.id}` : `/orders/edit/${order.id}`);
                              }}
                              title="Edit Order"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={(e) => confirmDelete(order.id, e)}
                              title="Delete Order"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Pending Orders (Awaiting Production) */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Pending Orders - Awaiting Production</h2>
          <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
              <div className="bg-muted border-b-2 border-border">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-2">Order # / Type</div>
                  <div className="col-span-1">Date</div>
                  {isVibeAdmin && <div className="col-span-2">Company</div>}
                  <div className={isVibeAdmin ? "col-span-2" : "col-span-4"}>Description</div>
                  <div className="col-span-1">Total</div>
                  <div className="col-span-1">Checklist</div>
                  <div className="col-span-1">Est. Delivery</div>
                  <div className="col-span-2">Actions</div>
                </div>
              </div>
            <div className="divide-y divide-border">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading orders...
                </div>
              ) : pendingOrdersList.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No pending orders
                </div>
              ) : pendingOrdersList.map((order) => {
                const estDelivery = order.estimated_delivery_date ? new Date(order.estimated_delivery_date).toLocaleDateString() : 'Not set';
                const orderTypeInfo = getOrderTypeDisplay(order.order_type, order.status);
                const OrderIcon = orderTypeInfo.icon;
                
                return (
                  <div 
                    key={order.id} 
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/50 transition-colors even:bg-muted/40"
                  >
                    <div className="col-span-2 space-y-1">
                      <div className="font-medium font-mono text-base">{order.order_number}</div>
                      {orderTypeInfo.show && (
                        <Badge variant="secondary" className={`${orderTypeInfo.badgeColor} flex items-center gap-0.5 w-fit font-normal`}>
                          <OrderIcon className="h-2.5 w-2.5" />
                          {orderTypeInfo.label}
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-1 text-sm text-muted-foreground">
                      {order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}
                    </div>
                    {isVibeAdmin && (
                      <div className="col-span-2 text-sm font-medium">{order.companies?.name || '-'}</div>
                    )}
                    <div className={isVibeAdmin ? "col-span-2" : "col-span-4"}>
                      <EditableDescription 
                        value={order.description} 
                        onSave={(text) => handleDescriptionChange(order.id, text)} 
                      />
                    </div>
                    <div className="col-span-1 text-sm">${order.total?.toFixed(2)}</div>
                    <div className="col-span-1">
                      <div className="flex gap-1 items-center">
                        <div className="flex items-center" title="Art Approved">
                          {order.artApproved ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex items-center" title="Order Finalized">
                          {order.order_finalized ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex items-center" title="Vibe Processed">
                          {order.vibe_processed ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-1 text-sm text-muted-foreground">
                      {estDelivery}
                    </div>
                    <div className="col-span-2 flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={() => navigate(order.order_type === 'pull_ship' ? `/pull-ship-orders/${order.id}` : `/orders/${order.id}`)}
                        title="View Order"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      {canEditOrder(order) && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0"
                            onClick={() => navigate(order.order_type === 'pull_ship' ? `/pull-ship-orders/${order.id}` : `/orders/edit/${order.id}`)}
                            title="Edit Order"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={(e) => confirmDelete(order.id, e)}
                            title="Delete Order"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Production Orders */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Orders in Production</h2>
          <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
            <div className="bg-muted border-b-2 border-border">
              <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-2">Order # / Type</div>
                <div className="col-span-1">Date</div>
                {isVibeAdmin && <div className="col-span-2">Company</div>}
                <div className={isVibeAdmin ? "col-span-2" : "col-span-4"}>Description</div>
                <div className="col-span-1">Total</div>
                <div className="col-span-2">Progress</div>
                <div className="col-span-2">Actions</div>
              </div>
            </div>
            <div className="divide-y divide-border">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading orders...
                </div>
              ) : productionOrders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No orders in production
                </div>
              ) : productionOrders.map((order) => {
                // Use actual production progress for "in production" orders, otherwise use status-based progress
                const progress = order.status === 'in production' && order.productionProgress !== undefined 
                  ? order.productionProgress 
                  : getProgressForStatus(order.status);
                const estDelivery = order.estimated_delivery_date ? new Date(order.estimated_delivery_date).toLocaleDateString() : 'Not set';
                const orderTypeInfo = getOrderTypeDisplay(order.order_type, order.status);
                const OrderIcon = orderTypeInfo.icon;
                
                return (
                  <div 
                    key={order.id} 
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/50 transition-colors even:bg-muted/40"
                  >
                    <div className="col-span-2 space-y-1">
                      <div className="font-medium font-mono text-base">{order.order_number}</div>
                      {orderTypeInfo.show && (
                        <Badge variant="secondary" className={`${orderTypeInfo.badgeColor} flex items-center gap-0.5 w-fit font-normal`}>
                          <OrderIcon className="h-2.5 w-2.5" />
                          {orderTypeInfo.label}
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-1 text-sm text-muted-foreground">
                      {order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}
                    </div>
                    {isVibeAdmin && (
                      <div className="col-span-2 text-sm font-medium">{order.companies?.name || '-'}</div>
                    )}
                    <div className={isVibeAdmin ? "col-span-2" : "col-span-4"}>
                      <EditableDescription 
                        value={order.description} 
                        onSave={(text) => handleDescriptionChange(order.id, text)} 
                      />
                    </div>
                    <div className="col-span-1 text-sm">${order.total?.toFixed(2)}</div>
                    <div className="col-span-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className={`capitalize ${getStatusColor(order.status)}`}>{order.status.replace('_', ' ')}</span>
                        <span className="text-muted-foreground">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1" />
                    </div>
                    <div className="col-span-2 flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={() => navigate(order.order_type === 'pull_ship' ? `/pull-ship-orders/${order.id}` : `/orders/${order.id}`)}
                        title="View Order"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      {canEditOrder(order) && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0"
                            onClick={() => navigate(order.order_type === 'pull_ship' ? `/pull-ship-orders/${order.id}` : `/orders/edit/${order.id}`)}
                            title="Edit Order"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={(e) => confirmDelete(order.id, e)}
                            title="Delete Order"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Completed Orders */}
        {completedOrders.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium">Completed Orders</h2>
            <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
              <div className="bg-muted border-b-2 border-border">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-2">Order # / Type</div>
                  <div className="col-span-1">Date</div>
                  {isVibeAdmin && <div className="col-span-2">Company</div>}
                  <div className={isVibeAdmin ? "col-span-2" : "col-span-4"}>Description</div>
                  <div className="col-span-1">Total</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Actions</div>
                </div>
              </div>
              <div className="divide-y divide-border">
                {completedOrders.map((order) => {
                  const orderTypeInfo = getOrderTypeDisplay(order.order_type, order.status);
                  const OrderIcon = orderTypeInfo.icon;
                  
                  return (
                    <div 
                      key={order.id} 
                      className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/50 transition-colors even:bg-muted/40"
                    >
                      <div className="col-span-2 space-y-1">
                        <div className="font-medium font-mono text-base">{order.order_number}</div>
                        {orderTypeInfo.show && (
                          <Badge variant="secondary" className={`${orderTypeInfo.badgeColor} flex items-center gap-0.5 w-fit font-normal`}>
                            <OrderIcon className="h-2.5 w-2.5" />
                            {orderTypeInfo.label}
                          </Badge>
                        )}
                      </div>
                      <div className="col-span-1 text-sm text-muted-foreground">
                        {order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}
                      </div>
                      {isVibeAdmin && (
                        <div className="col-span-2 text-sm font-medium">{order.companies?.name || '-'}</div>
                      )}
                      <div className={isVibeAdmin ? "col-span-2" : "col-span-4"}>
                        <EditableDescription 
                          value={order.description} 
                          onSave={(text) => handleDescriptionChange(order.id, text)} 
                        />
                      </div>
                      <div className="col-span-1 text-sm">${order.total?.toFixed(2)}</div>
                      <div className="col-span-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </Badge>
                        </div>
                      </div>
                      <div className="col-span-2 flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0"
                          onClick={() => navigate(order.order_type === 'pull_ship' ? `/pull-ship-orders/${order.id}` : `/orders/${order.id}`)}
                          title="View Order"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={deleteOrderId !== null} onOpenChange={(open) => !open && setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone and will remove all associated data including vendor POs, invoices, and notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Orders;

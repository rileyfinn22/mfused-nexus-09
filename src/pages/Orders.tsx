import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

// Helper to parse date-only strings (YYYY-MM-DD) as local time, not UTC
const parseDateAsLocal = (dateStr: string | null): Date | undefined => {
  if (!dateStr) return undefined;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};
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
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { ExpandToggleButton, ExpandDetailsPanel } from "@/components/RowExpandPanel";

const Orders = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompanyId, isVibeAdmin } = useActiveCompany();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Read company filter from URL, default to "all" (only for vibe admins)
  const companyFilter = searchParams.get("company") || "all";
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpandedRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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
    fetchOrders();
    if (isVibeAdmin) {
      fetchCompanies();
    }
  }, [isVibeAdmin, companyFilter, activeCompanyId]);

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

    // For vibe admins: use URL company filter if set
    // For regular users: always filter by their active company
    if (isVibeAdmin) {
      if (companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }
    } else if (activeCompanyId) {
      // Non-admin users: filter by their active company
      query = query.eq('company_id', activeCompanyId);
    }

    const { data, error } = await query;
    
    if (!error && data) {
      // For non-vibe admins, filter out draft orders (they can only see pending and later)
      const filteredData = isVibeAdmin 
        ? data 
        : data.filter(order => order.status !== 'draft');
      
      // Fetch artwork approval status and production stages for all orders
      const ordersWithChecklist = await Promise.all(filteredData.map(async (order) => {
        // Use the manually-set production_progress from the database
        const completedStatuses = ['completed', 'shipped', 'delivered'];
        const productionProgress = completedStatuses.includes(order.status?.toLowerCase())
          ? 100
          : (order.production_progress ?? 0);
        
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
  const allNonDraftOrders = filteredOrders.filter(o => o.status.toLowerCase() !== 'draft');

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
const estDelivery = order.estimated_delivery_date ? parseDateAsLocal(order.estimated_delivery_date)?.toLocaleDateString() ?? 'Not set' : 'Not set';
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

        {/* All Orders */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">All Orders</h2>
          <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
            <div className="bg-muted border-b-2 border-border">
              <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-2">Order # / Type</div>
                <div className="col-span-1">Date</div>
                {isVibeAdmin && <div className="col-span-1">Company</div>}
                <div className={isVibeAdmin ? "col-span-2" : "col-span-3"}>Description</div>
                <div className="col-span-1">Total</div>
                <div className="col-span-2">Status / Progress</div>
                <div className="col-span-1">Est. Delivery</div>
                <div className="col-span-2">Actions</div>
              </div>
            </div>
            <div className="divide-y divide-border">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading orders...
                </div>
              ) : allNonDraftOrders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No orders found
                </div>
              ) : allNonDraftOrders.map((order) => {
                const progress = order.status === 'in production' && order.productionProgress !== undefined 
                  ? order.productionProgress 
                  : getProgressForStatus(order.status);
                const estDelivery = order.estimated_delivery_date ? parseDateAsLocal(order.estimated_delivery_date) ?? null : null;
                const today = new Date();
                const diffDays = estDelivery ? Math.ceil((estDelivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                const deliveryStatus = diffDays !== null 
                  ? diffDays < 0 ? 'overdue' : diffDays <= 7 ? 'soon' : 'normal'
                  : null;
                const orderTypeInfo = getOrderTypeDisplay(order.order_type, order.status);
                const OrderIcon = orderTypeInfo.icon;
                const completedStatuses = ['shipped', 'delivered', 'completed'];
                const isCompleted = completedStatuses.includes(order.status.toLowerCase());
                
                const isExpanded = expandedRows.has(order.id);
                return (
                  <div key={order.id}>
                  <div 
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
                      <div className="col-span-1 text-sm font-medium truncate">{order.companies?.name || '-'}</div>
                    )}
                    <div className={isVibeAdmin ? "col-span-2" : "col-span-3"}>
                      <EditableDescription 
                        value={order.description} 
                        onSave={(text) => handleDescriptionChange(order.id, text)} 
                      />
                    </div>
                    <div className="col-span-1 text-sm">${order.total?.toFixed(2)}</div>
                    <div className="col-span-2 space-y-1">
                      {isCompleted ? (
                        <Badge variant="success" className="flex items-center gap-1 w-fit">
                          <CheckCircle className="h-3 w-3" />
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </Badge>
                      ) : (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className={`capitalize ${getStatusColor(order.status)}`}>{order.status.replace('_', ' ')}</span>
                            {progress > 0 && <span className="text-muted-foreground">{progress}%</span>}
                          </div>
                          {progress > 0 && <Progress value={progress} className="h-1" />}
                          {!isCompleted && ['pending', 'pending_pull'].includes(order.status.toLowerCase()) && (
                            <div className="flex gap-1 items-center mt-0.5">
                              <div className="flex items-center" title="Art Approved">
                                {order.artApproved ? (
                                  <CheckCircle className="h-3 w-3 text-success" />
                                ) : (
                                  <Circle className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex items-center" title="Order Finalized">
                                {order.order_finalized ? (
                                  <CheckCircle className="h-3 w-3 text-success" />
                                ) : (
                                  <Circle className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex items-center" title="Vibe Processed">
                                {order.vibe_processed ? (
                                  <CheckCircle className="h-3 w-3 text-success" />
                                ) : (
                                  <Circle className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="col-span-1">
                      {estDelivery ? (
                        <Badge 
                          variant={deliveryStatus === 'overdue' ? 'danger' : deliveryStatus === 'soon' ? 'warning' : 'info'}
                          className="text-xs"
                        >
                          {estDelivery.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not set</span>
                      )}
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
                  {isExpanded && (
                    <ExpandDetailsPanel
                      details={[
                        { label: "Order Type", value: order.order_type || "standard" },
                        { label: "PO #", value: order.po_number || "—" },
                        { label: "Customer", value: order.customer_name || "—" },
                        { label: "Ship To", value: [order.shipping_city, order.shipping_state].filter(Boolean).join(", ") || "—" },
                        { label: "Items", value: order.order_items?.length ?? 0 },
                        { label: "Total Qty", value: (order.order_items || []).reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0).toLocaleString() },
                        { label: "Shipped Qty", value: (order.order_items || []).reduce((s: number, i: any) => s + (Number(i.shipped_quantity) || 0), 0).toLocaleString() },
                        { label: "Status", value: order.status },
                      ]}
                      items={order.order_items || []}
                      itemColumns={[
                        { key: "sku", label: "SKU", className: "font-mono text-xs" },
                        { key: "product_name", label: "Product" },
                        { key: "quantity", label: "Qty", render: (r) => Number(r.quantity || 0).toLocaleString() },
                        { key: "shipped_quantity", label: "Shipped", render: (r) => Number(r.shipped_quantity || 0).toLocaleString() },
                        { key: "unit_price", label: "Unit $", render: (r) => `$${Number(r.unit_price || 0).toFixed(2)}` },
                      ]}
                    />
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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

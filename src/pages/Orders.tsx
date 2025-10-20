import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  CheckCircle,
  Trash2,
  Circle,
  Truck,
  Factory,
  Download
} from "lucide-react";
import { exportToCSV } from "@/lib/exportUtils";

const Orders = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);

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
      .order('created_at', { ascending: false });

    // Filter by company if not "all" and user is vibe_admin
    if (isVibeAdmin && companyFilter !== 'all') {
      query = query.eq('company_id', companyFilter);
    }

    const { data, error } = await query;
    
    if (!error && data) {
      // Fetch artwork approval status for all orders
      const ordersWithChecklist = await Promise.all(data.map(async (order) => {
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
            checklistComplete: allApproved && order.order_finalized && order.vibe_processed
          };
        }
        return {
          ...order,
          artApproved: false,
          checklistComplete: false
        };
      }));
      
      setOrders(ordersWithChecklist);
    }
    setLoading(false);
  };

  const handleDeleteOrder = async () => {
    if (!deleteOrderId) return;

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', deleteOrderId);

    if (error) {
      console.error('Error deleting order:', error);
      alert('Failed to delete order');
    } else {
      fetchOrders();
    }
    setDeleteOrderId(null);
  };

  const confirmDelete = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteOrderId(orderId);
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

  const getOrderTypeDisplay = (orderType: string) => {
    if (orderType === 'pull_ship') {
      return {
        label: 'Pull & Ship',
        icon: Truck,
        badgeColor: 'bg-blue-500 text-white hover:bg-blue-600',
        textColor: 'text-blue-600'
      };
    }
    return {
      label: 'Production',
      icon: Factory,
      badgeColor: 'bg-purple-500 text-white hover:bg-purple-600',
      textColor: 'text-purple-600'
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
    ['pending', 'pending_pull'].includes(o.status.toLowerCase())
  );
  const productionOrders = filteredOrders.filter(o => 
    !['draft', 'pending', 'pending_pull'].includes(o.status.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-table-border pb-4">
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
            <div className="border border-table-border rounded">
              <div className="bg-table-header border-b border-table-border">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-2">Order # / Type</div>
                  {isVibeAdmin && <div className="col-span-2">Company</div>}
                  <div className={isVibeAdmin ? "col-span-1" : "col-span-2"}>PO #</div>
                  <div className="col-span-1">State</div>
                  <div className="col-span-1">Total</div>
                  <div className="col-span-2">Status</div>
                  <div className={isVibeAdmin ? "col-span-1" : "col-span-2"}>Due Date</div>
                  <div className="col-span-2">Actions</div>
                </div>
              </div>
              <div className="divide-y divide-table-border">
                {draftOrders.map((order) => {
                  const dueDate = order.due_date ? new Date(order.due_date).toLocaleDateString() : 'Not set';
                  const orderTypeInfo = getOrderTypeDisplay(order.order_type);
                  const OrderIcon = orderTypeInfo.icon;
                  
                  return (
                    <div 
                      key={order.id} 
                      className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors"
                    >
                      <div className="col-span-2 space-y-1">
                        <div className="font-medium font-mono text-sm">{order.order_number}</div>
                        <Badge className={`${orderTypeInfo.badgeColor} flex items-center gap-1 w-fit`}>
                          <OrderIcon className="h-3 w-3" />
                          {orderTypeInfo.label}
                        </Badge>
                      </div>
                      {isVibeAdmin && (
                        <div className="col-span-2 text-sm font-medium">{order.companies?.name || '-'}</div>
                      )}
                      <div className={isVibeAdmin ? "col-span-1 text-sm" : "col-span-2 text-sm"}>{order.po_number || '-'}</div>
                      <div className="col-span-1">
                        <Badge variant="outline" className="text-xs">{order.shipping_state}</Badge>
                      </div>
                      <div className="col-span-1 text-sm">${order.total?.toFixed(2)}</div>
                      <div className="col-span-2 text-sm capitalize text-muted-foreground">
                        Draft
                      </div>
                      <div className={isVibeAdmin ? "col-span-1 text-sm text-muted-foreground" : "col-span-2 text-sm text-muted-foreground"}>
                        {dueDate}
                      </div>
                      <div className="col-span-2 flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(order.order_type === 'pull_ship' ? `/pull-ship/${order.id}` : `/orders/edit/${order.id}`);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => confirmDelete(order.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
          <div className="border border-table-border rounded">
            <div className="bg-table-header border-b border-table-border">
              <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <div className="col-span-2">Order # / Type</div>
                {isVibeAdmin && <div className="col-span-1">Company</div>}
                <div className={isVibeAdmin ? "col-span-1" : "col-span-2"}>PO #</div>
                <div className="col-span-1">State</div>
                <div className="col-span-1">Total</div>
                <div className="col-span-1">Status</div>
                <div className={isVibeAdmin ? "col-span-1" : "col-span-2"}>Checklist</div>
                <div className="col-span-1">Due Date</div>
                <div className="col-span-2">Actions</div>
              </div>
            </div>
            <div className="divide-y divide-table-border">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading orders...
                </div>
              ) : pendingOrdersList.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No pending orders
                </div>
              ) : pendingOrdersList.map((order) => {
                const dueDate = order.due_date ? new Date(order.due_date).toLocaleDateString() : 'Not set';
                const orderTypeInfo = getOrderTypeDisplay(order.order_type);
                const OrderIcon = orderTypeInfo.icon;
                
                return (
                  <div 
                    key={order.id} 
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors"
                  >
                    <div className="col-span-2 space-y-1">
                      <div className="font-medium font-mono text-sm">{order.order_number}</div>
                      <Badge className={`${orderTypeInfo.badgeColor} flex items-center gap-1 w-fit`}>
                        <OrderIcon className="h-3 w-3" />
                        {orderTypeInfo.label}
                      </Badge>
                    </div>
                    {isVibeAdmin && (
                      <div className="col-span-1 text-sm font-medium">{order.companies?.name || '-'}</div>
                    )}
                    <div className={isVibeAdmin ? "col-span-1 text-sm" : "col-span-2 text-sm"}>{order.po_number || '-'}</div>
                    <div className="col-span-1">
                      <Badge variant="outline" className="text-xs">{order.shipping_state}</Badge>
                    </div>
                    <div className="col-span-1 text-sm">${order.total?.toFixed(2)}</div>
                    <div className="col-span-1 text-sm capitalize text-blue-500">
                      {order.status.replace('_', ' ')}
                    </div>
                    <div className={isVibeAdmin ? "col-span-1" : "col-span-2"}>
                      <div className="flex gap-2 items-center">
                        <div className="flex items-center gap-1" title="Art Approved">
                          {order.artApproved ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-xs text-muted-foreground">Art</span>
                        </div>
                        <div className="flex items-center gap-1" title="Order Finalized">
                          {order.order_finalized ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-xs text-muted-foreground">Order</span>
                        </div>
                        <div className="flex items-center gap-1" title="Vibe Processed">
                          {order.vibe_processed ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-xs text-muted-foreground">Vibe</span>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-1 text-sm text-muted-foreground">
                      {dueDate}
                    </div>
                    <div className="col-span-2 flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={() => navigate(order.order_type === 'pull_ship' ? `/pull-ship/${order.id}` : `/orders/${order.id}`)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={(e) => confirmDelete(order.id, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
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
          <div className="border border-table-border rounded">
            <div className="bg-table-header border-b border-table-border">
              <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <div className="col-span-2">Order # / Type</div>
                {isVibeAdmin && <div className="col-span-1">Company</div>}
                <div className={isVibeAdmin ? "col-span-1" : "col-span-2"}>PO #</div>
                <div className="col-span-1">State</div>
                <div className="col-span-1">Total</div>
                <div className={isVibeAdmin ? "col-span-1" : "col-span-2"}>Status</div>
                <div className="col-span-2">Progress</div>
                <div className="col-span-2">Actions</div>
              </div>
            </div>
            <div className="divide-y divide-table-border">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading orders...
                </div>
              ) : productionOrders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No orders in production
                </div>
              ) : productionOrders.map((order) => {
                const progress = getProgressForStatus(order.status);
                const dueDate = order.due_date ? new Date(order.due_date).toLocaleDateString() : 'Not set';
                const orderTypeInfo = getOrderTypeDisplay(order.order_type);
                const OrderIcon = orderTypeInfo.icon;
                
                return (
                  <div 
                    key={order.id} 
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors"
                  >
                    <div className="col-span-2 space-y-1">
                      <div className="font-medium font-mono text-sm">{order.order_number}</div>
                      <Badge className={`${orderTypeInfo.badgeColor} flex items-center gap-1 w-fit`}>
                        <OrderIcon className="h-3 w-3" />
                        {orderTypeInfo.label}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-sm">{order.po_number || '-'}</div>
                    <div className="col-span-1">
                      <Badge variant="outline" className="text-xs">{order.shipping_state}</Badge>
                    </div>
                    <div className="col-span-1 text-sm">${order.total?.toFixed(2)}</div>
                    <div className={`col-span-2 text-sm capitalize ${getStatusColor(order.status)}`}>
                      {order.status.replace('_', ' ')}
                    </div>
                    <div className="col-span-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{progress}%</span>
                        <span className="text-muted-foreground">Due: {dueDate}</span>
                      </div>
                      <Progress value={progress} className="h-1" />
                    </div>
                    <div className="col-span-2 flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={() => navigate(order.order_type === 'pull_ship' ? `/pull-ship/${order.id}` : `/orders/${order.id}`)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={(e) => confirmDelete(order.id, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
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

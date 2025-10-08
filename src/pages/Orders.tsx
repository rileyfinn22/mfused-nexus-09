import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { UploadPODialog } from "@/components/UploadPODialog";
import { 
  Search, 
  Plus, 
  Eye,
  Edit,
  Package,
  CheckCircle,
  Clock
} from "lucide-react";

const Orders = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setOrders(data);
    }
    setLoading(false);
  };

  const getProgressForStatus = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft': return 0;
      case 'pending': return 5;
      case 'confirmed': return 15;
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
      case 'order placed': return 'text-muted-foreground';
      case 'in production': return 'text-primary';
      case 'qc review': return 'text-warning';
      case 'ready to ship': return 'text-success';
      default: return 'text-muted-foreground';
    }
  };


  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (order.customer_name && order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || order.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const draftOrders = filteredOrders.filter(o => o.status.toLowerCase() === 'draft');
  const pendingOrdersList = filteredOrders.filter(o => o.status.toLowerCase() === 'pending');
  const productionOrders = filteredOrders.filter(o => 
    !['draft', 'pending'].includes(o.status.toLowerCase())
  );

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-table-border pb-4">
          <div>
            <h1 className="text-2xl font-semibold">Orders & Production</h1>
            <p className="text-sm text-muted-foreground mt-1">Track order progress and production pipeline</p>
          </div>
          <div className="flex gap-3">
            <UploadPODialog />
            <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => navigate("/orders/create")}>
              <Plus className="h-4 w-4 mr-2" />
              New Order
            </Button>
          </div>
        </div>

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pending">Pending Orders</TabsTrigger>
          <TabsTrigger value="production">In Production</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-6">
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="order placed">Order Placed</SelectItem>
                <SelectItem value="in production">In Production</SelectItem>
                <SelectItem value="qc review">QC Review</SelectItem>
                <SelectItem value="ready to ship">Ready to Ship</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Draft Orders */}
          {draftOrders.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-medium">Draft Orders</h2>
              <div className="border border-table-border rounded">
                <div className="bg-table-header border-b border-table-border">
                  <div className="grid grid-cols-11 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-2">Order #</div>
                    <div className="col-span-2">PO #</div>
                    <div className="col-span-1">State</div>
                    <div className="col-span-1">Total</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2">Due Date</div>
                    <div className="col-span-1">Actions</div>
                  </div>
                </div>
                <div className="divide-y divide-table-border">
                  {draftOrders.map((order) => {
                    const dueDate = order.due_date ? new Date(order.due_date).toLocaleDateString() : 'Not set';
                    
                    return (
                      <div 
                        key={order.id} 
                        className="grid grid-cols-11 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors cursor-pointer"
                        onClick={() => navigate(`/orders/edit/${order.id}`)}
                      >
                        <div className="col-span-2 font-medium font-mono text-sm">{order.order_number}</div>
                        <div className="col-span-2 text-sm">{order.po_number || '-'}</div>
                        <div className="col-span-1">
                          <Badge variant="outline" className="text-xs">{order.shipping_state}</Badge>
                        </div>
                        <div className="col-span-1 text-sm">${order.total?.toFixed(3)}</div>
                        <div className="col-span-2 text-sm capitalize text-muted-foreground">
                          Draft
                        </div>
                        <div className="col-span-2 text-sm text-muted-foreground">
                          {dueDate}
                        </div>
                        <div className="col-span-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/orders/edit/${order.id}`);
                            }}
                          >
                            <Edit className="h-3 w-3" />
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
                <div className="grid grid-cols-11 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-2">Order #</div>
                  <div className="col-span-2">PO #</div>
                  <div className="col-span-1">State</div>
                  <div className="col-span-1">Total</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Due Date</div>
                  <div className="col-span-1">Actions</div>
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
                  
                  return (
                    <div 
                      key={order.id} 
                      className="grid grid-cols-11 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors cursor-pointer"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <div className="col-span-2 font-medium font-mono text-sm">{order.order_number}</div>
                      <div className="col-span-2 text-sm">{order.po_number || '-'}</div>
                      <div className="col-span-1">
                        <Badge variant="outline" className="text-xs">{order.shipping_state}</Badge>
                      </div>
                      <div className="col-span-1 text-sm">${order.total?.toFixed(3)}</div>
                      <div className="col-span-2 text-sm capitalize text-blue-500">
                        Pending
                      </div>
                      <div className="col-span-2 text-sm text-muted-foreground">
                        {dueDate}
                      </div>
                      <div className="col-span-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/orders/${order.id}`);
                          }}
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
        </TabsContent>

        <TabsContent value="production" className="space-y-6">
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in production">In Production</SelectItem>
                <SelectItem value="qc review">QC Review</SelectItem>
                <SelectItem value="ready to ship">Ready to Ship</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Production Orders */}
          <div className="border border-table-border rounded">
            <div className="bg-table-header border-b border-table-border">
              <div className="grid grid-cols-11 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <div className="col-span-2">Order #</div>
                <div className="col-span-2">PO #</div>
                <div className="col-span-1">State</div>
                <div className="col-span-1">Total</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Progress</div>
                <div className="col-span-1">Actions</div>
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
                
                return (
                  <div 
                    key={order.id} 
                    className="grid grid-cols-11 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors cursor-pointer"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <div className="col-span-2 font-medium font-mono text-sm">{order.order_number}</div>
                    <div className="col-span-2 text-sm">{order.po_number || '-'}</div>
                    <div className="col-span-1">
                      <Badge variant="outline" className="text-xs">{order.shipping_state}</Badge>
                    </div>
                    <div className="col-span-1 text-sm">${order.total?.toFixed(3)}</div>
                    <div className={`col-span-2 text-sm capitalize ${getStatusColor(order.status)}`}>
                      {order.status}
                    </div>
                    <div className="col-span-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{progress}%</span>
                        <span className="text-muted-foreground">Due: {dueDate}</span>
                      </div>
                      <Progress value={progress} className="h-1" />
                    </div>
                    <div className="col-span-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/orders/${order.id}`);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="old-progress" className="space-y-6">
          {/* Old Progress View - Hidden */}
          <div className="space-y-3 hidden">
            <h2 className="text-lg font-medium">Order ETAs</h2>
            <div className="border border-table-border rounded">
              <div className="bg-table-header border-b border-table-border">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-2">Order #</div>
                  <div className="col-span-2">PO #</div>
                  <div className="col-span-1">State</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Progress</div>
                  <div className="col-span-3">Estimated Completion</div>
                </div>
              </div>
              <div className="divide-y divide-table-border">
                {orders.map((order) => (
                  <div key={order.id} className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors">
                    <div className="col-span-2 font-medium font-mono text-sm">{order.id}</div>
                    <div className="col-span-2 text-sm">{order.sku}</div>
                    <div className="col-span-1">
                      <Badge variant="outline" className="text-xs">{order.state}</Badge>
                    </div>
                    <div className={`col-span-2 text-sm ${getStatusColor(order.status)}`}>
                      {order.status}
                    </div>
                    <div className="col-span-2">
                      <div className="space-y-1">
                        <div className="text-xs">{order.progress}%</div>
                        <Progress value={order.progress} className="h-1" />
                      </div>
                    </div>
                    <div className="col-span-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{order.estimatedCompletion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pending Orders Checklist - Old/Hidden */}
        </TabsContent>
      </Tabs>
      </div>
    </>
  );
};

export default Orders;
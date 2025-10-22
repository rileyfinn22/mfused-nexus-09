import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Search, Eye, CheckCircle, Clock, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PullShipOrders = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isVibeAdmin !== null) {
      fetchOrders();
    }
  }, [isVibeAdmin, statusFilter]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/login');
      return;
    }

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    setIsVibeAdmin(userRole?.role === 'vibe_admin');
    
    if (userRole?.role !== 'vibe_admin') {
      navigate('/orders');
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('*, order_items(*), companies(name), vendors!orders_fulfillment_vendor_id_fkey(name)')
      .eq('order_type', 'pull_ship')
      .order('created_at', { ascending: false });

    const { data, error } = await query;
    
    if (!error && data) {
      setOrders(data);
    }
    setLoading(false);
  };

  const getApprovalBadge = (order: any) => {
    if (order.vibe_approved) {
      return (
        <Badge className="bg-green-500 text-white">
          <CheckCircle className="h-3 w-3 mr-1" />
          Approved
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
        <Clock className="h-3 w-3 mr-1" />
        Pending Approval
      </Badge>
    );
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (order.customer_name && order.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (order.companies?.name && order.companies.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "pending" && !order.vibe_approved) ||
      (statusFilter === "approved" && order.vibe_approved);
    
    return matchesSearch && matchesStatus;
  });

  const handleDeleteOrder = async (orderId: string, orderNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm(`Delete order ${orderNumber}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      toast({ 
        title: "Order Deleted", 
        description: `Order ${orderNumber} has been deleted`
      });
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Pull & Ship Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and approve fulfillment orders</p>
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <div className="border border-table-border rounded">
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Order #</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-2">Customer</div>
            <div className="col-span-2">Fulfillment Vendor</div>
            <div className="col-span-1">Total</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2">Actions</div>
          </div>
        </div>
        <div className="divide-y divide-table-border">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading orders...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No pull & ship orders found
            </div>
          ) : filteredOrders.map((order) => (
            <div 
              key={order.id} 
              className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors cursor-pointer"
              onClick={() => navigate(`/pull-ship-orders/${order.id}`)}
            >
              <div className="col-span-2">
                <div className="font-medium font-mono text-sm">{order.order_number}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="col-span-2 text-sm font-medium">{order.companies?.name || '-'}</div>
              <div className="col-span-2 text-sm">{order.customer_name || '-'}</div>
              <div className="col-span-2 text-sm">
                {order.vendors?.name || <span className="text-yellow-600">Not Assigned</span>}
              </div>
              <div className="col-span-1 text-sm">${order.total?.toFixed(2) || '0.00'}</div>
              <div className="col-span-1">
                {getApprovalBadge(order)}
              </div>
              <div className="col-span-2 flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/pull-ship-orders/${order.id}`);
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={(e) => handleDeleteOrder(order.id, order.order_number, e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PullShipOrders;

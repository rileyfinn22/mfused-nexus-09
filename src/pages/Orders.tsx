import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Search, 
  Plus, 
  Eye,
  Package,
  CheckCircle,
  Clock
} from "lucide-react";

const Orders = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const orders = [
    {
      id: "ORD-001", sku: "VAPE-CART-001", state: "WA", quantity: 500, status: "In Production",
      createdDate: "2024-01-10", estimatedCompletion: "2024-01-20", progress: 65
    },
    {
      id: "ORD-002", sku: "EDIBLE-PKG-005", state: "CA", quantity: 1000, status: "QC Review",
      createdDate: "2024-01-08", estimatedCompletion: "2024-01-18", progress: 85
    },
    {
      id: "ORD-003", sku: "FLOWER-JAR-003", state: "NY", quantity: 250, status: "Ready to Ship",
      createdDate: "2024-01-05", estimatedCompletion: "2024-01-15", progress: 100
    },
    {
      id: "ORD-004", sku: "CONCENTRATE-TIN-002", state: "AZ", quantity: 750, status: "Order Placed",
      createdDate: "2024-01-15", estimatedCompletion: "2024-01-25", progress: 15
    },
    {
      id: "ORD-005", sku: "PRE-ROLL-TUBE-001", state: "MD", quantity: 300, status: "In Production",
      createdDate: "2024-01-12", estimatedCompletion: "2024-01-22", progress: 45
    },
  ];

  const pendingOrders = [
    {
      id: "ORD-006", sku: "VAPE-CART-002", state: "CO", quantity: 400,
      artApproved: true, quantitiesConfirmed: true, poReceived: false, targetDateSet: true,
      targetDate: "2024-02-01"
    },
    {
      id: "ORD-007", sku: "EDIBLE-PKG-006", state: "NV", quantity: 850,
      artApproved: false, quantitiesConfirmed: true, poReceived: true, targetDateSet: true,
      targetDate: "2024-02-05"
    },
    {
      id: "ORD-008", sku: "FLOWER-JAR-004", state: "MI", quantity: 200,
      artApproved: true, quantitiesConfirmed: false, poReceived: false, targetDateSet: false,
      targetDate: ""
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'order placed': return 'text-muted-foreground';
      case 'in production': return 'text-primary';
      case 'qc review': return 'text-warning';
      case 'ready to ship': return 'text-success';
      default: return 'text-muted-foreground';
    }
  };


  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         order.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Orders & Production</h1>
          <p className="text-sm text-muted-foreground mt-1">Track order progress and production pipeline</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </div>

      <Tabs defaultValue="orders" className="space-y-6">
        <TabsList>
          <TabsTrigger value="orders">Active Orders</TabsTrigger>
          <TabsTrigger value="progress">Progress & Pending</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-6">
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
                <SelectItem value="order placed">Order Placed</SelectItem>
                <SelectItem value="in production">In Production</SelectItem>
                <SelectItem value="qc review">QC Review</SelectItem>
                <SelectItem value="ready to ship">Ready to Ship</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders Table */}
          <div className="border border-table-border rounded">
            {/* Table Header */}
            <div className="bg-table-header border-b border-table-border">
              <div className="grid grid-cols-11 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <div className="col-span-2">Order #</div>
                <div className="col-span-2">PO #</div>
                <div className="col-span-1">State</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Progress</div>
                <div className="col-span-1">Actions</div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-table-border">
              {filteredOrders.map((order) => (
                <div 
                  key={order.id} 
                  className="grid grid-cols-11 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors cursor-pointer"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <div className="col-span-2 font-medium font-mono text-sm">{order.id}</div>
                  <div className="col-span-2 text-sm">{order.sku}</div>
                  <div className="col-span-1">
                    <Badge variant="outline" className="text-xs">{order.state}</Badge>
                  </div>
                  <div className="col-span-1 text-sm">{order.quantity}</div>
                  <div className={`col-span-2 text-sm ${getStatusColor(order.status)}`}>
                    {order.status}
                  </div>
                  <div className="col-span-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{order.progress}%</span>
                      <span className="text-muted-foreground">Est: {order.estimatedCompletion}</span>
                    </div>
                    <Progress value={order.progress} className="h-1" />
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
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No orders found matching your criteria.
            </div>
          )}
        </TabsContent>

        <TabsContent value="progress" className="space-y-6">
          {/* ETA Timeline */}
          <div className="space-y-3">
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

          {/* Pending Orders Checklist */}
          <div className="space-y-3">
            <h2 className="text-lg font-medium">Pending Orders</h2>
            <div className="border border-table-border rounded">
              <div className="bg-table-header border-b border-table-border">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-2">Order #</div>
                  <div className="col-span-2">PO #</div>
                  <div className="col-span-1">State</div>
                  <div className="col-span-1">Qty</div>
                  <div className="col-span-4">Requirements</div>
                  <div className="col-span-2">Target Date</div>
                </div>
              </div>
              <div className="divide-y divide-table-border">
                {pendingOrders.map((order) => (
                  <div key={order.id} className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors">
                    <div className="col-span-2 font-medium font-mono text-sm">{order.id}</div>
                    <div className="col-span-2 text-sm">{order.sku}</div>
                    <div className="col-span-1">
                      <Badge variant="outline" className="text-xs">{order.state}</Badge>
                    </div>
                    <div className="col-span-1 text-sm">{order.quantity}</div>
                    <div className="col-span-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={order.artApproved} />
                        <span className="text-xs">Art Approved</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox checked={order.quantitiesConfirmed} />
                        <span className="text-xs">Quantities</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox checked={order.poReceived} />
                        <span className="text-xs">PO</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox checked={order.targetDateSet} />
                        <span className="text-xs">Target Date</span>
                      </div>
                    </div>
                    <div className="col-span-2 text-sm">
                      {order.targetDate || <span className="text-muted-foreground">Not set</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Orders;
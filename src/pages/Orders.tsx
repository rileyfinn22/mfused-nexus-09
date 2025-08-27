import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { 
  Search, 
  Plus, 
  Eye,
  Package,
  CheckCircle,
  Clock
} from "lucide-react";

const Orders = () => {
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
            <div key={order.id} className="grid grid-cols-11 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors">
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
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
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
    </div>
  );
};

export default Orders;
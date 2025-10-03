import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Package, 
  Archive, 
  AlertTriangle,
  Eye,
  Download,
  Truck
} from "lucide-react";

const Dashboard = () => {
  const stats = [
    { title: "Low Stock Items", value: "18", change: "Critical attention needed", positive: false },
    { title: "Open Orders", value: "34", change: "+5 from yesterday", positive: true },
    { title: "Inventory Gross $", value: "$847,290", change: "+$23,450 this month", positive: true },
  ];

  const recentOrders = [
    { id: "ORD-001", sku: "VAPE-CART-001", state: "WA", status: "In Production", progress: 65 },
    { id: "ORD-002", sku: "EDIBLE-PKG-005", state: "CA", status: "QC Review", progress: 85 },
    { id: "ORD-003", sku: "FLOWER-JAR-003", state: "NY", status: "Ready to Ship", progress: 100 },
    { id: "ORD-004", sku: "CONCENTRATE-TIN-002", state: "AZ", status: "In Production", progress: 25 },
    { id: "ORD-005", sku: "PRE-ROLL-TUBE-001", state: "MD", status: "Order Placed", progress: 10 },
  ];

  const lowStockItems = [
    { sku: "VAPE-CART-001", state: "WA", available: 12, redline: 50, status: "critical" },
    { sku: "EDIBLE-PKG-005", state: "CA", available: 25, redline: 100, status: "warning" },
    { sku: "FLOWER-JAR-003", state: "NY", available: 8, redline: 25, status: "critical" },
    { sku: "CONCENTRATE-TIN-002", state: "AZ", available: 35, redline: 75, status: "warning" },
    { sku: "PRE-ROLL-TUBE-001", state: "MD", available: 15, redline: 50, status: "warning" },
  ];

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'ready to ship': return 'text-success';
      case 'in production': return 'text-primary';
      case 'qc review': return 'text-warning';
      case 'order placed': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-danger';
      case 'warning': return 'text-warning';
      case 'good': return 'text-success';
      default: return 'text-muted-foreground';
    }
  };



  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Operations overview and key metrics</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div key={stat.title} className="bg-card border border-border rounded-lg p-6 hover:shadow-sm transition-shadow">
            <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
            <p className="text-3xl font-bold mt-3">{stat.value}</p>
            <p className={`text-sm mt-2 ${stat.positive ? 'text-success' : 'text-danger'}`}>
              {stat.change}
            </p>
          </div>
        ))}
      </div>

      {/* Content Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold">Recent Orders</h2>
          </div>
          <div className="divide-y divide-border">
            {recentOrders.map((order) => (
              <div key={order.id} className="p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-mono text-sm font-medium">{order.id}</p>
                    <p className="text-sm text-muted-foreground">{order.sku}</p>
                  </div>
                  <Badge variant="outline" className={getStatusColor(order.status)}>
                    {order.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold">Low Stock Alerts</h2>
          </div>
          <div className="divide-y divide-border">
            {lowStockItems.map((item) => (
              <div key={`${item.sku}-${item.state}`} className="p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="space-y-1">
                    <p className="font-mono text-sm font-medium">{item.sku}</p>
                    <p className="text-xs text-muted-foreground">{item.state}</p>
                  </div>
                  <Badge className={`${getStockStatusColor(item.status)} border-0`}>
                    {item.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span>Available: <strong>{item.available}</strong></span>
                  <span className="text-muted-foreground">Redline: {item.redline}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
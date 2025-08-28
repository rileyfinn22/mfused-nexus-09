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



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-table-border pb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Operations overview and key metrics</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div key={stat.title} className="bg-table-row border border-table-border rounded p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.title}</p>
                <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                <p className={`text-xs mt-1 ${stat.positive ? 'text-success' : 'text-danger'}`}>
                  {stat.change}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Recent Orders</h2>
          <div className="border border-table-border rounded">
            <div className="bg-table-header border-b border-table-border">
              <div className="grid grid-cols-8 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <div className="col-span-3">Order #</div>
                <div className="col-span-3">PO #</div>
                <div className="col-span-2">Status</div>
              </div>
            </div>
            <div className="divide-y divide-table-border">
              {recentOrders.map((order) => (
                <div key={order.id} className="grid grid-cols-8 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors">
                  <div className="col-span-3 font-medium font-mono text-sm">{order.id}</div>
                  <div className="col-span-3 text-sm">{order.sku}</div>
                  <div className={`col-span-2 text-sm ${getStatusColor(order.status)}`}>
                    {order.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Low Stock Alerts</h2>
          <div className="border border-table-border rounded">
            <div className="bg-table-header border-b border-table-border">
              <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <div className="col-span-4">SKU</div>
                <div className="col-span-2">State</div>
                <div className="col-span-2">Available</div>
                <div className="col-span-2">Redline</div>
                <div className="col-span-2">Status</div>
              </div>
            </div>
            <div className="divide-y divide-table-border">
              {lowStockItems.map((item) => (
                <div key={`${item.sku}-${item.state}`} className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors">
                  <div className="col-span-4 font-medium font-mono text-sm">{item.sku}</div>
                  <div className="col-span-2 text-sm">{item.state}</div>
                  <div className="col-span-2 text-sm font-semibold">{item.available}</div>
                  <div className="col-span-2 text-sm text-muted-foreground">{item.redline}</div>
                  <div className="col-span-2 text-sm font-medium uppercase">
                    {item.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
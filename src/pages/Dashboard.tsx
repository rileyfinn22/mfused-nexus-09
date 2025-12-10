import { Card, CardContent } from "@/components/ui/card";
import { 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Package,
  FileText,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

const Dashboard = () => {
  const stats = [
    { 
      title: "Low Stock Items", 
      value: "18", 
      change: "Critical attention needed", 
      trend: "down",
      icon: AlertTriangle,
      iconColor: "text-danger"
    },
    { 
      title: "Open Orders", 
      value: "34", 
      change: "+5 from yesterday", 
      trend: "up",
      icon: Package,
      iconColor: "text-primary"
    },
    { 
      title: "Inventory Value", 
      value: "$847,290", 
      change: "+$23,450 this month", 
      trend: "up",
      icon: TrendingUp,
      iconColor: "text-success"
    },
  ];

  const recentOrders = [
    { id: "ORD-001", sku: "VAPE-CART-001", status: "In Production", statusColor: "text-primary" },
    { id: "ORD-002", sku: "EDIBLE-PKG-005", status: "QC Review", statusColor: "text-warning" },
    { id: "ORD-003", sku: "FLOWER-JAR-003", status: "Ready to Ship", statusColor: "text-success" },
    { id: "ORD-004", sku: "CONCENTRATE-TIN", status: "In Production", statusColor: "text-primary" },
    { id: "ORD-005", sku: "PRE-ROLL-TUBE", status: "Order Placed", statusColor: "text-muted-foreground" },
  ];

  const lowStockItems = [
    { sku: "VAPE-CART-001", state: "WA", available: 12, redline: 50, status: "critical" },
    { sku: "EDIBLE-PKG-005", state: "CA", available: 25, redline: 100, status: "warning" },
    { sku: "FLOWER-JAR-003", state: "NY", available: 8, redline: 25, status: "critical" },
    { sku: "CONCENTRATE-TIN", state: "AZ", available: 35, redline: 75, status: "warning" },
    { sku: "PRE-ROLL-TUBE", state: "MD", available: 15, redline: 50, status: "warning" },
  ];

  const getStockBadgeClass = (status: string) => {
    switch (status) {
      case 'critical': return 'status-danger';
      case 'warning': return 'status-warning';
      default: return 'status-success';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Operations overview and key metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="card-hover">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="metric-label">{stat.title}</p>
                  <p className="metric-value">{stat.value}</p>
                  <div className="metric-change">
                    {stat.trend === 'up' ? (
                      <TrendingUp className="h-3 w-3 text-success" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-danger" />
                    )}
                    <span className={stat.trend === 'up' ? 'text-success' : 'text-danger'}>
                      {stat.change}
                    </span>
                  </div>
                </div>
                <div className={cn("p-2 rounded-lg bg-muted/50", stat.iconColor)}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <div className="p-5 border-b border-border">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Recent Orders</h2>
            </div>
          </div>
          <div className="divide-y divide-border">
            {recentOrders.map((order) => (
              <div key={order.id} className="p-4 flex items-center justify-between hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm font-medium">{order.id}</span>
                  <span className="text-sm text-muted-foreground">{order.sku}</span>
                </div>
                <span className={cn("text-sm font-medium", order.statusColor)}>
                  {order.status}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <div className="p-5 border-b border-border">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-danger" />
              <h2 className="font-semibold">Low Stock Alerts</h2>
            </div>
          </div>
          <div className="divide-y divide-border">
            {lowStockItems.map((item) => (
              <div key={`${item.sku}-${item.state}`} className="p-4 flex items-center justify-between hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm font-medium">{item.sku}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{item.state}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm font-semibold">{item.available}</span>
                    <span className="text-muted-foreground text-sm"> / {item.redline}</span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border",
                    getStockBadgeClass(item.status)
                  )}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
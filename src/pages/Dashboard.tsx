import { Card, CardContent } from "@/components/ui/card";
import { 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Package,
  FileText,
  DollarSign,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { fetchRestCountViaAuth, fetchRestRowsByInFilterViaAuth, fetchRestRowsViaAuth, withTimeout } from "@/lib/authSession";
interface LowStockItem {
  sku: string;
  state: string;
  available: number;
  redline: number;
  status: 'critical' | 'warning';
}

interface RecentOrder {
  id: string;
  order_number: string;
  status: string;
  customer_name: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { activeCompanyId, isVibeAdmin, activeCompanyRole, isFinancePortalUser, loading: companyLoading } = useActiveCompany();
  const [loading, setLoading] = useState(true);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [openOrdersCount, setOpenOrdersCount] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);

  // Finance-only users should never see the dashboard
  useEffect(() => {
    if (isFinancePortalUser || activeCompanyRole === 'finance') {
      navigate('/financing', { replace: true });
    }
  }, [isFinancePortalUser, activeCompanyRole, navigate]);

  useEffect(() => {
    if (companyLoading) return;

    if (isFinancePortalUser) {
      setLoading(false);
      return;
    }

    if (!isFinancePortalUser && (activeCompanyId || isVibeAdmin)) {
      setLoading(true);
      fetchDashboardData(activeCompanyId, isVibeAdmin);
      return;
    }

    setLoading(false);
  }, [activeCompanyId, isVibeAdmin, isFinancePortalUser, companyLoading]);

  const fetchDashboardData = async (companyId: string | null, isAdmin: boolean) => {
    try {
      // Build base query conditions - filter by company unless vibe admin
      const companyFilter = !isAdmin && companyId ? companyId : null;
      const companyParams = companyFilter ? { company_id: `eq.${companyFilter}` } : {};

      const [inventoryData, ordersCount, inventoryValueData, ordersData] = await Promise.all([
        withTimeout(fetchRestRowsViaAuth<any>('inventory', {
          select: 'sku,state,available,redline,company_id',
          ...companyParams,
          limit: 5000,
        }, { timeoutMs: 7000 }), 8000, []),
        withTimeout(fetchRestCountViaAuth('orders', {
          select: 'id',
          status: 'in.("pending","in_production","approved")',
          deleted_at: 'is.null',
          ...companyParams,
        }, { timeoutMs: 7000 }), 8000, 0),
        withTimeout(fetchRestRowsViaAuth<any>('inventory', {
          select: 'available,product_id,company_id',
          ...companyParams,
          limit: 5000,
        }, { timeoutMs: 7000 }), 8000, []),
        withTimeout(fetchRestRowsViaAuth<any>('orders', {
          select: 'id,order_number,status,customer_name',
          deleted_at: 'is.null',
          ...companyParams,
          order: 'created_at.desc',
          limit: 5,
        }, { timeoutMs: 7000 }), 8000, []),
      ]);

      const lowStock = (inventoryData || [])
        .filter(item => item.available < item.redline)
        .map(item => ({
          sku: item.sku,
          state: item.state,
          available: item.available,
          redline: item.redline,
          status: (item.available < item.redline * 0.25 ? 'critical' : 'warning') as 'critical' | 'warning'
        }))
        .slice(0, 5);

      setLowStockItems(lowStock);
      setLowStockCount((inventoryData || []).filter(item => item.available < item.redline).length);
      setOpenOrdersCount(ordersCount || 0);

      // Product cost moved to companion table product_costs
      const dashProductIds = Array.from(new Set((inventoryValueData || []).map((item: any) => item.product_id).filter(Boolean)));
      const dashCostMap: Record<string, number> = {};
      if (dashProductIds.length > 0) {
        const costRows = await withTimeout(fetchRestRowsByInFilterViaAuth<any>('product_costs', {
          select: 'product_id,cost',
        }, 'product_id', dashProductIds, { timeoutMs: 5000, chunkSize: 75 }), 6000, []);
        (costRows || []).forEach((row: any) => {
          dashCostMap[row.product_id] = row.cost || 0;
        });
      }

      const totalValue = (inventoryValueData || []).reduce((sum, item) => {
        const cost = dashCostMap[item.product_id] || 0;
        return sum + (item.available * cost);
      }, 0);

      setInventoryValue(totalValue);

      setRecentOrders((ordersData || []).map(order => ({
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        customer_name: order.customer_name
      })));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_production': return 'text-primary';
      case 'approved': return 'text-success';
      case 'pending': return 'text-warning';
      case 'shipped': return 'text-success';
      case 'draft': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getStockBadgeClass = (status: string) => {
    switch (status) {
      case 'critical': return 'status-danger';
      case 'warning': return 'status-warning';
      default: return 'status-success';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    { 
      title: "Low Stock Items", 
      value: lowStockCount.toString(), 
      description: lowStockCount > 0 ? "Items below redline" : "All items stocked", 
      trend: lowStockCount > 0 ? "down" : "up",
      icon: AlertTriangle,
      iconColor: lowStockCount > 0 ? "text-danger" : "text-success"
    },
    { 
      title: "Open Orders", 
      value: openOrdersCount.toString(), 
      description: "Pending & in production", 
      trend: "up",
      icon: Package,
      iconColor: "text-primary"
    },
    { 
      title: "Inventory Value", 
      value: formatCurrency(inventoryValue), 
      description: "Total at cost", 
      trend: "up",
      icon: DollarSign,
      iconColor: "text-success"
    },
  ];

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
                      {stat.description}
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
            {recentOrders.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No orders yet
              </div>
            ) : (
              recentOrders.map((order) => (
                <div 
                  key={order.id} 
                  className="p-4 flex items-center justify-between hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm font-medium">{order.order_number}</span>
                    <span className="text-sm text-muted-foreground">{order.customer_name}</span>
                  </div>
                  <span className={cn("text-sm font-medium", getStatusColor(order.status))}>
                    {formatStatus(order.status)}
                  </span>
                </div>
              ))
            )}
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
            {lowStockItems.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                All inventory levels are healthy
              </div>
            ) : (
              lowStockItems.map((item) => (
                <div 
                  key={`${item.sku}-${item.state}`} 
                  className="p-4 flex items-center justify-between hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => navigate('/inventory')}
                >
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
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;

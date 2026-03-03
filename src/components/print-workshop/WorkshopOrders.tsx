import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Loader2, Truck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useActiveCompany } from "@/hooks/useActiveCompany";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  approved: "bg-green-500/10 text-green-700 border-green-200",
  in_production: "bg-purple-500/10 text-purple-700 border-purple-200",
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  shipped: "bg-blue-500/10 text-blue-700 border-blue-200",
  delivered: "bg-green-500/10 text-green-700 border-green-200",
  cancelled: "bg-red-500/10 text-red-700 border-red-200",
};

interface WorkshopOrder {
  id: string;
  order_number: string;
  status: string;
  subtotal: number;
  total: number;
  production_status: string | null;
  production_progress: number | null;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_carrier: string | null;
  created_at: string;
  item_count?: number;
}

export function WorkshopOrders() {
  const navigate = useNavigate();
  const { isVibeAdmin, activeCompanyId } = useActiveCompany();
  const [orders, setOrders] = useState<WorkshopOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    setLoading(true);
    let query = supabase
      .from("workshop_orders")
      .select("*")
      .order("created_at", { ascending: false });

    // Company users only see their company's orders
    if (!isVibeAdmin && activeCompanyId) {
      query = query.eq("company_id", activeCompanyId);
    }

    const { data: woData, error: woError } = await query;

    if (woError) {
      toast.error("Failed to load orders");
      setLoading(false);
      return;
    }

    const ids = (woData || []).map((o: any) => o.id);
    let itemCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: items } = await supabase
        .from("print_orders")
        .select("workshop_order_id")
        .in("workshop_order_id", ids);
      if (items) {
        for (const item of items as any[]) {
          itemCounts[item.workshop_order_id] = (itemCounts[item.workshop_order_id] || 0) + 1;
        }
      }
    }

    setOrders(
      (woData || []).map((o: any) => ({
        ...o,
        item_count: itemCounts[o.id] || 0,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [activeCompanyId]);

  const formatLabel = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading orders...
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">No orders yet</h3>
          <p className="text-muted-foreground text-sm">
            {isVibeAdmin
              ? "Orders placed from the Print Cart will appear here"
              : "Browse templates, customize them, and place your first order!"}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Customer view - card-based order list
  if (!isVibeAdmin) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orders.map((order) => {
          const progress = ["completed", "shipped", "delivered"].includes(order.status)
            ? 100
            : (order.production_progress || 0);
          return (
            <Card
              key={order.id}
              className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
              onClick={() => navigate(`/print-workshop/orders/${order.id}`)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{order.order_number}</span>
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[order.status] || ""}`}>
                    {formatLabel(order.status)}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(order.created_at), "MMM d, yyyy")} · {order.item_count} item{order.item_count !== 1 ? "s" : ""}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Production</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
                {order.tracking_number && (
                  <div className="flex items-center gap-1.5 text-xs text-primary">
                    <Truck className="h-3 w-3" />
                    {order.tracking_url ? (
                      <a
                        href={order.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Track Shipment <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span>{order.tracking_number}</span>
                    )}
                  </div>
                )}
                {Number(order.total) > 0 && (
                  <div className="text-sm font-semibold text-right">
                    ${Number(order.total).toFixed(2)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // Admin view - table
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-center">Items</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Production</TableHead>
          <TableHead className="w-[120px]">Progress</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const progress = ["completed", "shipped", "delivered"].includes(order.status)
            ? 100
            : (order.production_progress || 0);
          return (
            <TableRow
              key={order.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/print-workshop/orders/${order.id}`)}
            >
              <TableCell className="font-medium text-sm">{order.order_number}</TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {format(new Date(order.created_at), "MMM d, yyyy")}
              </TableCell>
              <TableCell className="text-center text-sm">{order.item_count}</TableCell>
              <TableCell className="text-right text-sm font-medium">
                {Number(order.total) > 0 ? `$${Number(order.total).toFixed(2)}` : "Quote needed"}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={`text-xs ${STATUS_COLORS[order.status] || ""}`}>
                  {formatLabel(order.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {order.production_status ? formatLabel(order.production_status) : "—"}
              </TableCell>
              <TableCell>
                <Progress value={progress} className="h-1.5" />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

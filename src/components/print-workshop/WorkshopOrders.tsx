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
import { Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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
  created_at: string;
  item_count?: number;
}

export function WorkshopOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<WorkshopOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    setLoading(true);
    // Fetch workshop orders
    const { data: woData, error: woError } = await supabase
      .from("workshop_orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (woError) {
      toast.error("Failed to load workshop orders");
      setLoading(false);
      return;
    }

    // Fetch line item counts per order
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
  }, []);

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
          <h3 className="text-lg font-medium mb-1">No workshop orders yet</h3>
          <p className="text-muted-foreground text-sm">
            Orders placed from the Print Cart will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

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

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Package, ExternalLink, FileText, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PrintOrder {
  id: string;
  template_name: string;
  material: string | null;
  quantity: number;
  price_per_unit: number | null;
  total: number | null;
  status: string;
  print_file_url: string | null;
  canvas_data: any;
  created_at: string;
  created_by: string | null;
  print_template_id: string | null;
  company_id: string | null;
  order_id: string | null;
  quoted_price: number | null;
  quoted_at: string | null;
  quoted_by: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-500/10 text-green-700 border-green-200",
  pending_quote: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  quoted: "bg-blue-500/10 text-blue-700 border-blue-200",
  in_production: "bg-purple-500/10 text-purple-700 border-purple-200",
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-500/10 text-red-700 border-red-200",
};

export function WorkshopOrders() {
  const [orders, setOrders] = useState<PrintOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<PrintOrder | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("print_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load workshop orders");
    } else {
      setOrders((data as PrintOrder[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const formatStatus = (status: string) =>
    status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading orders...
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
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Material</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Print File</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {format(new Date(order.created_at), "MMM d, yyyy")}
              </TableCell>
              <TableCell className="font-medium text-sm">
                {order.template_name}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {order.material || "—"}
              </TableCell>
              <TableCell className="text-right text-sm">
                {order.quantity.toLocaleString()}
              </TableCell>
              <TableCell className="text-right text-sm">
                {order.price_per_unit != null
                  ? `$${Number(order.price_per_unit).toFixed(4)}`
                  : "Quote needed"}
              </TableCell>
              <TableCell className="text-right text-sm font-medium">
                {order.total != null && order.total > 0
                  ? `$${Number(order.total).toFixed(2)}`
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`text-xs ${STATUS_COLORS[order.status] || ""}`}
                >
                  {formatStatus(order.status)}
                </Badge>
              </TableCell>
              <TableCell>
                {order.print_file_url ? (
                  <a
                    href={order.print_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    View PDF
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setSelectedOrder(order)}
                  title="View details"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Order detail dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Workshop Order Details
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Template</span>
                  <p className="font-medium">{selectedOrder.template_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date</span>
                  <p className="font-medium">
                    {format(new Date(selectedOrder.created_at), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Material</span>
                  <p className="font-medium">{selectedOrder.material || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_COLORS[selectedOrder.status] || ""}`}
                    >
                      {formatStatus(selectedOrder.status)}
                    </Badge>
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Line Items</h4>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Item</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Qty</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Unit Price</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-3 py-2">
                          <div className="font-medium">{selectedOrder.template_name}</div>
                          {selectedOrder.material && (
                            <div className="text-xs text-muted-foreground">{selectedOrder.material}</div>
                          )}
                        </td>
                        <td className="text-right px-3 py-2">
                          {selectedOrder.quantity.toLocaleString()}
                        </td>
                        <td className="text-right px-3 py-2">
                          {selectedOrder.price_per_unit != null
                            ? `$${Number(selectedOrder.price_per_unit).toFixed(4)}`
                            : "TBD"}
                        </td>
                        <td className="text-right px-3 py-2 font-medium">
                          {selectedOrder.total != null && selectedOrder.total > 0
                            ? `$${Number(selectedOrder.total).toFixed(2)}`
                            : "—"}
                        </td>
                      </tr>
                    </tbody>
                    {selectedOrder.total != null && selectedOrder.total > 0 && (
                      <tfoot className="border-t border-border">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right font-semibold">Order Total</td>
                          <td className="px-3 py-2 text-right font-semibold text-primary">
                            ${Number(selectedOrder.total).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {selectedOrder.print_file_url && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Attached Files</h4>
                    <a
                      href={selectedOrder.print_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline border border-border rounded-lg px-3 py-2"
                    >
                      <FileText className="h-4 w-4" />
                      Print-Ready PDF
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </>
              )}

              {selectedOrder.quoted_price != null && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Quoted Price</span>
                      <p className="font-medium">${Number(selectedOrder.quoted_price).toFixed(2)}</p>
                    </div>
                    {selectedOrder.quoted_at && (
                      <div>
                        <span className="text-muted-foreground">Quoted At</span>
                        <p className="font-medium">
                          {format(new Date(selectedOrder.quoted_at), "MMM d, yyyy")}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

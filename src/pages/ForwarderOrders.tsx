import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ship, Search, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useActiveCompany } from "@/hooks/useActiveCompany";

interface ForwarderOrder {
  id: string;
  order_number: string;
  po_number: string | null;
  description: string | null;
  customer_name: string;
  status: string;
  created_at: string;
  shipping_name: string;
  shipping_street: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
  financed_invoice_number?: string | null;
  item_count: number;
}

export default function ForwarderOrders() {
  const [orders, setOrders] = useState<ForwarderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { activeCompany } = useCompany();
  const { isVibeAdmin } = useActiveCompany();
  const navigate = useNavigate();

  useEffect(() => {
    if (activeCompany || isVibeAdmin) fetchOrders();
  }, [activeCompany, isVibeAdmin]);

  const fetchOrders = async () => {
    try {
      let query = supabase
        .from("orders")
        .select(`
          id, order_number, po_number, description, customer_name, status,
          created_at, shipping_name, shipping_street, shipping_city, shipping_state, shipping_zip,
          order_items(id)
        `)
        .is("deleted_at", null)
        .neq("status", "draft")
        .order("created_at", { ascending: false });

      // Vibe admins see ALL orders; forwarders see only their company's
      if (!isVibeAdmin && activeCompany) {
        query = query.eq("company_id", activeCompany.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch financed invoice numbers linked to these orders via vendor POs
      const { data: financedData } = await supabase
        .from("financed_invoices")
        .select("invoice_number, invoice_id, invoices:invoice_id(order_id)")
        .not("invoice_id", "is", null);

      const financedByOrderId = new Map<string, string>();
      (financedData || []).forEach((fi: any) => {
        if (fi.invoices?.order_id) {
          financedByOrderId.set(fi.invoices.order_id, fi.invoice_number || fi.id);
        }
      });

      const mapped: ForwarderOrder[] = (data || []).map((o: any) => ({
        ...o,
        item_count: o.order_items?.length || 0,
        financed_invoice_number: financedByOrderId.get(o.id) || null,
      }));

      setOrders(mapped);
    } catch (err) {
      console.error("Error fetching forwarder orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      (o.po_number || "").toLowerCase().includes(q) ||
      (o.description || "").toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      (o.financed_invoice_number || "").toLowerCase().includes(q)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending": return "bg-yellow-500/10 text-yellow-600";
      case "in production": return "bg-blue-500/10 text-blue-600";
      case "shipped":
      case "delivered":
      case "completed": return "bg-green-500/10 text-green-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Ship className="h-8 w-8" />
            Shipment Orders
          </h1>
          <p className="text-muted-foreground mt-1">Manage shipping and tracking for orders</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search orders, POs, descriptions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No orders found</p>
            <p className="text-muted-foreground">Orders assigned to your company will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Finance Invoice</TableHead>
              <TableHead>Ship To</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((order) => (
              <TableRow
                key={order.id}
                className="cursor-pointer"
                onClick={() => navigate(`/forwarder/orders/${order.id}`)}
              >
                <TableCell className="font-mono font-medium">{order.order_number}</TableCell>
                <TableCell className="whitespace-pre-wrap">{order.description || "—"}</TableCell>
                <TableCell>{order.customer_name}</TableCell>
                <TableCell>
                  {order.financed_invoice_number ? (
                    <Badge variant="outline" className="font-mono">{order.financed_invoice_number}</Badge>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {order.shipping_city}, {order.shipping_state}
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

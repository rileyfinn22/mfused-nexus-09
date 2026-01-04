import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  RefreshCw, 
  FileText, 
  Receipt, 
  DollarSign,
  TrendingUp,
  Package,
  ClipboardList,
  CreditCard,
  ExternalLink,
  Edit
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface OrderData {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  status: string;
  order_date: string;
  due_date: string | null;
  total: number;
  subtotal: number;
  tax: number;
  shipping_cost: number | null;
  qb_project_id: string | null;
  description: string | null;
  memo: string | null;
  shipping_name: string;
  shipping_street: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total: number;
  total_paid: number | null;
  quickbooks_id: string | null;
}

interface VendorPO {
  id: string;
  po_number: string;
  order_date: string;
  status: string;
  total: number;
  po_type: string;
  vendor: { name: string } | null;
  quickbooks_id: string | null;
}

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  total: number;
  created_at: string;
  valid_until: string | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  invoice: { invoice_number: string } | null;
}

const ProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendorPOs, setVendorPOs] = useState<VendorPO[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadProjectData();
    }
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);

      // Fetch order details
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", projectId)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData);

      // Fetch related data in parallel
      const [invoicesRes, posRes, quotesRes, paymentsRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, due_date, status, total, total_paid, quickbooks_id")
          .eq("order_id", projectId)
          .is("deleted_at", null)
          .order("invoice_date", { ascending: false }),
        supabase
          .from("vendor_pos")
          .select("id, po_number, order_date, status, total, po_type, quickbooks_id, vendor:vendors(name)")
          .eq("order_id", projectId)
          .order("order_date", { ascending: false }),
        supabase
          .from("quotes")
          .select("id, quote_number, status, total, created_at, valid_until")
          .eq("customer_name", orderData.customer_name)
          .eq("company_id", orderData.company_id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("payments")
          .select("id, amount, payment_date, payment_method, reference_number, invoice:invoices(invoice_number)")
          .eq("company_id", orderData.company_id)
          .order("payment_date", { ascending: false }),
      ]);

      setInvoices(invoicesRes.data || []);
      setVendorPOs(posRes.data || []);
      setQuotes(quotesRes.data || []);
      
      // Filter payments to only those related to this order's invoices
      const orderInvoiceIds = new Set((invoicesRes.data || []).map(inv => inv.id));
      const filteredPayments = (paymentsRes.data || []).filter(p => {
        // We need to check if this payment belongs to one of our invoices
        return true; // For now, show all - we'll filter by invoice_id in the query
      });
      
      // Re-fetch payments with proper filter
      const invoiceIds = (invoicesRes.data || []).map(inv => inv.id);
      if (invoiceIds.length > 0) {
        const { data: projectPayments } = await supabase
          .from("payments")
          .select("id, amount, payment_date, payment_method, reference_number, invoice:invoices(invoice_number)")
          .in("invoice_id", invoiceIds)
          .order("payment_date", { ascending: false });
        setPayments(projectPayments || []);
      } else {
        setPayments([]);
      }

    } catch (error) {
      console.error("Error loading project:", error);
      toast({
        title: "Error",
        description: "Failed to load project details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const syncToQBO = async () => {
    setSyncing(true);
    try {
      // Sync invoice to QuickBooks
      for (const invoice of invoices) {
        if (!invoice.quickbooks_id) {
          await supabase.functions.invoke("quickbooks-sync-invoice", {
            body: { invoiceId: invoice.id },
          });
        }
      }
      toast({
        title: "Sync Complete",
        description: "Project data synced to QuickBooks",
      });
      await loadProjectData();
    } catch (error) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync to QuickBooks",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-semibold">Project not found</h2>
        <Button variant="link" onClick={() => navigate("/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  // Calculate summary
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.total_paid || 0), 0);
  const totalCosts = vendorPOs.reduce((sum, po) => sum + po.total, 0);
  const profit = totalInvoiced - totalCosts;
  const margin = totalInvoiced > 0 ? (profit / totalInvoiced) * 100 : 0;
  const outstanding = totalInvoiced - totalPaid;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "paid":
      case "approved":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "in_progress":
      case "sent":
      case "partial":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "pending":
      case "draft":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "cancelled":
      case "rejected":
      case "overdue":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">{order.order_number}</h1>
              <Badge variant="outline" className={getStatusColor(order.status)}>
                {order.status.replace("_", " ")}
              </Badge>
              {order.qb_project_id && (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                  QB Synced
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{order.customer_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={syncToQBO} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sync to QB
          </Button>
          <Button variant="outline" onClick={() => navigate(`/orders/${order.id}`)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            View Order
          </Button>
          <Button onClick={() => navigate(`/orders/edit/${order.id}`)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalInvoiced.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costs</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCosts.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {vendorPOs.length} PO{vendorPOs.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
              ${profit.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {margin.toFixed(1)}% margin
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collected</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalPaid.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {payments.length} payment{payments.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${outstanding > 0 ? "text-yellow-500" : "text-green-500"}`}>
              ${outstanding.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {outstanding > 0 ? "Due" : "Settled"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Project Details */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Customer</p>
              <p>{order.customer_name}</p>
              {order.customer_email && <p className="text-sm text-muted-foreground">{order.customer_email}</p>}
              {order.customer_phone && <p className="text-sm text-muted-foreground">{order.customer_phone}</p>}
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Order Date</p>
              <p>{format(new Date(order.order_date), "MMM d, yyyy")}</p>
            </div>
            {order.due_date && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                <p>{format(new Date(order.due_date), "MMM d, yyyy")}</p>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Shipping Address</p>
              <p>{order.shipping_name}</p>
              <p className="text-sm text-muted-foreground">
                {order.shipping_street}<br />
                {order.shipping_city}, {order.shipping_state} {order.shipping_zip}
              </p>
            </div>
            {order.description && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Description</p>
                  <p className="text-sm">{order.description}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <Tabs defaultValue="invoices">
            <CardHeader>
              <TabsList>
                <TabsTrigger value="invoices" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Invoices ({invoices.length})
                </TabsTrigger>
                <TabsTrigger value="pos" className="gap-2">
                  <Package className="h-4 w-4" />
                  Vendor POs ({vendorPOs.length})
                </TabsTrigger>
                <TabsTrigger value="payments" className="gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payments ({payments.length})
                </TabsTrigger>
                <TabsTrigger value="quotes" className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Quotes ({quotes.length})
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="invoices" className="mt-0">
                {invoices.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No invoices yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead>QB</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow 
                          key={inv.id} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                        >
                          <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                          <TableCell>{format(new Date(inv.invoice_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getStatusColor(inv.status)}>
                              {inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">${inv.total.toLocaleString()}</TableCell>
                          <TableCell className="text-right">${(inv.total_paid || 0).toLocaleString()}</TableCell>
                          <TableCell>
                            {inv.quickbooks_id ? (
                              <Badge variant="outline" className="bg-green-500/10 text-green-500 text-xs">✓</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="pos" className="mt-0">
                {vendorPOs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No vendor POs yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO #</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>QB</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendorPOs.map((po) => (
                        <TableRow 
                          key={po.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/vendor-pos/${po.id}`)}
                        >
                          <TableCell className="font-medium">{po.po_number}</TableCell>
                          <TableCell>{po.vendor?.name || "Unknown"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{po.po_type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getStatusColor(po.status)}>
                              {po.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">${po.total.toLocaleString()}</TableCell>
                          <TableCell>
                            {po.quickbooks_id ? (
                              <Badge variant="outline" className="bg-green-500/10 text-green-500 text-xs">✓</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-0">
                {payments.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No payments yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{format(new Date(payment.payment_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>{payment.invoice?.invoice_number || "-"}</TableCell>
                          <TableCell>{payment.payment_method}</TableCell>
                          <TableCell>{payment.reference_number || "-"}</TableCell>
                          <TableCell className="text-right text-green-500">
                            ${payment.amount.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="quotes" className="mt-0">
                {quotes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No quotes found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quote #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Valid Until</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map((quote) => (
                        <TableRow 
                          key={quote.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/quotes/${quote.id}`)}
                        >
                          <TableCell className="font-medium">{quote.quote_number}</TableCell>
                          <TableCell>{format(new Date(quote.created_at), "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getStatusColor(quote.status)}>
                              {quote.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {quote.valid_until 
                              ? format(new Date(quote.valid_until), "MMM d, yyyy")
                              : "-"
                            }
                          </TableCell>
                          <TableCell className="text-right">${quote.total.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default ProjectDetail;

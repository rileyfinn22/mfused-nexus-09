import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  FileText, 
  Receipt, 
  Package, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ProjectDetail = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [vendorPOs, setVendorPOs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [plView, setPlView] = useState<"accrual" | "cash">("accrual");

  useEffect(() => {
    if (projectId) {
      fetchProjectData();
    }
  }, [projectId]);

  const fetchProjectData = async () => {
    setLoading(true);
    try {
      // Fetch order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          companies(name),
          order_items(*)
        `)
        .eq('id', projectId)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData);

      // Fetch invoices
      const { data: invoiceData } = await supabase
        .from('invoices')
        .select('*')
        .eq('order_id', projectId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      setInvoices(invoiceData || []);

      // Fetch payments for all invoices
      if (invoiceData && invoiceData.length > 0) {
        const invoiceIds = invoiceData.map(inv => inv.id);
        const { data: paymentData } = await supabase
          .from('payments')
          .select('*')
          .in('invoice_id', invoiceIds)
          .order('payment_date', { ascending: false });
        setPayments(paymentData || []);
      }

      // Fetch vendor POs
      const { data: vendorPOData } = await supabase
        .from('vendor_pos')
        .select(`
          *,
          vendors(name),
          vendor_po_items(*)
        `)
        .eq('order_id', projectId)
        .order('created_at', { ascending: false });
      setVendorPOs(vendorPOData || []);

    } catch (error) {
      console.error('Error fetching project data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const getProfitColor = (profit: number) => {
    if (profit > 0) return "text-green-600";
    if (profit < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  // Calculate P&L - only count billed invoices as revenue
  // The blanket/parent invoice (no parent_invoice_id and not billed) doesn't count toward revenue
  const billedInvoices = invoices.filter(inv => inv.status === 'billed' || inv.status === 'paid');
  const totalRevenue = billedInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPaid = billedInvoices.reduce((sum, inv) => sum + (inv.total_paid || 0), 0);
  const totalCosts = vendorPOs.reduce((sum, po) => sum + (po.total || 0), 0);
  const accrualProfit = totalRevenue - totalCosts;
  const cashProfit = totalPaid - totalCosts;
  const accrualMargin = totalRevenue > 0 ? (accrualProfit / totalRevenue) * 100 : 0;
  const cashMargin = totalPaid > 0 ? (cashProfit / totalPaid) * 100 : 0;
  
  // Helper to determine if invoice is the blanket/parent order
  const isBlanketOrder = (invoice: any) => {
    return !invoice.parent_invoice_id && invoice.status !== 'billed' && invoice.status !== 'paid';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Project: {order.order_number}</h1>
            <Badge variant={order.status === 'completed' ? 'default' : 'secondary'}>
              {order.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {order.customer_name} • {(order.companies as any)?.name}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/orders/${projectId}`)}>
          <ExternalLink className="h-4 w-4 mr-2" />
          View Order
        </Button>
      </div>

      {/* P&L Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {plView === "accrual" ? "Total Revenue (Invoiced)" : "Total Received (Cash)"}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(plView === "accrual" ? totalRevenue : totalPaid)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Costs</p>
                <p className="text-xl font-bold">{formatCurrency(totalCosts)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                (plView === "accrual" ? accrualProfit : cashProfit) >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
              }`}>
                <TrendingUp className={`h-5 w-5 ${
                  (plView === "accrual" ? accrualProfit : cashProfit) >= 0 ? 'text-green-600' : 'text-red-600'
                }`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {plView === "accrual" ? "Accrual P&L" : "Cash P&L"}
                </p>
                <p className={`text-xl font-bold ${getProfitColor(plView === "accrual" ? accrualProfit : cashProfit)}`}>
                  {formatCurrency(plView === "accrual" ? accrualProfit : cashProfit)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <span className="text-sm font-bold text-muted-foreground">%</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {plView === "accrual" ? "Accrual Margin" : "Cash Margin"}
                </p>
                <p className={`text-xl font-bold ${getProfitColor(plView === "accrual" ? accrualMargin : cashMargin)}`}>
                  {(plView === "accrual" ? accrualMargin : cashMargin).toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle */}
      <div className="flex justify-end">
        <Tabs value={plView} onValueChange={(v) => setPlView(v as "accrual" | "cash")}>
          <TabsList>
            <TabsTrigger value="accrual">Accrual View</TabsTrigger>
            <TabsTrigger value="cash">Cash View</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Details Sections */}
      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" />
            Invoices ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <Receipt className="h-4 w-4" />
            Payments ({payments.length})
          </TabsTrigger>
          <TabsTrigger value="costs" className="gap-2">
            <Package className="h-4 w-4" />
            Vendor POs ({vendorPOs.length})
          </TabsTrigger>
        </TabsList>

        {/* Invoices Tab */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Invoices (Revenue)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const isOrder = isBlanketOrder(invoice);
                    const displayTotal = isOrder ? 0 : invoice.total;
                    const displayPaid = isOrder ? 0 : (invoice.total_paid || 0);
                    return (
                      <TableRow 
                        key={invoice.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                      >
                        <TableCell className="font-medium">
                          {invoice.invoice_number}
                          {isOrder && <span className="ml-2 text-muted-foreground">(Order)</span>}
                        </TableCell>
                        <TableCell>{new Date(invoice.invoice_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{isOrder ? 'Blanket Order' : (invoice.invoice_type || 'Standard')}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={invoice.status === 'paid' ? 'default' : invoice.status === 'billed' ? 'default' : 'secondary'}>
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right ${isOrder ? 'text-muted-foreground' : ''}`}>
                          {isOrder ? <span className="text-muted-foreground italic">$0.00</span> : formatCurrency(invoice.total)}
                        </TableCell>
                        <TableCell className={`text-right ${isOrder ? 'text-muted-foreground' : 'text-green-600'}`}>
                          {isOrder ? <span className="italic">$0.00</span> : formatCurrency(invoice.total_paid || 0)}
                        </TableCell>
                        <TableCell className={`text-right ${isOrder ? 'text-muted-foreground' : 'text-orange-600'}`}>
                          {isOrder ? <span className="italic">$0.00</span> : formatCurrency((invoice.total || 0) - (invoice.total_paid || 0))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {invoices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No invoices for this project
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {invoices.length > 0 && (
                <div className="border-t p-4 bg-muted/30">
                  <div className="flex justify-end gap-8">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Invoiced</p>
                      <p className="text-lg font-bold">{formatCurrency(totalRevenue)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Paid</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Outstanding</p>
                      <p className="text-lg font-bold text-orange-600">{formatCurrency(totalRevenue - totalPaid)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payments Received</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
                    const invoice = invoices.find(inv => inv.id === payment.invoice_id);
                    return (
                      <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium">{invoice?.invoice_number || '-'}</TableCell>
                        <TableCell>{payment.payment_method}</TableCell>
                        <TableCell className="text-muted-foreground">{payment.reference_number || '-'}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {payments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No payments recorded for this project
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {payments.length > 0 && (
                <div className="border-t p-4 bg-muted/30">
                  <div className="flex justify-end">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Received</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vendor POs Tab */}
        <TabsContent value="costs">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vendor POs (Costs)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
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
                      <TableCell>{new Date(po.order_date).toLocaleDateString()}</TableCell>
                      <TableCell>{(po.vendors as any)?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{po.po_type || 'Standard'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={po.status === 'completed' ? 'default' : 'secondary'}>
                          {po.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {formatCurrency(po.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {vendorPOs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No vendor POs for this project
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {vendorPOs.length > 0 && (
                <div className="border-t p-4 bg-muted/30">
                  <div className="flex justify-end">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Costs</p>
                      <p className="text-lg font-bold text-red-600">{formatCurrency(totalCosts)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* P&L Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profit & Loss Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Accrual View */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${plView === "accrual" ? 'bg-primary' : 'bg-muted'}`} />
                Accrual Basis
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenue (Invoiced)</span>
                  <span>{formatCurrency(totalRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Costs (Vendor POs)</span>
                  <span className="text-red-600">-{formatCurrency(totalCosts)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Gross Profit</span>
                  <span className={getProfitColor(accrualProfit)}>{formatCurrency(accrualProfit)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Margin</span>
                  <span className={getProfitColor(accrualMargin)}>{accrualMargin.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Cash View */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${plView === "cash" ? 'bg-primary' : 'bg-muted'}`} />
                Cash Basis
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenue (Received)</span>
                  <span>{formatCurrency(totalPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Costs (Vendor POs)</span>
                  <span className="text-red-600">-{formatCurrency(totalCosts)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Cash Profit</span>
                  <span className={getProfitColor(cashProfit)}>{formatCurrency(cashProfit)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Margin</span>
                  <span className={getProfitColor(cashMargin)}>{cashMargin.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectDetail;

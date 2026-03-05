import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  FileText, 
  Receipt, 
  Package, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  ExternalLink,
  LayoutList,
  Paperclip,
  Download,
  Upload,
  Trash2,
  Image as ImageIcon,
  File
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ProjectDetail = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [vendorPOs, setVendorPOs] = useState<any[]>([]);
  const [vendorPayments, setVendorPayments] = useState<any[]>([]);
  const [customerPOs, setCustomerPOs] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [plView, setPlView] = useState<"accrual" | "cash">("accrual");
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  useEffect(() => {
    if (projectId) {
      fetchProjectData();
    }
  }, [projectId, isVibeAdmin]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      const role = data?.role as string;
      setIsVibeAdmin(role === 'vibe_admin');
    }
  };

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

      // Fetch customer POs (attachments with description 'Customer PO')
      const { data: customerPOData } = await supabase
        .from('order_attachments')
        .select('*')
        .eq('order_id', projectId)
        .eq('description', 'Customer PO')
        .order('created_at', { ascending: false });
      setCustomerPOs(customerPOData || []);

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

      // Fetch vendor POs - ONLY for Vibe Admins
      if (isVibeAdmin) {
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

        // Fetch vendor PO payments
        if (vendorPOData && vendorPOData.length > 0) {
          const vendorPOIds = vendorPOData.map(po => po.id);
          const { data: vendorPaymentData } = await supabase
            .from('vendor_po_payments')
            .select(`
              *,
              vendor_pos!vendor_po_payments_vendor_po_id_fkey(po_number, vendors(name))
            `)
            .in('vendor_po_id', vendorPOIds)
            .order('payment_date', { ascending: false });
          setVendorPayments(vendorPaymentData || []);
        }
      } else {
        // Clear vendor data for non-admins
        setVendorPOs([]);
        setVendorPayments([]);
      }

      // Fetch project documents
      const { data: docData } = await supabase
        .from('project_documents')
        .select('*')
        .eq('order_id', projectId)
        .order('created_at', { ascending: false });
      setDocuments(docData || []);

    } catch (error) {
      console.error('Error fetching project data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !projectId) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      for (const file of Array.from(files)) {
        const filePath = `${projectId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('project-documents')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase
          .from('project_documents')
          .insert({
            order_id: projectId,
            file_path: filePath,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: user.id,
          });
        if (insertError) throw insertError;
      }
      toast.success(`${files.length} file(s) uploaded`);
      fetchProjectData();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDocumentDelete = async (doc: any) => {
    try {
      await supabase.storage.from('project-documents').remove([doc.file_path]);
      await supabase.from('project_documents').delete().eq('id', doc.id);
      toast.success('Document deleted');
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (error: any) {
      toast.error(error.message || 'Delete failed');
    }
  };

  const getDocumentUrl = (filePath: string) => {
    const { data } = supabase.storage.from('project-documents').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageFile = (type: string) => type?.startsWith('image/');

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
  const totalCostsPaid = vendorPOs.reduce((sum, po) => sum + (po.total_paid || 0), 0);
  const accrualProfit = totalRevenue - totalCosts;
  const cashProfit = totalPaid - totalCostsPaid;
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
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isVibeAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-2'} gap-4`}>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {isVibeAdmin && plView === "accrual" ? "Total Revenue (Invoiced)" : isVibeAdmin ? "Total Received (Cash)" : "Total Invoiced"}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(isVibeAdmin ? (plView === "accrual" ? totalRevenue : totalPaid) : totalRevenue)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Total Paid - for customers only when not admin */}
        {!isVibeAdmin && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Paid</p>
                  <p className="text-xl font-bold text-success">{formatCurrency(totalPaid)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {/* Costs, P&L, and Margin - Vibe Admin only */}
        {isVibeAdmin && (
          <>
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
                    (plView === "accrual" ? accrualProfit : cashProfit) >= 0 ? 'bg-success/10' : 'bg-destructive/10'
                  }`}>
                    <TrendingUp className={`h-5 w-5 ${
                      (plView === "accrual" ? accrualProfit : cashProfit) >= 0 ? 'text-success' : 'text-destructive'
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
          </>
        )}
      </div>

      {/* View Toggle - Vibe Admin only */}
      {isVibeAdmin && (
        <div className="flex justify-end">
          <Tabs value={plView} onValueChange={(v) => setPlView(v as "accrual" | "cash")}>
            <TabsList>
              <TabsTrigger value="accrual">Accrual View</TabsTrigger>
              <TabsTrigger value="cash">Cash View</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Details Sections */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <LayoutList className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" />
            Invoices ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <Receipt className="h-4 w-4" />
            Payments ({payments.length})
          </TabsTrigger>
          <TabsTrigger value="customer-pos" className="gap-2">
            <Paperclip className="h-4 w-4" />
            Customer POs ({customerPOs.length})
          </TabsTrigger>
          {isVibeAdmin && (
            <TabsTrigger value="costs" className="gap-2">
              <Package className="h-4 w-4" />
              Vendor Bills ({vendorPOs.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="documents" className="gap-2">
            <ImageIcon className="h-4 w-4" />
            Documents ({documents.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">All Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Combine all transactions and sort by date */}
                  {[
                    ...invoices.map(inv => ({
                      type: 'invoice' as const,
                      id: inv.id,
                      reference: inv.invoice_number,
                      date: new Date(inv.invoice_date),
                      details: isBlanketOrder(inv) ? 'Blanket Order' : (inv.invoice_type || 'Standard'),
                      status: inv.status,
                      amount: isBlanketOrder(inv) ? 0 : (inv.total || 0),
                      isOrder: isBlanketOrder(inv),
                      onClick: () => navigate(`/invoices/${inv.id}`)
                    })),
                    ...payments.map(pay => {
                      const invoice = invoices.find(inv => inv.id === pay.invoice_id);
                      return {
                        type: 'payment' as const,
                        id: pay.id,
                        reference: pay.reference_number || `Payment for ${invoice?.invoice_number || '-'}`,
                        date: new Date(pay.payment_date),
                        details: pay.payment_method,
                        status: 'received',
                        amount: pay.amount,
                        isOrder: false,
                        onClick: () => {}
                      };
                    }),
                    ...vendorPOs.map(po => ({
                      type: 'vendor_po' as const,
                      id: po.id,
                      reference: po.po_number,
                      date: new Date(po.order_date),
                      details: (po.vendors as any)?.name || 'Unknown Vendor',
                      status: po.status,
                      amount: po.total || 0,
                      isOrder: false,
                      onClick: () => navigate(`/vendor-pos/${po.id}`)
                    })),
                    ...vendorPayments.map(vp => {
                      const po = vp.vendor_pos;
                      return {
                        type: 'vendor_payment' as const,
                        id: vp.id,
                        reference: vp.reference_number || `Payment for ${po?.po_number || '-'}`,
                        date: new Date(vp.payment_date),
                        details: `${po?.vendors?.name || 'Vendor'} • ${vp.payment_method?.replace('_', ' ')}`,
                        status: 'paid',
                        amount: vp.amount,
                        isOrder: false,
                        onClick: () => navigate(`/vendor-pos/${vp.vendor_po_id}`)
                      };
                    })
                  ]
                    .sort((a, b) => b.date.getTime() - a.date.getTime())
                    .map((item, idx) => (
                      <TableRow 
                        key={`${item.type}-${item.id}`}
                        className={`cursor-pointer hover:bg-muted/50 ${
                          item.isOrder ? 'bg-muted/30' :
                          item.type === 'invoice' ? 'bg-primary/5' : 
                          item.type === 'payment' ? 'bg-success/5' : 
                          item.type === 'vendor_payment' ? 'bg-destructive/5' :
                          'bg-warning/5'
                        }`}
                        onClick={item.onClick}
                      >
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`
                              ${item.isOrder ? 'border-muted-foreground/50 text-muted-foreground bg-muted/30' : ''}
                              ${!item.isOrder && item.type === 'invoice' ? 'border-primary/50 text-primary bg-primary/10' : ''}
                              ${item.type === 'payment' ? 'border-success/50 text-success bg-success/10' : ''}
                              ${item.type === 'vendor_po' ? 'border-warning/50 text-warning bg-warning/10' : ''}
                              ${item.type === 'vendor_payment' ? 'border-destructive/50 text-destructive bg-destructive/10' : ''}
                            `}
                          >
                            {item.isOrder ? 'Order' : 
                             item.type === 'invoice' ? 'Invoice' : 
                             item.type === 'payment' ? 'Payment In' : 
                             item.type === 'vendor_payment' ? 'Payment Out' :
                             'Vendor PO'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{item.reference}</TableCell>
                        <TableCell>{item.date.toLocaleDateString()}</TableCell>
                        <TableCell className="text-muted-foreground">{item.details}</TableCell>
                        <TableCell>
                          <Badge variant={item.status === 'paid' || item.status === 'received' || item.status === 'completed' ? 'default' : 'secondary'}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${
                          item.isOrder ? 'text-muted-foreground' :
                          item.type === 'invoice' ? 'text-primary' : 
                          item.type === 'payment' ? 'text-success' : 
                          item.type === 'vendor_payment' ? 'text-destructive' :
                          'text-warning'
                        }`}>
                          {(item.type === 'vendor_po' || item.type === 'vendor_payment') ? '-' : ''}{formatCurrency(item.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  }
                  {invoices.length === 0 && payments.length === 0 && vendorPOs.length === 0 && vendorPayments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No transactions for this project
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

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
                    const isParent = !invoice.parent_invoice_id && invoice.invoice_type === 'full';
                    const typeLabel = isParent ? 'Blanket' : invoice.invoice_type === 'partial' ? 'Shipped' : (invoice.invoice_type || 'Standard');
                    const balance = (invoice.total || 0) - (invoice.total_paid || 0);
                    return (
                      <TableRow 
                        key={invoice.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                      >
                        <TableCell className="font-medium">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell>{new Date(invoice.invoice_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{typeLabel}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={invoice.status === 'paid' ? 'default' : invoice.status === 'billed' ? 'default' : 'secondary'}>
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(invoice.total)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(invoice.total_paid || 0)}
                        </TableCell>
                        <TableCell className={`text-right ${balance > 0 ? 'text-orange-600' : ''}`}>
                          {formatCurrency(balance)}
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

        {/* Customer POs Tab */}
        <TabsContent value="customer-pos">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Customer Purchase Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerPOs.map((po) => {
                    const fileSizeKB = po.file_size ? (po.file_size / 1024).toFixed(1) : '-';
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Paperclip className="h-4 w-4 text-primary" />
                            {po.file_name}
                          </div>
                        </TableCell>
                        <TableCell>{new Date(po.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {po.file_size ? `${fileSizeKB} KB` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const { data } = await supabase.storage
                                .from('vibe-attachments')
                                .createSignedUrl(po.file_path, 3600);
                              if (data?.signedUrl) {
                                window.open(data.signedUrl, '_blank');
                              }
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {customerPOs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No customer POs attached to this project
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vendor Bills Tab */}
        <TabsContent value="costs">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vendor Bills (Costs)</CardTitle>
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
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Owed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendorPOs.map((po) => {
                    const poOwed = (po.total || 0) - (po.total_paid || 0);
                    return (
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
                          <Badge variant={
                            po.status === 'paid' ? 'default' : 
                            po.status === 'partial' ? 'default' : 
                            'destructive'
                          }>
                            {po.status === 'unpaid' ? 'Unpaid' : 
                             po.status === 'partial' ? 'Partial Paid' : 
                             po.status === 'paid' ? 'Paid' : po.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-red-600 font-medium">
                          {formatCurrency(po.total)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(po.total_paid || 0)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600 font-medium">
                          {formatCurrency(poOwed)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {vendorPOs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No vendor bills for this project
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {vendorPOs.length > 0 && (
                <div className="border-t p-4 bg-muted/30">
                  <div className="flex justify-end gap-8">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Costs</p>
                      <p className="text-lg font-bold text-red-600">{formatCurrency(totalCosts)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Paid</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(totalCostsPaid)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Owed</p>
                      <p className="text-lg font-bold text-orange-600">{formatCurrency(totalCosts - totalCostsPaid)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Project Documents</CardTitle>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleDocumentUpload(e.target.files)}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  size="sm"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload Files'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No documents uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documents.map((doc) => {
                    const url = getDocumentUrl(doc.file_path);
                    return (
                      <div key={doc.id} className="border border-border rounded-lg overflow-hidden">
                        {isImageFile(doc.file_type) ? (
                          <div className="h-40 bg-muted flex items-center justify-center overflow-hidden">
                            <img src={url} alt={doc.file_name} className="object-cover w-full h-full" />
                          </div>
                        ) : (
                          <div className="h-40 bg-muted flex items-center justify-center">
                            <File className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                        <div className="p-3 space-y-2">
                          <p className="text-sm font-medium truncate" title={doc.file_name}>{doc.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(doc.file_size)} • {new Date(doc.created_at).toLocaleDateString()}
                          </p>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1" asChild>
                              <a href={url} download={doc.file_name} target="_blank" rel="noopener noreferrer">
                                <Download className="h-3 w-3 mr-1" /> Download
                              </a>
                            </Button>
                            {isVibeAdmin && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDocumentDelete(doc)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                  <span className="text-muted-foreground">Costs Paid (Vendor POs)</span>
                  <span className="text-red-600">-{formatCurrency(totalCostsPaid)}</span>
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

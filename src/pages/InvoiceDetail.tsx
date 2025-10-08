import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, FileText, Edit, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const InvoiceDetail = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [vendorPOs, setVendorPOs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    if (invoiceId) {
      fetchInvoiceDetails();
    }
  }, [invoiceId]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      setIsVibeAdmin(data?.role === 'vibe_admin');
    }
  };

  const fetchInvoiceDetails = async () => {
    setLoading(true);
    
    // Fetch invoice with order details
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        orders(
          *,
          order_items(*)
        )
      `)
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoiceData) {
      toast({
        title: "Error",
        description: "Failed to load invoice",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    setInvoice(invoiceData);
    setOrder(invoiceData.orders);

    // Fetch vendor POs for this order
    const { data: vendorPOData } = await supabase
      .from('vendor_pos')
      .select(`
        *,
        vendors(name, contact_name, contact_email),
        vendor_po_items(*)
      `)
      .eq('order_id', invoiceData.order_id);

    if (vendorPOData) {
      setVendorPOs(vendorPOData);
    }

    setLoading(false);
  };

  const handleDeleteInvoice = async () => {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete invoice",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Invoice Deleted",
        description: "Invoice has been successfully deleted"
      });
      navigate('/invoices');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate totals
  const totalVendorCost = vendorPOs.reduce((sum, po) => sum + Number(po.total), 0);
  const totalRevenue = Number(invoice?.total || 0);
  const totalProfit = totalRevenue - totalVendorCost;
  const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : '0.00';

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading invoice...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Invoice not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Invoices
        </Button>
        <div className="flex gap-3">
          {isVibeAdmin && (
            <>
              <Button variant="outline" onClick={() => navigate(`/orders/${invoice.order_id}`)}>
                <Edit className="h-4 w-4 mr-2" />
                View Order
              </Button>
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </>
          )}
          <Button onClick={() => {}}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Invoice Header Card */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-table-border p-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold mb-2">{invoice.invoice_number}</h1>
                <p className="text-sm text-muted-foreground">
                  Order: {order?.order_number || 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Customer: {order?.customer_name || 'N/A'}
                </p>
                {order?.po_number && (
                  <p className="text-sm text-muted-foreground">
                    Customer PO: {order.po_number}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary capitalize">
                  {invoice.status.replace('_', ' ')}
                </span>
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{new Date(invoice.invoice_date).toLocaleDateString()}</p>
                </div>
                {invoice.due_date && (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-medium">{new Date(invoice.due_date).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Shipping Information */}
          <div className="p-8 border-b">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-semibold mb-3">Ship To</h3>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{order?.shipping_name}</p>
                  <p className="text-muted-foreground">{order?.shipping_street}</p>
                  <p className="text-muted-foreground">
                    {order?.shipping_city}, {order?.shipping_state} {order?.shipping_zip}
                  </p>
                </div>
              </div>
              {order?.billing_name && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Bill To</h3>
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{order?.billing_name}</p>
                    <p className="text-muted-foreground">{order?.billing_street}</p>
                    <p className="text-muted-foreground">
                      {order?.billing_city}, {order?.billing_state} {order?.billing_zip}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Order Items - Main Invoice View */}
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-4">Order Items</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order?.order_items?.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.description || '-'}
                    </TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(item.unit_price))}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(Number(item.total))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Invoice Totals */}
            <div className="flex justify-end mt-8">
              <div className="space-y-2 w-80">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{formatCurrency(Number(invoice.subtotal))}</span>
                </div>
                {Number(invoice.tax) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-semibold">{formatCurrency(Number(invoice.tax))}</span>
                  </div>
                )}
                <div className="h-px bg-border my-2"></div>
                <div className="flex justify-between">
                  <span className="text-lg font-semibold">Total</span>
                  <span className="text-2xl font-bold">{formatCurrency(Number(invoice.total))}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attached Vendor POs - For Admin View */}
      {isVibeAdmin && vendorPOs.length > 0 && (
        <Card className="shadow-lg">
          <CardContent className="p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-semibold">Attached Vendor Purchase Orders</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {vendorPOs.length} vendor PO{vendorPOs.length !== 1 ? 's' : ''} connected to this invoice
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Vendor Cost</p>
                <p className="text-xl font-bold text-danger">{formatCurrency(totalVendorCost)}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendorPOs.map((po) => (
                <Card key={po.id} className="border hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">
                          {po.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    
                    <h3 className="font-semibold mb-1">{po.vendors?.name || 'Unknown Vendor'}</h3>
                    <p className="text-xs text-muted-foreground mb-1">PO: {po.po_number}</p>
                    
                    {po.expected_delivery_date && (
                      <p className="text-xs text-muted-foreground mb-3">
                        Delivery: {new Date(po.expected_delivery_date).toLocaleDateString()}
                      </p>
                    )}
                    
                    <div className="flex justify-between items-center pt-3 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">PO Total</p>
                        <p className="text-lg font-bold">{formatCurrency(Number(po.total))}</p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(`/vendor-pos/${po.id}`)}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                    
                    <div className="mt-2 text-xs text-muted-foreground">
                      {po.vendor_po_items?.length || 0} item{po.vendor_po_items?.length !== 1 ? 's' : ''}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Profit Summary */}
            <div className="bg-muted/30 rounded-lg p-6 mt-6">
              <h3 className="text-sm font-semibold mb-4">Profit Analysis</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Revenue (Customer)</span>
                  <span className="font-semibold">{formatCurrency(totalRevenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Vendor Costs</span>
                  <span className="font-semibold text-danger">-{formatCurrency(totalVendorCost)}</span>
                </div>
                <div className="h-px bg-border my-2"></div>
                <div className="flex justify-between">
                  <span className="font-semibold">Net Profit</span>
                  <span className={`text-xl font-bold ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(totalProfit)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Profit Margin</span>
                  <span>{profitMargin}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInvoice} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InvoiceDetail;

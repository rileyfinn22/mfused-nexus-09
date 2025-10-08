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

          {/* Invoice Totals Summary */}
          <div className="p-8 border-b">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Customer Total</p>
                <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Vendor Cost</p>
                <p className="text-2xl font-bold text-danger">{formatCurrency(totalVendorCost)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Profit</p>
                <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(totalProfit)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {profitMargin}% margin
                </p>
              </div>
            </div>
          </div>

          {/* Vendor POs Section */}
          {isVibeAdmin && (
            <div className="p-8">
              <h2 className="text-lg font-semibold mb-4">Vendor Purchase Orders</h2>
              
              {vendorPOs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No vendor POs associated with this order</p>
              ) : (
                <div className="space-y-4">
                  {vendorPOs.map((po) => (
                    <Card key={po.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{po.vendors?.name || 'Unknown Vendor'}</h3>
                              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">
                                {po.status.replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">PO: {po.po_number}</p>
                            {po.expected_delivery_date && (
                              <p className="text-sm text-muted-foreground">
                                Expected: {new Date(po.expected_delivery_date).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground mb-1">PO Total</p>
                            <p className="text-xl font-bold">{formatCurrency(Number(po.total))}</p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-2"
                              onClick={() => navigate(`/vendor-pos/${po.id}`)}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              View PO
                            </Button>
                          </div>
                        </div>

                        {/* PO Items Table */}
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>SKU</TableHead>
                              <TableHead>Product</TableHead>
                              <TableHead className="text-center">Qty</TableHead>
                              <TableHead className="text-right">Unit Cost</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {po.vendor_po_items?.map((item: any) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                                <TableCell>
                                  <div>
                                    <p className="text-sm">{item.name}</p>
                                    {item.description && (
                                      <p className="text-xs text-muted-foreground">{item.description}</p>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">{item.quantity}</TableCell>
                                <TableCell className="text-right">{formatCurrency(Number(item.unit_cost))}</TableCell>
                                <TableCell className="text-right font-semibold">{formatCurrency(Number(item.total))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Profit Summary */}
          {isVibeAdmin && (
            <div className="bg-muted/30 p-8 border-t">
              <div className="flex justify-end">
                <div className="space-y-2 w-96">
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
            </div>
          )}
        </CardContent>
      </Card>

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

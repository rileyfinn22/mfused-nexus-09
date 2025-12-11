import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, FileText, Edit, Trash2, RefreshCw, Copy, ExternalLink, CheckCircle2, DollarSign, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuickBooksAutoSync } from "@/hooks/useQuickBooksAutoSync";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { SyncToQuickBooksDialog } from "@/components/SyncToQuickBooksDialog";
import { CreateShipmentInvoiceDialog } from "@/components/CreateShipmentInvoiceDialog";
import { InvoiceAuditLog } from "@/components/InvoiceAuditLog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
const InvoiceDetail = () => {
  const {
    invoiceId
  } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [invoice, setInvoice] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [vendorPOs, setVendorPOs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const [inventoryAllocations, setInventoryAllocations] = useState<any[]>([]);
  const [relatedInvoices, setRelatedInvoices] = useState<any[]>([]);
  const [totalShippedAllInvoices, setTotalShippedAllInvoices] = useState(0);
  const [syncingToQB, setSyncingToQB] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [refreshingLink, setRefreshingLink] = useState(false);
  const [syncingPayment, setSyncingPayment] = useState<string | null>(null);
  const [showPaymentPortal, setShowPaymentPortal] = useState(false);
  const {
    syncInvoice,
    checkConnection
  } = useQuickBooksAutoSync();
  useEffect(() => {
    checkAdminStatus();
    if (invoiceId) {
      fetchInvoiceDetails();
    }
  }, [invoiceId]);
  const checkAdminStatus = async () => {
    const {
      data: {
        user
      }
    } = await supabase.auth.getUser();
    if (user) {
      const {
        data
      } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
      setIsVibeAdmin(data?.role === 'vibe_admin');
    }
  };
  const fetchInvoiceDetails = async () => {
    setLoading(true);

    // Fetch invoice with order details and company info
    const {
      data: invoiceData,
      error: invoiceError
    } = await supabase
      .from('invoices')
      .select(`
        *,
        orders(
          *,
          order_items(*, shipped_quantity, quantity),
          parent_order:parent_order_id(id, order_number, order_type)
        ),
        companies!company_id(name)
      `)
      .eq('id', invoiceId)
      .order('created_at', { ascending: true, foreignTable: 'orders.order_items' })
      .single();
    if (invoiceError || !invoiceData) {
      console.error('Invoice fetch error:', invoiceError);
      toast({
        title: "Error",
        description: "Failed to load invoice",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }
    console.log('Fetched invoice with company:', invoiceData);
    setInvoice(invoiceData);
    setOrder(invoiceData.orders);

    // Fetch inventory allocations for this invoice to get actual pulled items
    const {
      data: allocationsData
    } = await supabase
      .from('inventory_allocations')
      .select(`
        *,
        order_items(id, name, sku, unit_price, quantity, shipped_quantity, item_id, description),
        inventory(state, available)
      `)
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true })
      .order('created_at', { ascending: true, foreignTable: 'order_items' });
    if (allocationsData) {
      setInventoryAllocations(allocationsData);

      // ALWAYS use allocated items for display, regardless of invoice type
      // This shows only what was actually included on THIS specific invoice
      if (allocationsData.length > 0) {
        const invoiceItems = allocationsData.map((alloc: any) => ({
          ...alloc.order_items,
          quantity: alloc.quantity_allocated,
          // Use allocated quantity as the quantity for this invoice
          shipped_quantity: alloc.quantity_allocated,
          total: alloc.quantity_allocated * (alloc.order_items?.unit_price || 0)
        }));
        setEditedItems(invoiceItems);
      } else {
        // No allocations yet - show empty or all items based on invoice type
        setEditedItems(invoiceData.invoice_type === 'full' ? invoiceData.orders?.order_items || [] : []);
      }
    } else {
      setEditedItems(invoiceData.orders?.order_items || []);
    }

    // Fetch vendor POs for this order
    const {
      data: vendorPOData
    } = await supabase.from('vendor_pos').select(`
        *,
        vendors(name, contact_name, contact_email),
        vendor_po_items(*)
      `).eq('order_id', invoiceData.order_id).order('created_at', { ascending: true });
    
    // Sort vendor_po_items by created_at for each PO
    if (vendorPOData) {
      vendorPOData.forEach(po => {
        if (po.vendor_po_items) {
          po.vendor_po_items.sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
      });
      setVendorPOs(vendorPOData);
    }

    // Fetch related invoices for the same order
    const {
      data: relatedData
    } = await supabase.from('invoices').select('*').eq('order_id', invoiceData.order_id).neq('id', invoiceId).order('shipment_number');
    if (relatedData) {
      setRelatedInvoices(relatedData);
    }

    // Fetch ALL inventory allocations for ALL invoices connected to this order (for progress calculation)
    const {
      data: allAllocations
    } = await supabase.from('inventory_allocations').select(`
        quantity_allocated,
        invoice_id,
        invoices!inner(order_id)
      `).eq('invoices.order_id', invoiceData.order_id);

    // Calculate total shipped across all invoices for this order
    const totalShippedAcrossAllInvoices = allAllocations?.reduce((sum, alloc) => sum + Number(alloc.quantity_allocated || 0), 0) || 0;
    setTotalShippedAllInvoices(totalShippedAcrossAllInvoices);
    console.log('Total shipped across all invoices:', totalShippedAcrossAllInvoices);

    // Fetch payments - if this is a blanket invoice (full type, shipment 1), get all payments from partial invoices
    const isBlanketInvoice = invoiceData.invoice_type === 'full' && invoiceData.shipment_number === 1;
    
    let paymentsData;
    if (isBlanketInvoice) {
      // Get all invoice IDs for this order (including this one and all related)
      const allInvoiceIds = [invoiceId];
      if (relatedData && relatedData.length > 0) {
        allInvoiceIds.push(...relatedData.map(inv => inv.id));
      }
      
      console.log('Fetching payments for blanket invoice, all IDs:', allInvoiceIds);
      
      // Fetch all payments for all invoices with invoice details
      const { data: allPayments, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .in('invoice_id', allInvoiceIds)
        .order('payment_date', { ascending: false });
      
      if (paymentsError) {
        console.error('Error fetching payments:', paymentsError);
      }
      
      // Add invoice info to each payment manually
      if (allPayments) {
        const paymentsWithInvoices = allPayments.map(payment => {
          const relatedInvoice = relatedData?.find(inv => inv.id === payment.invoice_id);
          return {
            ...payment,
            invoices: relatedInvoice ? {
              invoice_number: relatedInvoice.invoice_number,
              invoice_type: relatedInvoice.invoice_type,
              shipment_number: relatedInvoice.shipment_number
            } : (payment.invoice_id === invoiceId ? {
              invoice_number: invoiceData.invoice_number,
              invoice_type: invoiceData.invoice_type,
              shipment_number: invoiceData.shipment_number
            } : null)
          };
        });
        paymentsData = paymentsWithInvoices;
      }
    } else {
      // Regular invoice - only show payments for this invoice
      const { data: singleInvoicePayments } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: false });
      
      paymentsData = singleInvoicePayments;
    }
    
    if (paymentsData) {
      console.log('Setting payments:', paymentsData);
      setPayments(paymentsData);
    }
    setLoading(false);
  };
  const handleDeleteInvoice = async () => {
    try {
      // If invoice is synced to QuickBooks, delete from QB first
      if (invoice?.quickbooks_id) {
        const isConnected = await checkConnection();
        if (isConnected) {
          const {
            error: qbError
          } = await supabase.functions.invoke('quickbooks-delete-invoice', {
            body: {
              invoiceId
            }
          });
          if (qbError) {
            console.error('QuickBooks deletion failed:', qbError);
            toast({
              title: "Warning",
              description: "Failed to delete from QuickBooks, but will delete locally",
              variant: "destructive"
            });
          }
        }
      }

      // Restore quantities and inventory (but keep allocation records for audit trail)
      const isDeposit = invoice?.notes && invoice.notes.includes('deposit payment');
      if (!isDeposit) {
        const {
          data: allocations
        } = await supabase.from('inventory_allocations').select('*').eq('invoice_id', invoiceId);
        if (allocations && allocations.length > 0) {
          for (const allocation of allocations) {
            // Restore inventory quantity
            if (allocation.inventory_id) {
              const {
                data: currentInv
              } = await supabase.from('inventory').select('available').eq('id', allocation.inventory_id).single();
              if (currentInv) {
                await supabase.from('inventory').update({
                  available: currentInv.available + allocation.quantity_allocated
                }).eq('id', allocation.inventory_id);
              }
            }

            // Restore order item shipped_quantity
            const {
              data: currentItem
            } = await supabase.from('order_items').select('shipped_quantity').eq('id', allocation.order_item_id).single();
            if (currentItem) {
              await supabase.from('order_items').update({
                shipped_quantity: Math.max(0, (currentItem.shipped_quantity || 0) - allocation.quantity_allocated)
              }).eq('id', allocation.order_item_id);
            }
            // DON'T delete allocation - keep it for audit trail
          }
        }
      }

      // Soft delete the invoice (keeps all related records intact)
      const {
        error
      } = await supabase.from('invoices').update({ 
        deleted_at: new Date().toISOString() 
      }).eq('id', invoiceId);
      if (error) {
        toast({
          title: "Error",
          description: "Failed to delete invoice",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Invoice Deleted",
          description: "Invoice moved to archive and quantities restored. You can recover it from the deleted archive."
        });
        navigate('/invoices');
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast({
        title: "Error",
        description: "An error occurred while deleting the invoice",
        variant: "destructive"
      });
    }
  };
  const handleSaveQuantities = async () => {
    try {
      // Update each order item
      for (const item of editedItems) {
        const newTotal = Number(item.shipped_quantity) * Number(item.unit_price);
        const {
          error
        } = await supabase.from('order_items').update({
          shipped_quantity: item.shipped_quantity,
          unit_price: item.unit_price,
          total: newTotal
        }).eq('id', item.id);
        if (error) throw error;
      }

      // Recalculate order totals
      const newSubtotal = editedItems.reduce((sum, item) => sum + Number(item.shipped_quantity) * Number(item.unit_price), 0);
      const newTotal = newSubtotal + Number(invoice.tax);

      // Update order totals
      const {
        error: orderError
      } = await supabase.from('orders').update({
        subtotal: newSubtotal,
        total: newTotal
      }).eq('id', invoice.order_id);
      if (orderError) throw orderError;

      // Update invoice totals
      const {
        error: invoiceError
      } = await supabase.from('invoices').update({
        subtotal: newSubtotal,
        total: newTotal
      }).eq('id', invoiceId);
      if (invoiceError) throw invoiceError;
      toast({
        title: "Success",
        description: "Prices and quantities updated successfully"
      });
      setIsEditMode(false);
      fetchInvoiceDetails();
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update items",
        variant: "destructive"
      });
    }
  };
  const handlePriceChange = (itemId: string, newPrice: number) => {
    setEditedItems(items => items.map(item => item.id === itemId ? {
      ...item,
      unit_price: newPrice,
      total: Number(item.shipped_quantity) * newPrice
    } : item));
  };
  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity < 0) return;
    setEditedItems(items => items.map(item => item.id === itemId ? {
      ...item,
      quantity: newQuantity,
      shipped_quantity: newQuantity,
      total: newQuantity * Number(item.unit_price)
    } : item));
  };
  const handleSyncToQuickBooks = async (billingPercentage: number) => {
    if (!invoiceId) return;
    setSyncingToQB(true);
    try {
      const isConnected = await checkConnection();
      if (!isConnected) {
        toast({
          title: "Not Connected",
          description: "QuickBooks is not connected. Please connect in Settings.",
          variant: "destructive"
        });
        return;
      }

      // Call edge function with billing percentage
      const {
        error
      } = await supabase.functions.invoke('quickbooks-sync-invoice', {
        body: {
          invoiceId,
          billingPercentage
        }
      });
      if (error) {
        throw error;
      }
      toast({
        title: "Sync Successful",
        description: `Invoice synced to QuickBooks with ${billingPercentage}% billing`
      });

      // Close dialog and refresh invoice details
      setShowSyncDialog(false);
      setTimeout(() => fetchInvoiceDetails(), 2000);
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync invoice to QuickBooks",
        variant: "destructive"
      });
    } finally {
      setSyncingToQB(false);
    }
  };
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };
  const handleCopyPaymentLink = async () => {
    if (invoice?.quickbooks_payment_link) {
      try {
        await navigator.clipboard.writeText(invoice.quickbooks_payment_link);
        setCopiedLink(true);
        toast({
          title: "Payment link copied",
          description: "The payment link has been copied to your clipboard"
        });
        setTimeout(() => setCopiedLink(false), 2000);
      } catch (error) {
        toast({
          title: "Failed to copy",
          description: "Could not copy the payment link",
          variant: "destructive"
        });
      }
    }
  };
  const handleRefreshPaymentLink = async () => {
    if (!invoice?.quickbooks_id) return;
    setRefreshingLink(true);
    try {
      const isConnected = await checkConnection();
      if (!isConnected) {
        toast({
          title: "Not Connected",
          description: "QuickBooks is not connected",
          variant: "destructive"
        });
        return;
      }

      // Re-sync to get updated payment link
      const {
        error
      } = await supabase.functions.invoke('quickbooks-sync-invoice', {
        body: {
          invoiceId,
          billingPercentage: invoice.billed_percentage || 100
        }
      });
      if (error) throw error;
      toast({
        title: "Link Updated",
        description: "Payment link has been refreshed"
      });
      setTimeout(() => fetchInvoiceDetails(), 1000);
    } catch (error: any) {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh payment link",
        variant: "destructive"
      });
    } finally {
      setRefreshingLink(false);
    }
  };
  const handleSyncPayment = async (paymentId: string) => {
    setSyncingPayment(paymentId);
    try {
      const isConnected = await checkConnection();
      if (!isConnected) {
        toast({
          title: "Not Connected",
          description: "QuickBooks is not connected. Please connect in Settings.",
          variant: "destructive"
        });
        return;
      }

      // Check if invoice is synced first
      if (!invoice?.quickbooks_id) {
        toast({
          title: "Invoice Not Synced",
          description: "Please sync the invoice to QuickBooks first before syncing payments.",
          variant: "destructive"
        });
        return;
      }
      const {
        error
      } = await supabase.functions.invoke('quickbooks-sync-payment', {
        body: {
          paymentId
        }
      });
      if (error) throw error;
      toast({
        title: "Payment Synced",
        description: "Payment successfully synced to QuickBooks"
      });

      // Refresh to show updated sync status
      setTimeout(() => fetchInvoiceDetails(), 1000);
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync payment to QuickBooks",
        variant: "destructive"
      });
    } finally {
      setSyncingPayment(null);
    }
  };
  const handleCloseInvoice = async () => {
    if (!confirm('Mark this invoice as closed? This indicates the blanket order is complete.')) {
      return;
    }
    try {
      const {
        error
      } = await supabase.from('invoices').update({
        status: 'closed'
      }).eq('id', invoiceId);
      if (error) throw error;
      toast({
        title: "Invoice Closed",
        description: "Invoice has been marked as closed"
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to close invoice",
        variant: "destructive"
      });
    }
  };

  // Calculate totals based on items actually on THIS invoice (from allocations)
  // For edit mode, recalculate. Otherwise use stored invoice.total
  const displayItems = editedItems;
  const displaySubtotal = isEditMode ? displayItems.reduce((sum: number, item: any) => sum + Number(item.quantity || item.shipped_quantity) * Number(item.unit_price), 0) : Number(invoice?.subtotal || 0);
  const displayTotal = isEditMode ? displaySubtotal + Number(invoice?.tax || 0) + Number(invoice?.shipping_cost || 0) : Number(invoice?.total || 0);

  // Calculate shipped percentage from actual quantities
  const calculateShippedPercentage = () => {
    if (!order?.order_items) return 0;
    const totalOrdered = order.order_items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const totalShipped = order.order_items.reduce((sum: number, item: any) => sum + Number(item.shipped_quantity || 0), 0);
    return totalOrdered > 0 ? totalShipped / totalOrdered * 100 : 0;
  };
  const shippedPercentage = calculateShippedPercentage();
  const totalVendorCost = vendorPOs.reduce((sum, po) => sum + Number(po.total), 0);
  const totalProfit = displayTotal - totalVendorCost;
  const profitMargin = displayTotal > 0 ? (totalProfit / displayTotal * 100).toFixed(2) : '0.00';
  if (loading) {
    return <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading invoice...</p>
      </div>;
  }
  if (!invoice) {
    return <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Invoice not found</p>
      </div>;
  }
  return <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Invoices
        </Button>
        <div className="flex gap-3">
          {isVibeAdmin && <>
              {isEditMode ? <>
                  <Button variant="outline" onClick={() => {
              setIsEditMode(false);
              setEditedItems(order?.order_items || []);
            }}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveQuantities}>
                    Save Changes
                  </Button>
                </> : <>
                  <Button variant="outline" onClick={() => setIsEditMode(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Items
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/orders/${invoice.order_id}`)}>
                    View Order
                  </Button>
                  <Button variant="outline" onClick={() => setShowSyncDialog(true)} disabled={syncingToQB}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncingToQB ? 'animate-spin' : ''}`} />
                    {invoice.quickbooks_sync_status === 'synced' ? 'Re-Bill in QuickBooks' : 'Bill in QuickBooks'}
                  </Button>
                  {invoice.quickbooks_id && <Button variant="outline" onClick={handleRefreshPaymentLink} disabled={refreshingLink}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${refreshingLink ? 'animate-spin' : ''}`} />
                      {refreshingLink ? 'Getting Link...' : 'Get Payment Link'}
                    </Button>}
                  <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </>}
              {invoice.status !== 'paid' && <Button onClick={() => setShowPaymentDialog(true)}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>}
              {invoice.invoice_type === 'full' && invoice.shipment_number === 1 && <Button variant="outline" onClick={() => setShowDepositDialog(true)} className="border-blue-500 text-blue-700 hover:bg-blue-50">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Bill Deposit
                </Button>}
              {invoice.invoice_type === 'full' && invoice.status !== 'closed' && <Button variant="outline" onClick={handleCloseInvoice} className="border-green-500 text-green-700 hover:bg-green-50">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Close Invoice
                </Button>}
            </>}
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
            {/* Parent Order Link for Pull & Ship */}
            {order?.order_type === 'pull_ship' && order?.parent_order && <div className="mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-sm font-medium mb-1">Pull & Ship Invoice - Linked to Production Order:</p>
                <Button variant="link" className="p-0 h-auto font-mono text-blue-600" onClick={() => navigate(`/orders/${order.parent_order.id}`)}>
                  {order.parent_order.order_number}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  This invoice bills against inventory from the production order above
                </p>
              </div>}
            
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold mb-2">{invoice.invoice_number}</h1>
                {invoice.shipment_number && <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md font-mono text-sm">
                      Shipment #{invoice.shipment_number}
                    </span>
                    <span className="px-3 py-1 rounded-md text-sm font-medium bg-purple-500 text-white">
                      {invoice.invoice_type?.toUpperCase() || 'INVOICE'}
                    </span>
                    {(() => {
                  const totalShipped = order?.order_items?.reduce((sum: number, item: any) => sum + (item.shipped_quantity || 0), 0) || 0;
                  const totalOrdered = order?.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;
                  const shippedPercentage = totalOrdered > 0 ? totalShipped / totalOrdered * 100 : 0;
                  if (shippedPercentage === 0) {
                    return <span className="text-sm font-medium text-orange-600">
                            Not Shipped Yet
                          </span>;
                  } else if (shippedPercentage < 100) {
                    return <span className="text-sm font-medium text-blue-600">
                            {shippedPercentage.toFixed(1)}% Physically Shipped
                          </span>;
                  } else {
                    return <span className="text-sm font-medium text-green-600">
                            Fully Shipped
                          </span>;
                  }
                })()}
                  </div>}
                <p className="text-sm text-muted-foreground">
                  Order: {order?.order_number || 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Customer: {(invoice?.companies as any)?.name || 'N/A'}
                </p>
                {order?.po_number && <p className="text-sm text-muted-foreground">
                    Customer PO: {order.po_number}
                  </p>}
              </div>
              <div className="text-right">
                <Select
                  value={invoice.status}
                  onValueChange={async (newStatus) => {
                    const { error } = await supabase
                      .from("invoices")
                      .update({ status: newStatus })
                      .eq("id", invoice.id);

                    if (error) {
                      console.error("Error updating invoice status:", error);
                      toast({
                        title: "Error",
                        description: "Failed to update invoice status",
                        variant: "destructive"
                      });
                    } else {
                      toast({
                        title: "Status Updated",
                        description: "Invoice status successfully updated"
                      });
                      fetchInvoiceDetails();
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">PENDING DUE</SelectItem>
                    <SelectItem value="open">DUE</SelectItem>
                    <SelectItem value="paid">PAID</SelectItem>
                    <SelectItem value="closed">CLOSED</SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{new Date(invoice.invoice_date).toLocaleDateString()}</p>
                </div>
                {invoice.due_date && <div className="mt-2">
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-medium">{new Date(invoice.due_date).toLocaleDateString()}</p>
                  </div>}
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
              {order?.billing_name && <div>
                  <h3 className="text-sm font-semibold mb-3">Bill To</h3>
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{order?.billing_name}</p>
                    <p className="text-muted-foreground">{order?.billing_street}</p>
                    <p className="text-muted-foreground">
                      {order?.billing_city}, {order?.billing_state} {order?.billing_zip}
                    </p>
                  </div>
                </div>}
            </div>
          </div>

          {/* QuickBooks Payment Link */}
          {invoice.quickbooks_id && (
            showPaymentPortal ? (
              <div className="p-8 border-b bg-gradient-to-r from-green-500/10 to-emerald-500/5">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        Customer Payment Portal
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
                          QuickBooks
                        </Badge>
                      </h3>
                      <Button variant="ghost" size="sm" onClick={() => setShowPaymentPortal(false)}>
                        Close
                      </Button>
                    </div>
                    
                    {/* Payment Details */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="bg-background/50 border rounded-lg p-4">
                        <div className="text-sm text-muted-foreground mb-1">Amount Due</div>
                        <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                          {formatCurrency(Number(displayTotal) - Number(invoice.total_paid || 0))}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          of {formatCurrency(Number(displayTotal))} total
                        </div>
                      </div>
                      
                      <div className="bg-background/50 border rounded-lg p-4">
                        <div className="text-sm text-muted-foreground mb-1">Due Date</div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-semibold text-xl h-auto py-1",
                                !invoice.due_date && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {invoice.due_date ? format(new Date(invoice.due_date), "MMM d, yyyy") : "Set Due Date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={invoice.due_date ? new Date(invoice.due_date) : undefined}
                              onSelect={async (date) => {
                                if (date) {
                                  const { error } = await supabase
                                    .from('invoices')
                                    .update({ due_date: date.toISOString() })
                                    .eq('id', invoice.id);
                                  
                                  if (error) {
                                    toast({ title: "Error", description: "Failed to update due date", variant: "destructive" });
                                  } else {
                                    setInvoice({ ...invoice, due_date: date.toISOString() });
                                    toast({ title: "Due date updated" });
                                  }
                                }
                              }}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      
                      <div className="bg-background/50 border rounded-lg p-4">
                        <div className="text-sm text-muted-foreground mb-1">Status</div>
                        <Select
                          value={invoice.status}
                          onValueChange={async (value) => {
                            const { error } = await supabase
                              .from('invoices')
                              .update({ status: value })
                              .eq('id', invoice.id);
                            
                            if (error) {
                              toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
                            } else {
                              setInvoice({ ...invoice, status: value });
                              toast({ title: "Status updated" });
                            }
                          }}
                        >
                          <SelectTrigger className="w-full text-xl font-semibold h-auto py-1">
                            <SelectValue>
                              {invoice.status === 'paid' && <span className="text-green-600">PAID</span>}
                              {invoice.status === 'open' && <span className="text-yellow-600">OPEN</span>}
                              {invoice.status === 'due' && <span className="text-red-600">DUE</span>}
                              {!['paid', 'open', 'due'].includes(invoice.status) && <span>{invoice.status?.toUpperCase()}</span>}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">
                              <span className="text-yellow-600 font-medium">OPEN</span>
                            </SelectItem>
                            <SelectItem value="due">
                              <span className="text-red-600 font-medium">DUE</span>
                            </SelectItem>
                            <SelectItem value="paid">
                              <span className="text-green-600 font-medium">PAID</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {invoice.quickbooks_payment_link && invoice.quickbooks_payment_link.startsWith('http') ? <>
                        <p className="text-sm text-muted-foreground mb-4">
                          Share this secure payment link with your customer to accept online payments through QuickBooks
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex-1 min-w-[300px] bg-background border rounded-lg p-3 font-mono text-sm truncate">
                            {invoice.quickbooks_payment_link}
                          </div>
                          <Button variant="default" size="sm" onClick={handleCopyPaymentLink} className="gap-2">
                            {copiedLink ? <>
                                <CheckCircle2 className="h-4 w-4" />
                                Copied!
                              </> : <>
                                <Copy className="h-4 w-4" />
                                Copy Link
                              </>}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => window.open(invoice.quickbooks_payment_link, '_blank')} className="gap-2">
                            <ExternalLink className="h-4 w-4" />
                            Preview
                          </Button>
                        </div>
                      </> : invoice.quickbooks_id ? <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Invoice synced to QuickBooks but payment link is not available yet.
                        </p>
                        <Button variant="outline" size="sm" onClick={handleRefreshPaymentLink} disabled={refreshingLink} className="gap-2">
                          {refreshingLink ? <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Refreshing...
                            </> : <>
                              <RefreshCw className="h-4 w-4" />
                              Refresh Payment Link
                            </>}
                        </Button>
                      </div> : <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                        <p className="text-sm text-muted-foreground">
                          Payment link will be available after syncing. Click "Bill" above to sync this invoice to QuickBooks.
                        </p>
                      </div>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 border-b">
                <Button 
                  onClick={() => setShowPaymentPortal(true)}
                  className="gap-2"
                  variant="outline"
                >
                  <DollarSign className="h-4 w-4" />
                  Get Payment Link
                </Button>
              </div>
            )
          )}

          {/* Order Items - Main Invoice View */}
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-4">
              Order Items
              {invoice?.invoice_type === 'partial' && <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (Items in this shipment only)
                </span>}
              {isEditMode && <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (Editing Mode - Adjust quantities and prices as needed)
                </span>}
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Ordered</TableHead>
                  <TableHead className="text-center">
                    {invoice?.invoice_type === 'partial' ? 'In Shipment' : 'Shipped'}
                  </TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayItems.map((item: any) => {
                // For blanket (full) invoices, show the original order quantity and actual shipped quantity from DB
                // For partial invoices, show only the items in this shipment
                const orderedQty = invoice?.invoice_type === 'partial' ? item.quantity || 0 : order?.order_items?.find((oi: any) => oi.sku === item.sku)?.quantity || item.quantity;

                // For blanket invoices, get the real shipped_quantity from order_items
                // For partial invoices, show the quantity in this shipment
                const shippedQty = invoice?.invoice_type === 'partial' ? item.quantity || 0 : order?.order_items?.find((oi: any) => oi.sku === item.sku)?.shipped_quantity || 0;
                return <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.description || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {orderedQty}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditMode ? <Input type="number" min="0" value={shippedQty} onChange={e => handleQuantityChange(item.id, parseInt(e.target.value) || 0)} className="w-24 text-center" /> : shippedQty}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditMode ? <Input type="number" step="0.01" min="0" value={item.unit_price} onChange={e => handlePriceChange(item.id, parseFloat(e.target.value) || 0)} className="w-28 text-right" /> : formatCurrency(Number(item.unit_price))}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(shippedQty * Number(item.unit_price))}
                      </TableCell>
                    </TableRow>;
              })}
              </TableBody>
            </Table>

            {/* Billing Breakdown - Only for child invoices (deposits and shipments) */}

            {/* Invoice Totals */}
            <div className="flex justify-end mt-8">
              <div className="space-y-2 w-80">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{formatCurrency(displaySubtotal)}</span>
                </div>
                <div className="h-px bg-border my-2"></div>
                <div className="flex justify-between">
                  <span className="text-lg font-semibold">Total</span>
                  <span className="text-2xl font-bold">{formatCurrency(displayTotal)}</span>
                </div>
                {isEditMode && <p className="text-xs text-muted-foreground italic mt-2">
                    Totals will be saved when you click "Save Changes"
                  </p>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card className="shadow-lg">
        <CardContent className="p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Payment History</h2>
            
            {/* Billing Against Blanket Invoice */}
            {(() => {
            const isPartialInvoice = invoice.shipment_number > 1 && invoice.invoice_type !== 'full';
            const blanketInvoice = isPartialInvoice ? relatedInvoices.find(inv => inv.invoice_type === 'full' && inv.shipment_number === 1) : null;
            if (!blanketInvoice) return null;
            const blanketTotal = Number(blanketInvoice.total || 0);
            const totalBilled = relatedInvoices.filter(inv => inv.shipment_number > 1).reduce((sum, inv) => sum + Number(inv.total || 0), 0);
            return <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h3 className="text-base font-semibold mb-4 text-blue-900 dark:text-blue-100">Billing Against Blanket Invoice</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between pb-2 border-b border-blue-200 dark:border-blue-700">
                      <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Blanket Invoice Total</span>
                      <span className="text-lg font-bold text-blue-900 dark:text-blue-100">{formatCurrency(blanketTotal)}</span>
                    </div>
                    
                    {/* List partial invoices */}
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Partial Invoices:</p>
                      {relatedInvoices.filter(inv => inv.shipment_number > 1).sort((a, b) => a.shipment_number - b.shipment_number).map(inv => {
                    const isCurrentInvoice = inv.id === invoice.id;
                    return <div key={inv.id} className={`flex justify-between text-sm py-1 ${isCurrentInvoice ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-muted-foreground'}`}>
                              <span>
                                {inv.invoice_number}
                                {isCurrentInvoice && ' (This Invoice)'}
                                {inv.notes && inv.notes.includes('deposit') && ' - Deposit'}
                              </span>
                              <span>{formatCurrency(Number(inv.total || 0))}</span>
                            </div>;
                  })}
                    </div>
                    <div className="h-px bg-blue-200 dark:bg-blue-800 my-2"></div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-blue-900 dark:text-blue-100">Total Billed</span>
                      <span className="text-lg font-bold text-blue-900 dark:text-blue-100">
                        {formatCurrency(totalBilled)}
                      </span>
                    </div>
                    
                  </div>
                </div>;
          })()}
          </div>

          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-sm text-muted-foreground">
                {payments.length} payment{payments.length !== 1 ? 's' : ''} recorded
              </p>
            </div>
            
            {/* For Blanket Invoices - Show three totals */}
            {invoice.invoice_type === 'full' && invoice.shipment_number === 1 ? (
              <div className="text-right space-y-2">
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">Blanket Invoice Total</p>
                    <p className="text-lg font-semibold">{formatCurrency(Number(invoice.total || 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Shipped Invoice Total</p>
                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(relatedInvoices
                        .filter(inv => inv.shipment_number > 1)
                        .reduce((sum, inv) => sum + Number(inv.total || 0), 0)
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Paid Total</p>
                    <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-right space-y-1">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Total</p>
                  <p className="text-lg font-semibold">{formatCurrency(displayTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-semibold text-success">{formatCurrency(invoice.total_paid || 0)}</p>
                </div>
              </div>
            )}
          </div>

          {payments.length > 0 ? <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {invoice.invoice_type === 'full' && invoice.shipment_number === 1 && <TableHead>Invoice</TableHead>}
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  {isVibeAdmin && <TableHead>QuickBooks</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(payment => <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {new Date(payment.payment_date).toLocaleDateString()}
                    </TableCell>
                    {invoice.invoice_type === 'full' && invoice.shipment_number === 1 && (
                      <TableCell className="font-mono text-xs">
                        {payment.invoices?.invoice_number || '-'}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {payment.payment_method.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {payment.reference_number || '-'}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-success">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {payment.notes || '-'}
                    </TableCell>
                    {isVibeAdmin && <TableCell>
                        <div className="flex items-center gap-2">
                          {payment.quickbooks_sync_status === 'synced' ? <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Synced
                            </Badge> : payment.quickbooks_sync_status === 'error' ? <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                              Error
                            </Badge> : !invoice?.quickbooks_id ? <Badge variant="outline" className="bg-muted text-muted-foreground">
                              Invoice not synced
                            </Badge> : <Button size="sm" variant="outline" onClick={() => handleSyncPayment(payment.id)} disabled={syncingPayment === payment.id}>
                              {syncingPayment === payment.id ? <>
                                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                  Syncing...
                                </> : <>
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Sync
                                </>}
                            </Button>}
                        </div>
                      </TableCell>}
                  </TableRow>)}
              </TableBody>
            </Table> : <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No payments recorded yet</p>
              <p className="text-sm mt-1">Click "Record Payment" to add a payment</p>
            </div>}
        </CardContent>
      </Card>

      {/* Attached Vendor POs - For Admin View on Full Invoices and Pull & Ship */}
      {isVibeAdmin && (invoice?.invoice_type === 'full' || order?.order_type === 'pull_ship') && vendorPOs.length > 0 && <Card className="shadow-lg">
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
              {vendorPOs.map(po => <Card key={po.id} className="border hover:border-primary/50 transition-colors">
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
                    
                    {po.expected_delivery_date && <p className="text-xs text-muted-foreground mb-3">
                        Delivery: {new Date(po.expected_delivery_date).toLocaleDateString()}
                      </p>}
                    
                    <div className="flex justify-between items-center pt-3 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">PO Total</p>
                        <p className="text-lg font-bold">{formatCurrency(Number(po.total))}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => {
                          // Generate and download PDF for this PO
                          const doc = new jsPDF();
                          
                          // Header
                          doc.setFontSize(20);
                          doc.text("VENDOR PURCHASE ORDER", 105, 20, { align: "center" });
                          
                          // PO Info
                          doc.setFontSize(12);
                          doc.text(`PO Number: ${po.po_number}`, 20, 40);
                          doc.text(`Order Date: ${new Date(po.order_date).toLocaleDateString()}`, 20, 48);
                          doc.text(`Status: ${po.status.replace('_', ' ').toUpperCase()}`, 20, 56);
                          
                          if (po.expected_delivery_date) {
                            doc.text(`Expected Delivery: ${new Date(po.expected_delivery_date).toLocaleDateString()}`, 20, 64);
                          }

                          // Vendor Info
                          doc.setFontSize(14);
                          doc.text("Vendor Information", 20, 80);
                          doc.setFontSize(11);
                          doc.text(`${po.vendors?.name || 'Unknown'}`, 20, 88);

                          // Items table
                          const tableData = (po.vendor_po_items || []).map((item: any) => [
                            item.sku,
                            item.name,
                            item.description || '',
                            item.quantity.toString(),
                            `$${Number(item.unit_cost).toFixed(3)}`,
                            `$${Number(item.total).toFixed(2)}`
                          ]);

                          autoTable(doc, {
                            startY: 100,
                            head: [['SKU', 'Product', 'Description', 'Quantity', 'Unit Cost', 'Total']],
                            body: tableData,
                            theme: 'grid',
                            headStyles: { fillColor: [66, 66, 66] },
                          });

                          // Total
                          const finalY = (doc as any).lastAutoTable.finalY || 100;
                          doc.setFontSize(14);
                          doc.text(`Total: ${formatCurrency(Number(po.total))}`, 150, finalY + 15);

                          // Save
                          doc.save(`vendor-po-${po.po_number}.pdf`);
                          
                          toast({
                            title: "PDF Downloaded",
                            description: "Vendor PO has been downloaded"
                          });
                        }}>
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/vendor-pos/${po.id}?returnTo=/invoices/${invoiceId}`)}>
                          <FileText className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                    
                    <div className="mt-2 text-xs text-muted-foreground">
                      {po.vendor_po_items?.length || 0} item{po.vendor_po_items?.length !== 1 ? 's' : ''}
                    </div>
                  </CardContent>
                </Card>)}
            </div>

            {/* Profit Summary */}
            <div className="bg-muted/30 rounded-lg p-6 mt-6">
              <h3 className="text-sm font-semibold mb-4">Profit Analysis</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Revenue (Customer)</span>
                  <span className="font-semibold">{formatCurrency(displayTotal)}</span>
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
        </Card>}

      {/* Inventory Allocations - For Admin View - Only show if there's actual inventory tracked */}
      {isVibeAdmin && inventoryAllocations.length > 0 && inventoryAllocations.some((a: any) => a.inventory_id !== null) && <Card className="shadow-lg">
          <CardContent className="p-8">
            <h2 className="text-lg font-semibold mb-4">Inventory Allocations</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Inventory pulled for this shipment from warehouse locations
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Inventory SKU</TableHead>
                  <TableHead>Location (State)</TableHead>
                  <TableHead className="text-right">Qty Allocated</TableHead>
                  <TableHead className="text-right">Available Before</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Allocated Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryAllocations.filter((allocation: any) => allocation.inventory_id !== null).map((allocation: any) => <TableRow key={allocation.id}>
                      <TableCell className="font-medium">{allocation.order_items?.name}</TableCell>
                      <TableCell className="font-mono text-xs">{allocation.inventory?.sku || allocation.order_items?.sku}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{allocation.inventory?.state || 'N/A'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{allocation.quantity_allocated}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {allocation.inventory?.available !== undefined ? allocation.inventory.available + allocation.quantity_allocated : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={allocation.status === 'shipped' ? 'bg-success/10 text-success border-success/20' : allocation.status === 'picked' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-muted'}>
                          {allocation.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(allocation.allocated_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>)}
              </TableBody>
            </Table>
            {inventoryAllocations.some((a: any) => a.inventory_id === null) && <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-blue-600">
                  <strong>Note:</strong> Some items in this shipment were direct-shipped (not pulled from inventory) and are not shown above.
                </p>
              </div>}
          </CardContent>
        </Card>}

      {/* Related Invoices - For Multiple Shipments */}
      {relatedInvoices.length > 0 && <Card className="shadow-lg">
          <CardContent className="p-8">
            <h2 className="text-lg font-semibold mb-4">Other Shipments for This Order</h2>
            <div className="space-y-3">
              {relatedInvoices.map((relInvoice: any) => <div key={relInvoice.id} className="p-4 bg-muted/30 rounded-lg border border-table-border hover:border-primary/40 transition-colors cursor-pointer" onClick={() => navigate(`/invoices/${relInvoice.id}`)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md font-mono text-sm">
                        Shipment #{relInvoice.shipment_number}
                      </span>
                      <span className="font-mono text-sm">{relInvoice.invoice_number}</span>
                      <span className={`px-3 py-1 rounded-md text-xs font-medium ${relInvoice.invoice_type === 'partial' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'}`}>
                        {relInvoice.invoice_type?.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(Number(relInvoice.total))}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(relInvoice.invoice_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>)}
            </div>
          </CardContent>
        </Card>}

      {/* Audit Log */}
      {invoice && (
        <Card className="shadow-lg">
          <CardContent className="p-8">
            <InvoiceAuditLog invoiceId={invoice.id} />
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the invoice to the deleted archive. Quantities will be restored and you can recover the invoice later if needed.
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

      {/* Record Payment Dialog */}
      <RecordPaymentDialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog} invoice={invoice} onSuccess={fetchInvoiceDetails} />

      {/* Sync to QuickBooks Dialog */}
      <SyncToQuickBooksDialog open={showSyncDialog} onOpenChange={setShowSyncDialog} invoice={invoice} onSync={handleSyncToQuickBooks} syncing={syncingToQB} />

      {/* Create Deposit Invoice Dialog */}
      <CreateShipmentInvoiceDialog open={showDepositDialog} onOpenChange={setShowDepositDialog} order={order} onSuccess={fetchInvoiceDetails} initialMode="deposit" />
    </div>;
};
export default InvoiceDetail;
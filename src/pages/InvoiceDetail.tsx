import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Download, FileText, Edit, Trash2, RefreshCw, Copy, ExternalLink, CheckCircle2, DollarSign, CalendarIcon, Mail, RotateCcw, ChevronDown, Check, Unlink, Bell, Loader2, AlertCircle, Package } from "lucide-react";
import { format } from "date-fns";
import { cn, formatCurrency, formatUnitPrice } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuickBooksAutoSync } from "@/hooks/useQuickBooksAutoSync";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { SyncToQuickBooksDialog } from "@/components/SyncToQuickBooksDialog";
import { CreateShipmentInvoiceDialog } from "@/components/CreateShipmentInvoiceDialog";
import { InvoiceAuditLog } from "@/components/InvoiceAuditLog";
import { SendInvoiceEmailDialog } from "@/components/SendInvoiceEmailDialog";
import { SendInvoiceNoticeDialog } from "@/components/SendInvoiceNoticeDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfBranding, addPdfBrandingSync, addPdfFooter } from "@/lib/pdfBranding";
import { EditableDescription } from "@/components/EditableDescription";
import { InvoicePackingListSection } from "@/components/InvoicePackingListSection";

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
  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [refreshingLink, setRefreshingLink] = useState(false);
  const [syncingPayment, setSyncingPayment] = useState<string | null>(null);
  const [showPaymentPortal, setShowPaymentPortal] = useState(false);
  const [showSendEmailDialog, setShowSendEmailDialog] = useState(false);
  const [paymentLinkAttempted, setPaymentLinkAttempted] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [qbRealmId, setQbRealmId] = useState<string | null>(null);
  const [unsyncingFromQB, setUnsyncingFromQB] = useState(false);
  const [showUnsyncDialog, setShowUnsyncDialog] = useState(false);
  const [pullingPayments, setPullingPayments] = useState(false);
  const [orderAttachments, setOrderAttachments] = useState<any[]>([]);
  const [sendingNotice, setSendingNotice] = useState<string | null>(null);
  const [showNoticeDialog, setShowNoticeDialog] = useState<"billed" | "payment_due" | null>(null);
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

  // If a customer opens the payment portal and we don't have a payment link yet,
  // attempt to generate/refresh it automatically (only once per session).
  useEffect(() => {
    const hasValidPaymentLink = !!invoice?.quickbooks_payment_link && invoice.quickbooks_payment_link.startsWith('http');
    const isSyncedToQB = !!invoice?.quickbooks_id;

    if (showPaymentPortal && !isVibeAdmin && isSyncedToQB && !hasValidPaymentLink && !refreshingLink && !paymentLinkAttempted) {
      setPaymentLinkAttempted(true);
      void handleRefreshPaymentLink();
    }
  }, [showPaymentPortal, isVibeAdmin, invoice?.quickbooks_id, invoice?.quickbooks_payment_link, refreshingLink, paymentLinkAttempted]);
  const checkAdminStatus = async () => {
    const {
      data: {
        user
      }
    } = await supabase.auth.getUser();
    if (user) {
      // Users can have multiple role rows; never use .single() here.
      const { data: roleRows, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) {
        console.error('Role fetch error:', error);
      }

      const roles = (roleRows || []).map((r: any) => String(r.role));
      setIsVibeAdmin(roles.includes('vibe_admin'));
      setCurrentUserEmail(user.email || "");
      // Extract name from email or use full email
      const emailName = user.email?.split("@")[0] || "";
      const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
      setCurrentUserName(formattedName);
    }
  };
  const fetchInvoiceDetails = async () => {
    setLoading(true);

    // First check if user is authenticated and has access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Not logged in - redirect to login with invoice context
      navigate(`/login?invoice=${invoiceId}&redirect=/invoices/${invoiceId}`);
      return;
    }

    // NOTE: Do not rely on reading user_roles rows here for permissions.
    // Some customer accounts may not be allowed to read role rows directly.
    // Instead we use security-definer permission helpers (RPCs) below.

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
      .order('line_number', { ascending: true, nullsFirst: false, foreignTable: 'orders.order_items' })
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

    // Check if user has access to this invoice.
    // Use security-definer helpers so customers don't depend on direct user_roles reads.
    const invoiceCompanyId = invoiceData.company_id;

    let isVibeAdminUser = false;
    let hasCompanyAccess = false;

    try {
      const { data: isAdmin, error: isAdminError } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'vibe_admin',
      });
      if (isAdminError) console.error('has_role error:', isAdminError);
      isVibeAdminUser = !!isAdmin;

      const { data: access, error: accessError } = await supabase.rpc('user_has_company_access', {
        _user_id: user.id,
        _company_id: invoiceCompanyId,
      });
      if (accessError) console.error('user_has_company_access error:', accessError);
      hasCompanyAccess = !!access;
    } catch (err) {
      console.error('Error checking invoice access:', err);
    }

    // If the user is authenticated but not yet linked to this invoice's company,
    // try to auto-associate by email before denying access, then re-check access.
    if (!isVibeAdminUser && !hasCompanyAccess && invoiceId && user.email) {
      try {
        const { data: associateResult } = await supabase.rpc('associate_customer_with_invoice', {
          p_invoice_id: invoiceId,
          p_user_email: user.email,
        });

        const result = associateResult as { success: boolean; company_id?: string; error?: string } | null;
        if (result?.success) {
          const { data: accessAfter, error: accessAfterError } = await supabase.rpc('user_has_company_access', {
            _user_id: user.id,
            _company_id: invoiceCompanyId,
          });
          if (accessAfterError) console.error('user_has_company_access (after) error:', accessAfterError);
          hasCompanyAccess = !!accessAfter;
        }
      } catch (err) {
        console.error('Error auto-associating invoice access:', err);
      }
    }

    if (!isVibeAdminUser && !hasCompanyAccess) {
      // User doesn't have access to this invoice
      toast({
        title: "Access Denied",
        description: "You don't have permission to view this invoice",
        variant: "destructive"
      });
      // Avoid redirect loops through login for already-authenticated users.
      navigate('/invoices', { replace: true });
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
        order_items(id, name, sku, unit_price, quantity, shipped_quantity, item_id, description, line_number),
        inventory(state, available)
      `)
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });
    
    // Sort by order_items.line_number after fetch
    if (allocationsData) {
      allocationsData.sort((a, b) => {
        const lineA = a.order_items?.line_number ?? 999;
        const lineB = b.order_items?.line_number ?? 999;
        return lineA - lineB;
      });
    }
    if (allocationsData) {
      setInventoryAllocations(allocationsData);

      // Check if this is a deposit invoice (no allocations, but has deposit note)
      const isDepositInvoice = invoiceData.notes && invoiceData.notes.includes('deposit payment');

      // Blanket/full invoices always show ALL order items with ordered quantities
      const isBlanketInvoice = invoiceData.invoice_type === 'full' && invoiceData.shipment_number === 1;
      
      if (isBlanketInvoice || isDepositInvoice) {
        // Blanket and deposit invoices show all order items with original quantities
        setEditedItems(invoiceData.orders?.order_items || []);
      } else if (allocationsData.length > 0) {
        // Shipment/partial invoices show only allocated items
        const invoiceItems = allocationsData.map((alloc: any) => ({
          ...alloc.order_items,
          quantity: alloc.quantity_allocated,
          shipped_quantity: alloc.quantity_allocated,
          total: alloc.quantity_allocated * (alloc.order_items?.unit_price || 0)
        }));
        setEditedItems(invoiceItems);
      } else {
        // No allocations yet - show all items for full invoices, empty for partials
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
    } else if (invoiceData.parent_invoice_id) {
      // Partial invoice with a parent - show payments for this invoice AND the parent blanket
      const parentAndSelfIds = [invoiceId!, invoiceData.parent_invoice_id];
      // Also include sibling partial invoices
      if (relatedData && relatedData.length > 0) {
        parentAndSelfIds.push(...relatedData.map(inv => inv.id));
      }
      
      const { data: allRelatedPayments, error: relatedPaymentsError } = await supabase
        .from('payments')
        .select('*')
        .in('invoice_id', parentAndSelfIds)
        .order('payment_date', { ascending: false });
      
      if (relatedPaymentsError) {
        console.error('Error fetching related payments:', relatedPaymentsError);
      }
      
      if (allRelatedPayments) {
        // Add invoice info to each payment
        const paymentsWithInvoices = allRelatedPayments.map(payment => {
          if (payment.invoice_id === invoiceId) {
            return { ...payment, invoices: { invoice_number: invoiceData.invoice_number, invoice_type: invoiceData.invoice_type, shipment_number: invoiceData.shipment_number } };
          }
          if (payment.invoice_id === invoiceData.parent_invoice_id) {
            return { ...payment, invoices: { invoice_number: 'Parent Blanket', invoice_type: 'full', shipment_number: 1 } };
          }
          const sibling = relatedData?.find(inv => inv.id === payment.invoice_id);
          return { ...payment, invoices: sibling ? { invoice_number: sibling.invoice_number, invoice_type: sibling.invoice_type, shipment_number: sibling.shipment_number } : null };
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

    // Fetch QuickBooks realm_id for opening invoices in QBO
    // Get the realm_id from any connected QB account (there's typically one QB connection for the whole system)
    const { data: qbSettings } = await supabase
      .from('quickbooks_settings')
      .select('realm_id')
      .eq('is_connected', true)
      .limit(1)
      .single();
    
    if (qbSettings?.realm_id) {
      setQbRealmId(qbSettings.realm_id);
    }

    // Fetch order attachments (to display Customer PO, etc.)
    if (invoiceData.order_id) {
      const { data: attachmentsData } = await supabase
        .from('order_attachments')
        .select('*')
        .eq('order_id', invoiceData.order_id)
        .order('created_at', { ascending: false });
      
      if (attachmentsData) {
        setOrderAttachments(attachmentsData);
      }
    }

    setLoading(false);
  };

  const handleDownloadOrderAttachment = async (filePath: string, fileName: string) => {
    const { data } = await supabase.storage
      .from('po-documents')
      .createSignedUrl(filePath, 3600, { download: fileName });

    if (data?.signedUrl) {
      window.location.href = data.signedUrl;
    } else {
      toast({ title: "Error", description: "Failed to download", variant: "destructive" });
    }
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

  const handleDownloadPDF = async () => {
    if (!invoice || !order) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Colors
    const primaryGreen = [76, 175, 80];
    const darkGray = [51, 51, 51];
    const mediumGray = [100, 100, 100];
    const lightGray = [248, 248, 248];
    
    // ============ HEADER SECTION ============
    let yPos = 15;
    
    // Company name and address on left
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('ArmorPak Inc. DBA Vibe Packaging', 14, yPos);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('1415 S 700 W', 14, yPos + 7);
    doc.text('Salt Lake City, UT 84104', 14, yPos + 12);
    doc.text('www.vibepkg.com', 14, yPos + 17);
    
    // Logo on right side
    try {
      const logoResponse = await fetch('/images/vibe-logo.png');
      const logoBlob = await logoResponse.blob();
      const logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });
      doc.addImage(logoBase64, 'PNG', pageWidth - 54, yPos - 5, 40, 25);
    } catch (error) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('VIBE', pageWidth - 14, yPos + 8, { align: 'right' });
    }
    
    yPos += 28;
    
    // Divider line
    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.line(14, yPos, pageWidth - 14, yPos);
    
    yPos += 12;
    
    // ============ INVOICE TITLE ============
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text('Invoice', 14, yPos);
    
    yPos += 15;
    
    // ============ BILLED TO & INVOICE DETAILS SECTION ============
    const leftColX = 14;
    const rightColX = pageWidth / 2 + 10;
    
    // Billed To section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Billed to', leftColX, yPos);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text((invoice.companies as any)?.name || order.customer_name, leftColX, yPos + 8);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    const billStreet = order.billing_street || order.shipping_street || '';
    const billCity = order.billing_city || order.shipping_city || '';
    const billState = order.billing_state || order.shipping_state || '';
    const billZip = order.billing_zip || order.shipping_zip || '';
    
    let billY = yPos + 14;
    if (billStreet) {
      doc.text(billStreet, leftColX, billY);
      billY += 5;
    }
    if (billCity) {
      doc.text(`${billCity}, ${billState} ${billZip}`, leftColX, billY);
      billY += 5;
    }
    if (order.po_number) {
      doc.setFont('helvetica', 'bold');
      doc.text(`PO: ${order.po_number}`, leftColX, billY);
    }
    
    // Invoice details on right
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    const detailsStartY = yPos;
    doc.text('Invoice #:', rightColX, detailsStartY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(invoice.invoice_number, rightColX + 45, detailsStartY);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Date:', rightColX, detailsStartY + 7);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(format(new Date(invoice.invoice_date), 'MMM d, yyyy'), rightColX + 45, detailsStartY + 7);
    
    if (invoice.due_date) {
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Due Date:', rightColX, detailsStartY + 14);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(format(new Date(invoice.due_date), 'MMM d, yyyy'), rightColX + 45, detailsStartY + 14);
    }
    
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Order #:', rightColX, detailsStartY + 21);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(order.order_number, rightColX + 45, detailsStartY + 21);
    
    yPos += 40;
    
    // ============ ITEMS TABLE ============
    const itemsToDisplay = editedItems.length > 0 ? editedItems : (order?.order_items || []);
    const tableData = itemsToDisplay.map((item: any) => [
      item.sku || '',
      item.name || '',
      (item.quantity || 0).toLocaleString(),
      formatUnitPrice(item.unit_price || 0),
      formatCurrency((item.quantity || 0) * (item.unit_price || 0))
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['SKU', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT']],
      body: tableData,
      theme: 'plain',
      headStyles: { 
        fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]], 
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 4
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 4,
        textColor: [darkGray[0], darkGray[1], darkGray[2]],
        lineWidth: 0
      },
      alternateRowStyles: {
        fillColor: [lightGray[0], lightGray[1], lightGray[2]]
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 70 },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 },
      showHead: 'firstPage',
      tableLineWidth: 0
    });
    
    // Get final Y position after table
    let finalY = (doc as any).lastAutoTable.finalY + 10;
    
    // ============ TOTALS SECTION ============
    const totalsWidth = 85;
    const totalsX = pageWidth - totalsWidth - 14;
    
    const totalPaid = invoice.total_paid || 0;
    const balance = (invoice.total || 0) - totalPaid;
    const hasPayments = totalPaid > 0;
    const hasShipping = (invoice.shipping_cost || 0) > 0;
    
    // Ensure we have space above the footer
    const footerLineY = pageHeight - 12;
    const requiredSpace = 60 + (invoice.notes ? 30 : 0);
    if (finalY + requiredSpace > footerLineY) {
      doc.addPage();
      finalY = 30;
    }
    
    doc.setFontSize(9);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    
    let totalsY = finalY + 5;
    
    // Subtotal
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal', totalsX, totalsY);
    doc.text(formatCurrency(invoice.subtotal || invoice.total || 0), totalsX + totalsWidth, totalsY, { align: 'right' });
    totalsY += 8;
    
    // Shipping (if applicable)
    if (hasShipping) {
      doc.text('Shipping', totalsX, totalsY);
      doc.text(formatCurrency(invoice.shipping_cost || 0), totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 8;
    }
    
    // Less Deposit / Payments
    if (hasPayments) {
      doc.text('Less Deposit', totalsX, totalsY);
      doc.text(`(${formatCurrency(totalPaid)})`, totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 8;
    }
    
    // Divider line before balance
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totalsX, totalsY, totalsX + totalsWidth, totalsY);
    totalsY += 6;
    
    // Balance Due - emphasized
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('BALANCE DUE', totalsX, totalsY);
    doc.text(formatCurrency(hasPayments ? balance : (invoice.total || 0)), totalsX + totalsWidth, totalsY, { align: 'right' });
    
    // ============ TERMS/NOTES SECTION ============
    const termsY = totalsY + 20;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('All remaining amounts are due on the agreed upon terms. Thank you for your business!', 14, termsY);
    
    // Additional notes if present
    if (invoice.notes) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text('Notes:', 14, termsY + 10);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      const notesLines = doc.splitTextToSize(invoice.notes, pageWidth - 28);
      doc.text(notesLines, 14, termsY + 16);
    }
    
    // ============ FOOTER ============
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
    
    // Save
    doc.save(`invoice-${invoice.invoice_number}.pdf`);
    
    toast({
      title: "PDF Downloaded",
      description: `Invoice ${invoice.invoice_number} has been downloaded`
    });
  };

  const handleDownloadPackingList = async () => {
    if (!invoice || !order) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Colors - match invoice PDF style
    const primaryGreen = [76, 175, 80];
    const darkGray = [51, 51, 51];
    const mediumGray = [100, 100, 100];
    const lightGray = [248, 248, 248];
    
    // ============ HEADER SECTION ============
    let yPos = 15;
    
    // Company name and address on left
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('ArmorPak Inc. DBA Vibe Packaging', 14, yPos);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('1415 S 700 W', 14, yPos + 7);
    doc.text('Salt Lake City, UT 84104', 14, yPos + 12);
    doc.text('www.vibepkg.com', 14, yPos + 17);
    
    // Logo on right side
    try {
      const logoResponse = await fetch('/images/vibe-logo.png');
      const logoBlob = await logoResponse.blob();
      const logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });
      doc.addImage(logoBase64, 'PNG', pageWidth - 54, yPos - 5, 40, 25);
    } catch (error) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('VIBE', pageWidth - 14, yPos + 8, { align: 'right' });
    }
    
    yPos += 28;
    
    // Divider line
    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.line(14, yPos, pageWidth - 14, yPos);
    
    yPos += 12;
    
    // ============ PACKING LIST TITLE ============
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text('Packing List', 14, yPos);
    
    yPos += 15;
    
    // ============ SHIP TO & DETAILS SECTION ============
    const leftColX = 14;
    const rightColX = pageWidth / 2 + 10;
    
    // Ship To section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Delivery Address', leftColX, yPos);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    const shipName = invoice.shipping_name || order.shipping_name || '';
    const shipStreet = invoice.shipping_street || order.shipping_street || '';
    const shipCity = invoice.shipping_city || order.shipping_city || '';
    const shipState = invoice.shipping_state || order.shipping_state || '';
    const shipZip = invoice.shipping_zip || order.shipping_zip || '';
    doc.text(shipName, leftColX, yPos + 8);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    let shipY = yPos + 14;
    if (shipStreet) {
      doc.text(shipStreet, leftColX, shipY);
      shipY += 5;
    }
    doc.text(`${shipCity}, ${shipState} ${shipZip}`, leftColX, shipY);
    
    // Details on right
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    const detailsStartY = yPos;
    doc.text('Invoice #:', rightColX, detailsStartY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(invoice.invoice_number, rightColX + 45, detailsStartY);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Order #:', rightColX, detailsStartY + 7);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(order.order_number, rightColX + 45, detailsStartY + 7);
    
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Date:', rightColX, detailsStartY + 14);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(format(new Date(), 'MMM d, yyyy'), rightColX + 45, detailsStartY + 14);
    
    if (order.po_number) {
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('PO #:', rightColX, detailsStartY + 21);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(order.po_number, rightColX + 45, detailsStartY + 21);
    }
    
    yPos += 40;
    
    // ============ ITEMS TABLE ============
    const itemsForPacking = editedItems.length > 0 ? editedItems : (order?.order_items || []);
    const tableData = itemsForPacking.map((item: any) => [
      item.item_id || 'N/A',
      item.sku || '',
      item.name || '',
      (item.quantity || 0).toLocaleString()
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['ITEM ID', 'SKU', 'DESCRIPTION', 'QTY']],
      body: tableData,
      theme: 'plain',
      headStyles: { 
        fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]], 
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 4
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 4,
        textColor: [darkGray[0], darkGray[1], darkGray[2]],
        lineWidth: 0
      },
      alternateRowStyles: {
        fillColor: [lightGray[0], lightGray[1], lightGray[2]]
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 40 },
        2: { cellWidth: 85 },
        3: { cellWidth: 25, halign: 'center' }
      },
      margin: { left: 14, right: 14 },
      showHead: 'firstPage',
      tableLineWidth: 0
    });
    
    // Summary
    const totalItems = itemsForPacking.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
    let tableEndY = (doc as any).lastAutoTable.finalY + 15;
    
    // Check if summary + footer will overflow the page
    if (tableEndY + 30 > pageHeight - 10) {
      doc.addPage();
      tableEndY = 20;
    }
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(`Total Quantity: ${totalItems.toLocaleString()}`, 14, tableEndY);
    
    // ============ FOOTER ============
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
    
    doc.save(`packing-list-${invoice.invoice_number}.pdf`);
    
    toast({
      title: "Packing List Downloaded",
      description: `Packing list for ${invoice.invoice_number} has been downloaded`
    });
  };

  const handleSaveQuantities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // For blanket invoices, we need to create inventory allocations if quantities are being set
      const isBlanketInvoice = invoice?.invoice_type === 'full' && invoice?.shipment_number === 1;
      
      // Update each order item
      for (const item of editedItems) {
        const newShippedQty = Number(item.shipped_quantity) || 0;
        // For blanket invoices, total should be based on ORDERED quantity, not shipped
        const orderedTotal = Number(item.quantity) * Number(item.unit_price);
        const shippedTotal = newShippedQty * Number(item.unit_price);
        
        const {
          error
        } = await supabase.from('order_items').update({
          shipped_quantity: newShippedQty,
          unit_price: item.unit_price,
          total: orderedTotal // Always use ordered quantity for item total
        }).eq('id', item.id);
        if (error) throw error;
        
        // Only create allocations for shipment/partial invoices, NOT blanket invoices
        if (!isBlanketInvoice && newShippedQty > 0) {
          // Check if allocation already exists
          const { data: existingAlloc } = await supabase
            .from('inventory_allocations')
            .select('id, quantity_allocated')
            .eq('invoice_id', invoiceId)
            .eq('order_item_id', item.id)
            .single();
          
          if (existingAlloc) {
            // Update existing allocation
            await supabase
              .from('inventory_allocations')
              .update({ quantity_allocated: newShippedQty })
              .eq('id', existingAlloc.id);
          } else {
            // Create new allocation
            await supabase
              .from('inventory_allocations')
              .insert({
                invoice_id: invoiceId,
                order_item_id: item.id,
                quantity_allocated: newShippedQty,
                allocated_by: user?.id,
                status: 'allocated'
              });
          }
        }
      }

      // Recalculate totals - blanket uses ordered quantities, shipments use shipped
      const newSubtotal = isBlanketInvoice
        ? editedItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price), 0)
        : editedItems.reduce((sum, item) => sum + Number(item.shipped_quantity || 0) * Number(item.unit_price), 0);
      const newTotal = newSubtotal + Number(invoice.tax || 0);

      // Update order totals (always based on ordered quantities)
      const orderSubtotal = editedItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price), 0);
      const orderTotal = orderSubtotal + Number(invoice.tax || 0);
      const {
        error: orderError
      } = await supabase.from('orders').update({
        subtotal: orderSubtotal,
        total: orderTotal
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
  // formatCurrency and formatUnitPrice are now imported from @/lib/utils
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
      // Customers may not have permission to read the QuickBooks connection row.
      // Instead of blocking here, attempt the refresh; the backend function will fail if truly disconnected.
      if (isVibeAdmin) {
        const isConnected = await checkConnection();
        if (!isConnected) {
          toast({
            title: "Not Connected",
            description: "QuickBooks is not connected",
            variant: "destructive"
          });
          return;
        }
      }

      // Re-sync to get updated payment link
      const { error } = await supabase.functions.invoke('quickbooks-sync-invoice', {
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

  const handlePullPayments = async () => {
    setPullingPayments(true);
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

      if (!invoice?.quickbooks_id) {
        toast({
          title: "Invoice Not Synced",
          description: "Invoice must be synced to QuickBooks first.",
          variant: "destructive"
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('quickbooks-pull-payments', {
        body: { invoiceId }
      });

      if (error) throw error;
      
      if (data?.newPaymentsCount > 0) {
        toast({
          title: "Payments Imported",
          description: data.message
        });
        // Refresh to show new payments
        fetchInvoiceDetails();
      } else {
        toast({
          title: "No New Payments",
          description: "No new payments found in QuickBooks for this invoice."
        });
      }
    } catch (error: any) {
      toast({
        title: "Pull Failed",
        description: error.message || "Failed to pull payments from QuickBooks",
        variant: "destructive"
      });
    } finally {
      setPullingPayments(false);
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

  const handleReopenInvoice = async () => {
    if (!confirm('Reopen this invoice? This will set the status back to pending.')) {
      return;
    }
    try {
      const {
        error
      } = await supabase.from('invoices').update({
        status: 'pending'
      }).eq('id', invoiceId);
      if (error) throw error;
      toast({
        title: "Invoice Reopened",
        description: "Invoice has been reopened and set to pending"
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reopen invoice",
        variant: "destructive"
      });
    }
  };

  // Notice dialogs are now handled by SendInvoiceNoticeDialog

  const handleUnsyncFromQB = async () => {
    setUnsyncingFromQB(true);
    try {
      const { error, data } = await supabase.functions.invoke('quickbooks-delete-invoice', {
        body: { invoiceId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Invoice Unsynced",
        description: "Invoice has been removed from QuickBooks and unlinked locally."
      });

      setShowUnsyncDialog(false);
      fetchInvoiceDetails();
    } catch (error: any) {
      console.error('Error unsyncing from QB:', error);
      toast({
        title: "Unsync Failed",
        description: error.message || "Failed to unsync invoice from QuickBooks",
        variant: "destructive"
      });
    } finally {
      setUnsyncingFromQB(false);
    }
  };

  // For edit mode, recalculate. Otherwise use stored invoice.total
  const displayItems = editedItems;
  const isBlanketDisplay = invoice?.invoice_type === 'full' && invoice?.shipment_number === 1;
  
  // For blanket invoices, compute subtotal from shipped quantities when available
  const displaySubtotal = isEditMode 
    ? displayItems.reduce((sum: number, item: any) => {
        const qty = invoice?.invoice_type === 'full' ? Number(item.shipped_quantity || 0) : Number(item.quantity || 0);
        return sum + qty * Number(item.unit_price);
      }, 0) 
    : isBlanketDisplay
      ? (() => {
          const hasShippedQty = displayItems.some((item: any) => Number(item.shipped_quantity || 0) > 0);
          if (hasShippedQty) {
            return displayItems.reduce((sum: number, item: any) => sum + Number(item.shipped_quantity || 0) * Number(item.unit_price), 0);
          }
          return Number(invoice?.subtotal || 0);
        })()
      : Number(invoice?.subtotal || 0);
  const displayTotal = isEditMode ? displaySubtotal + Number(invoice?.tax || 0) + Number(invoice?.shipping_cost || 0) : (isBlanketDisplay ? displaySubtotal + Number(invoice?.tax || 0) + Number(invoice?.shipping_cost || 0) : Number(invoice?.total || 0));
  const displayTotalPaid = Number(invoice?.total_paid || 0);
  const displayBalance = displayTotal - displayTotalPaid;

  // Calculate shipped percentage from actual quantities
  const calculateShippedPercentage = () => {
    if (!order?.order_items) return 0;
    const totalOrdered = order.order_items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const totalShipped = order.order_items.reduce((sum: number, item: any) => sum + Number(item.shipped_quantity || 0), 0);
    return totalOrdered > 0 ? Math.min((totalShipped / totalOrdered) * 100, 100) : 0;
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
                  <Button variant="outline" onClick={() => {
                // For blanket invoices, ensure we have the order items with shipped_quantity
                if (invoice?.invoice_type === 'full' && order?.order_items) {
                  setEditedItems(order.order_items.map((item: any) => ({
                    ...item,
                    shipped_quantity: item.shipped_quantity || 0
                  })));
                }
                setIsEditMode(true);
              }}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Items
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/orders/${invoice.order_id}`)}>
                    View Order
                  </Button>
                  {invoice.quickbooks_sync_status === 'synced' && invoice.quickbooks_id ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="bg-green-600 hover:bg-green-700 text-white gap-2">
                          <Check className="h-4 w-4" />
                          Synced to QBO
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                          QuickBooks Actions
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => {
                            if (qbRealmId && invoice.quickbooks_id) {
                              window.open(
                                `https://app.qbo.intuit.com/app/invoice?txnId=${invoice.quickbooks_id}&companyId=${qbRealmId}`,
                                '_blank'
                              );
                            } else {
                              toast({
                                title: "Unable to open",
                                description: "QuickBooks connection info not available",
                                variant: "destructive"
                              });
                            }
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2 text-blue-500" />
                          <span>View in QuickBooks</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="cursor-pointer"
                          onClick={() => setShowSyncDialog(true)}
                        >
                          <RefreshCw className="h-4 w-4 mr-2 text-amber-500" />
                          <span>Re-Sync to QuickBooks</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="cursor-pointer text-destructive focus:text-destructive"
                          onClick={() => setShowUnsyncDialog(true)}
                        >
                          <Unlink className="h-4 w-4 mr-2" />
                          <span>Unsync from QuickBooks</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button variant="outline" onClick={() => setShowSyncDialog(true)} disabled={syncingToQB}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${syncingToQB ? 'animate-spin' : ''}`} />
                      Bill in QuickBooks
                    </Button>
                  )}
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
              {invoice.status === 'closed' && <Button variant="outline" onClick={handleReopenInvoice} className="border-amber-500 text-amber-700 hover:bg-amber-50">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reopen Invoice
                </Button>}
            </>}
          {isVibeAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Send Email</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowSendEmailDialog(true)}>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Invoice to Customer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Notices</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setShowNoticeDialog("billed")}>
                  <Bell className="h-4 w-4 mr-2" />
                  Send Billed Notice (Net 30)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowNoticeDialog("payment_due")}>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Send Payment Due Reminder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Download Invoice
          </Button>
          {(invoice.invoice_type === 'partial' || invoice.parent_invoice_id) && (
            <Button variant="outline" onClick={handleDownloadPackingList}>
              <FileText className="h-4 w-4 mr-2" />
              Download Packing List
            </Button>
          )}
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
                  const shippedPercentage = totalOrdered > 0 ? Math.min((totalShipped / totalOrdered) * 100, 100) : 0;
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
                {invoice?.quote_id && (
                  <Button 
                    variant="link" 
                    className="h-auto p-0 text-sm text-primary"
                    onClick={() => navigate(`/quotes/${invoice.quote_id}`)}
                  >
                    View Source Quote
                  </Button>
                )}
                {order?.po_number && (
                  <p className="text-sm text-muted-foreground">Customer PO: {order.po_number}</p>
                )}

                {/* Descriptions (match Orders: order-level description + optional invoice-level description for child invoices) */}
                {isVibeAdmin ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Order Description
                      </div>
                      <EditableDescription
                        value={order?.description}
                        placeholder="Add description…"
                        onSave={async (newValue) => {
                          if (!order?.id) return;

                          const { error } = await supabase
                            .from("orders")
                            .update({ description: newValue || null })
                            .eq("id", order.id);

                          if (error) {
                            toast({
                              title: "Error",
                              description: "Failed to save order description",
                              variant: "destructive",
                            });
                            return;
                          }

                          setOrder({ ...order, description: newValue || null });
                          setInvoice({
                            ...invoice,
                            orders: { ...(invoice?.orders || {}), description: newValue || null },
                          });
                        }}
                      />
                    </div>

                    {invoice?.parent_invoice_id && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                          Invoice Description
                        </div>
                        <EditableDescription
                          value={invoice.description}
                          placeholder="Add invoice description…"
                          onSave={async (newValue) => {
                            const { error } = await supabase
                              .from("invoices")
                              .update({ description: newValue || null })
                              .eq("id", invoice.id);

                            if (error) {
                              toast({
                                title: "Error",
                                description: "Failed to save invoice description",
                                variant: "destructive",
                              });
                            } else {
                              setInvoice({ ...invoice, description: newValue || null });
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {order?.description && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {order.description}
                      </p>
                    )}
                    {invoice?.parent_invoice_id && invoice.description && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {invoice.description}
                      </p>
                    )}
                  </div>
                )}
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
                    <SelectItem value="open">OPEN</SelectItem>
                    <SelectItem value="due">DUE</SelectItem>
                    <SelectItem value="paid">PAID</SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  {isVibeAdmin ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className={cn(
                            "h-auto p-0 font-medium hover:bg-transparent",
                            !invoice.due_date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {invoice.due_date ? format(new Date(invoice.due_date), "MMM d, yyyy") : "Set Due Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={invoice.due_date ? new Date(invoice.due_date) : undefined}
                          onSelect={async (date) => {
                            const { error } = await supabase
                              .from('invoices')
                              .update({ due_date: date ? date.toISOString() : null })
                              .eq('id', invoice.id);
                            
                            if (error) {
                              toast({ title: "Error", description: "Failed to update due date", variant: "destructive" });
                            } else {
                              setInvoice({ ...invoice, due_date: date ? date.toISOString() : null });
                              toast({ title: "Due date updated" });
                            }
                          }}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <p className="font-medium">
                      {invoice.due_date ? format(new Date(invoice.due_date), "MMM d, yyyy") : "Not set"}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Created: {new Date(invoice.invoice_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Shipping Information */}
          <div className="p-8 border-b">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-semibold mb-3">Ship To</h3>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{invoice?.shipping_name || order?.shipping_name}</p>
                  <p className="text-muted-foreground">{invoice?.shipping_street || order?.shipping_street}</p>
                  <p className="text-muted-foreground">
                    {invoice?.shipping_city || order?.shipping_city}, {invoice?.shipping_state || order?.shipping_state} {invoice?.shipping_zip || order?.shipping_zip}
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
            
            {/* Payment Terms - Editable by vibe_admin */}
            {isVibeAdmin && (
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-sm font-semibold mb-3">Payment Terms</h3>
                <div className="flex items-center gap-2">
                  <Input
                    value={order?.terms || ''}
                    placeholder="e.g., Net 30 - Payment due within 30 days"
                    onChange={async (e) => {
                      const newTerms = e.target.value;
                      // Update local state immediately
                      setOrder({ ...order, terms: newTerms });
                    }}
                    onBlur={async (e) => {
                      const newTerms = e.target.value;
                      const { error } = await supabase
                        .from('orders')
                        .update({ terms: newTerms })
                        .eq('id', order?.id);
                      
                      if (error) {
                        toast({ title: "Error", description: "Failed to update terms", variant: "destructive" });
                      } else {
                        toast({ title: "Payment terms updated" });
                      }
                    }}
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  These terms will appear on the invoice PDF
                </p>
              </div>
            )}
          </div>

          {/* QuickBooks Payment Link - Show for admins OR for customers if invoice is synced to QB */}
          {(() => {
            const hasValidPaymentLink = invoice.quickbooks_payment_link && invoice.quickbooks_payment_link.startsWith('http');
            const isSyncedToQB = !!invoice.quickbooks_id;
            // Show for admins if any QB connection, show for customers if synced to QB (even without link yet)
            const showSection = isVibeAdmin ? (invoice.quickbooks_id || invoice.quickbooks_payment_link) : isSyncedToQB;
            
            if (!showSection) return null;
            
            return showPaymentPortal ? (
              <div className="p-8 border-b bg-gradient-to-r from-green-500/10 to-emerald-500/5">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        {isVibeAdmin ? 'Customer Payment Portal' : 'Pay Invoice'}
                        {isVibeAdmin && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
                            QuickBooks
                          </Badge>
                        )}
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
                        {isVibeAdmin ? (
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
                        ) : (
                          <p className="font-semibold text-xl">
                            {invoice.due_date ? format(new Date(invoice.due_date), "MMM d, yyyy") : "Not set"}
                          </p>
                        )}
                      </div>
                      
                      <div className="bg-background/50 border rounded-lg p-4">
                        <div className="text-sm text-muted-foreground mb-1">Status</div>
                        {isVibeAdmin ? (
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
                                {(() => {
                                  const raw = String(invoice.status || '').toLowerCase();
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);

                                  const due = invoice.due_date
                                    ? (() => {
                                        const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(String(invoice.due_date));
                                        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
                                        return new Date(invoice.due_date);
                                      })()
                                    : null;
                                  if (due) due.setHours(0, 0, 0, 0);

                                  const computed =
                                    raw === 'paid'
                                      ? 'paid'
                                      : raw === 'due'
                                        ? 'due'
                                        : raw === 'billed'
                                          ? (due && due.getTime() <= today.getTime() ? 'due' : 'billed')
                                          : raw || 'open';

                                  const className =
                                    computed === 'paid'
                                      ? 'text-green-600'
                                      : computed === 'due'
                                        ? 'text-red-600'
                                        : computed === 'billed'
                                          ? 'text-blue-600'
                                          : 'text-yellow-600';

                                  return <span className={className}>{computed.toUpperCase()}</span>;
                                })()}
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
                        ) : (
                          <p className="font-semibold text-xl">
                            {(() => {
                              const raw = String(invoice.status || '').toLowerCase();
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);

                              const due = invoice.due_date
                                ? (() => {
                                    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(String(invoice.due_date));
                                    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
                                    return new Date(invoice.due_date);
                                  })()
                                : null;
                              if (due) due.setHours(0, 0, 0, 0);

                              const computed =
                                raw === 'paid'
                                  ? 'paid'
                                  : raw === 'due'
                                    ? 'due'
                                    : raw === 'billed'
                                      ? (due && due.getTime() <= today.getTime() ? 'due' : 'billed')
                                      : raw || 'open';

                              const className =
                                computed === 'paid'
                                  ? 'text-green-600'
                                  : computed === 'due'
                                    ? 'text-red-600'
                                    : computed === 'billed'
                                      ? 'text-blue-600'
                                      : 'text-yellow-600';

                              return <span className={className}>{computed.toUpperCase()}</span>;
                            })()}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {hasValidPaymentLink ? <>
                        {isVibeAdmin && (
                          <p className="text-sm text-muted-foreground mb-4">
                            Share this secure payment link with your customer to accept online payments through QuickBooks
                          </p>
                        )}
                        {!isVibeAdmin && (
                          <p className="text-sm text-muted-foreground mb-4">
                            Click the button below to securely pay this invoice online
                          </p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          {isVibeAdmin && (
                            <div className="flex-1 min-w-[300px] bg-background border rounded-lg p-3 font-mono text-sm truncate">
                              {invoice.quickbooks_payment_link}
                            </div>
                          )}
                          {isVibeAdmin && (
                            <Button variant="default" size="sm" onClick={handleCopyPaymentLink} className="gap-2">
                              {copiedLink ? <>
                                  <CheckCircle2 className="h-4 w-4" />
                                  Copied!
                                </> : <>
                                  <Copy className="h-4 w-4" />
                                  Copy Link
                                </>}
                            </Button>
                          )}
                          <Button 
                            variant={isVibeAdmin ? "outline" : "default"} 
                            size={isVibeAdmin ? "sm" : "lg"}
                            onClick={() => window.open(invoice.quickbooks_payment_link, '_blank')} 
                            className="gap-2"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {isVibeAdmin ? 'Preview' : 'Pay Now'}
                          </Button>
                        </div>
                      </> : invoice.quickbooks_id ? (
                        isVibeAdmin ? (
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-3">
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
                          </div>
                        ) : (
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-3">
                            <p className="text-sm text-muted-foreground">
                              {refreshingLink
                                ? 'Generating secure payment link...'
                                : 'Payment link is not available yet. Click below to generate it.'}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRefreshPaymentLink}
                              disabled={refreshingLink}
                              className="gap-2"
                            >
                              {refreshingLink ? (
                                <>
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-4 w-4" />
                                  Generate Payment Link
                                </>
                              )}
                            </Button>
                          </div>
                        )
                      ) : isVibeAdmin ? <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                        <p className="text-sm text-muted-foreground">
                          Payment link will be available after syncing. Click "Bill" above to sync this invoice to QuickBooks.
                        </p>
                      </div> : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 border-b">
                <Button 
                  onClick={() => setShowPaymentPortal(true)}
                  className="gap-2"
                  variant={isVibeAdmin ? "outline" : "default"}
                >
                  <DollarSign className="h-4 w-4" />
                  {isVibeAdmin ? 'Get Payment Link' : 'Pay Invoice'}
                </Button>
              </div>
            );
          })()}

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
                  {invoice?.invoice_type === 'full' ? (
                    <>
                      <TableHead className="text-center">Ordered</TableHead>
                      <TableHead className="text-center">Shipped</TableHead>
                    </>
                  ) : (
                    <TableHead className="text-center">Quantity</TableHead>
                  )}
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayItems.map((item: any) => {
                // For blanket (full) invoices, show the original order quantity and actual shipped quantity
                // For partial invoices, show only the items in this shipment
                const orderedQty = invoice?.invoice_type === 'partial' ? item.quantity || 0 : order?.order_items?.find((oi: any) => oi.sku === item.sku)?.quantity || item.quantity;

                // For blanket invoices in edit mode, use the editedItems value
                // Otherwise get from order_items
                const orderItem = order?.order_items?.find((oi: any) => oi.sku === item.sku);
                const editedItem = editedItems.find((ei: any) => ei.id === item.id);
                const shippedQty = isEditMode && editedItem 
                  ? (editedItem.shipped_quantity || 0)
                  : (invoice?.invoice_type === 'partial' ? item.quantity || 0 : orderItem?.shipped_quantity || 0);
                
                return <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="max-w-xs">
                        {isVibeAdmin ? (
                          <EditableDescription
                            value={item.description}
                            onSave={async (newValue) => {
                              const { error } = await supabase
                                .from('order_items')
                                .update({ description: newValue || null })
                                .eq('id', item.id);
                              
                              if (error) {
                                toast({ title: "Error", description: "Failed to save description", variant: "destructive" });
                              } else {
                                // Update local state
                                setEditedItems(items => items.map(i => 
                                  i.id === item.id ? { ...i, description: newValue || null } : i
                                ));
                              }
                            }}
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">{item.description || '-'}</span>
                        )}
                      </TableCell>
                      {invoice?.invoice_type === 'full' ? (
                        <>
                          <TableCell className="text-center">
                            {orderedQty}
                          </TableCell>
                          <TableCell className="text-center">
                            {isEditMode ? <Input type="number" min="0" max={orderedQty} value={shippedQty} onChange={e => handleQuantityChange(item.id, parseInt(e.target.value) || 0)} className="w-24 text-center" /> : shippedQty}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell className="text-center">
                          {isEditMode ? <Input type="number" min="0" value={item.quantity || 0} onChange={e => handleQuantityChange(item.id, parseInt(e.target.value) || 0)} className="w-24 text-center" /> : (item.quantity || 0)}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {isEditMode ? <Input type="number" step="0.001" min="0" value={item.unit_price} onChange={e => handlePriceChange(item.id, parseFloat(e.target.value) || 0)} className="w-28 text-right" /> : formatUnitPrice(Number(item.unit_price))}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {/* For blanket invoices, show total based on ordered qty; for partial/shipped, use shipped qty */}
                        {formatCurrency((invoice?.invoice_type === 'full' ? orderedQty : shippedQty) * Number(item.unit_price))}
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
                {Number(invoice?.shipping_cost || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="font-semibold">{formatCurrency(invoice.shipping_cost)}</span>
                  </div>
                )}
                {displayTotalPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Less Deposit</span>
                    <span className="font-semibold text-green-600">({formatCurrency(displayTotalPaid)})</span>
                  </div>
                )}
                <div className="h-px bg-border my-2"></div>
                <div className="flex justify-between">
                  <span className="text-lg font-semibold">{displayTotalPaid > 0 ? 'Balance Due' : 'Total'}</span>
                  <span className="text-2xl font-bold">{formatCurrency(displayTotalPaid > 0 ? displayBalance : displayTotal)}</span>
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
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Payment History</h2>
            {isVibeAdmin && invoice?.quickbooks_id && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePullPayments} 
                disabled={pullingPayments}
                className="gap-2"
              >
                {pullingPayments ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Checking QBO...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Pull Payments from QBO
                  </>
                )}
              </Button>
            )}
            
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
            
            {/* For Blanket Invoices - Show four totals including original order total */}
            {invoice.invoice_type === 'full' && invoice.shipment_number === 1 ? (
              <div className="text-right space-y-2">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Original Order Total</p>
                    <p className="text-lg font-semibold text-muted-foreground">
                      {formatCurrency(order?.order_items?.reduce((sum: number, item: any) => 
                        sum + (item.quantity * item.unit_price), 0) || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Blanket Invoice Total</p>
                    <p className="text-lg font-semibold">{formatCurrency(Number(invoice.total || 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Shipped Invoiced</p>
                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(relatedInvoices
                        .filter(inv => inv.shipment_number > 1)
                        .reduce((sum, inv) => sum + Number(inv.total || 0), 0)
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Paid</p>
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
                  {((invoice.invoice_type === 'full' && invoice.shipment_number === 1) || invoice.parent_invoice_id) && <TableHead>Invoice</TableHead>}
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
                    {((invoice.invoice_type === 'full' && invoice.shipment_number === 1) || invoice.parent_invoice_id) && (
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
                        <Button variant="outline" size="sm" onClick={async () => {
                          // Generate and download PDF for this PO - matching VendorPODetail format
                          const doc = new jsPDF();
                          const pageWidth = doc.internal.pageSize.getWidth();
                          const pageHeight = doc.internal.pageSize.getHeight();
                          
                          // Colors
                          const primaryGreen = [76, 175, 80];
                          const darkGray = [51, 51, 51];
                          const lightGray = [248, 248, 248];
                          const mediumGray = [100, 100, 100];
                          
                          // ============ HEADER SECTION ============
                          let yPos = 15;
                          
                          // Company name and address on left
                          doc.setFontSize(16);
                          doc.setFont('helvetica', 'bold');
                          doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
                          doc.text('ArmorPak Inc. DBA Vibe Packaging', 14, yPos);
                          
                          doc.setFontSize(9);
                          doc.setFont('helvetica', 'normal');
                          doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
                          doc.text('1415 S 700 W', 14, yPos + 7);
                          doc.text('Salt Lake City, UT 84104', 14, yPos + 12);
                          doc.text('www.vibepkg.com', 14, yPos + 17);
                          
                          // Logo on right
                          try {
                            const logoResponse = await fetch('/images/vibe-logo.png');
                            const logoBlob = await logoResponse.blob();
                            const logoBase64 = await new Promise<string>((resolve) => {
                              const reader = new FileReader();
                              reader.onloadend = () => resolve(reader.result as string);
                              reader.readAsDataURL(logoBlob);
                            });
                            doc.addImage(logoBase64, 'PNG', pageWidth - 54, yPos - 5, 40, 25);
                          } catch (error) {
                            doc.setFontSize(14);
                            doc.setFont('helvetica', 'bold');
                            doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
                            doc.text('VIBE', pageWidth - 14, yPos + 8, { align: 'right' });
                          }
                          
                          yPos += 28;
                          
                          // Divider line
                          doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
                          doc.setLineWidth(0.5);
                          doc.line(14, yPos, pageWidth - 14, yPos);
                          
                          yPos += 12;
                          
                          // ============ PO TITLE ============
                          doc.setFontSize(24);
                          doc.setFont('helvetica', 'bold');
                          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
                          doc.text('Purchase Order', 14, yPos);
                          
                          yPos += 15;
                          
                          // ============ VENDOR & PO DETAILS SECTION ============
                          const leftColX = 14;
                          const rightColX = pageWidth / 2 + 10;
                          
                          // Vendor section (left)
                          doc.setFontSize(10);
                          doc.setFont('helvetica', 'bold');
                          doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
                          doc.text('Vendor', leftColX, yPos);
                          
                          doc.setFontSize(11);
                          doc.setFont('helvetica', 'bold');
                          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
                          doc.text(po.vendors?.name || 'Unknown', leftColX, yPos + 8);
                          
                          doc.setFontSize(9);
                          doc.setFont('helvetica', 'normal');
                          doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
                          
                          let vendorY = yPos + 14;
                          if (po.vendors?.contact_name) {
                            doc.text(po.vendors.contact_name, leftColX, vendorY);
                            vendorY += 5;
                          }
                          if (po.vendors?.contact_email) {
                            doc.text(po.vendors.contact_email, leftColX, vendorY);
                          }
                          
                          // PO details on right
                          const detailsStartY = yPos;
                          doc.setFontSize(9);
                          doc.setFont('helvetica', 'normal');
                          doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
                          
                          doc.text('PO #:', rightColX, detailsStartY);
                          doc.setFont('helvetica', 'bold');
                          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
                          doc.text(po.po_number, rightColX + 45, detailsStartY);
                          
                          doc.setFont('helvetica', 'normal');
                          doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
                          doc.text('Date:', rightColX, detailsStartY + 7);
                          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
                          doc.text(new Date(po.order_date).toLocaleDateString(), rightColX + 45, detailsStartY + 7);
                          
                          if (po.expected_delivery_date) {
                            doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
                            doc.text('Due Date:', rightColX, detailsStartY + 14);
                            doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
                            doc.text(new Date(po.expected_delivery_date).toLocaleDateString(), rightColX + 45, detailsStartY + 14);
                          }
                          
                          yPos += 35;
                          
                          // ============ ITEMS TABLE ============
                          const tableData = (po.vendor_po_items || []).map((item: any) => [
                            item.sku,
                            item.name,
                            item.quantity.toLocaleString(),
                            `$${Number(item.unit_cost).toFixed(3)}`,
                            `$${Number(item.total).toFixed(2)}`
                          ]);

                          autoTable(doc, {
                            startY: yPos,
                            head: [['SKU', 'DESCRIPTION', 'QTY', 'UNIT COST', 'AMOUNT']],
                            body: tableData,
                            theme: 'plain',
                            headStyles: { 
                              fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]], 
                              textColor: 255,
                              fontStyle: 'bold',
                              fontSize: 9,
                              cellPadding: 4
                            },
                            bodyStyles: {
                              fontSize: 9,
                              cellPadding: 4,
                              textColor: [darkGray[0], darkGray[1], darkGray[2]],
                              lineWidth: 0
                            },
                            alternateRowStyles: {
                              fillColor: [lightGray[0], lightGray[1], lightGray[2]]
                            },
                            columnStyles: {
                              0: { cellWidth: 30 },
                              1: { cellWidth: 'auto' },
                              2: { cellWidth: 20, halign: 'center' },
                              3: { cellWidth: 28, halign: 'right' },
                              4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
                            },
                            margin: { left: 14, right: 14 },
                            showHead: 'firstPage',
                            tableLineWidth: 0,
                            tableWidth: 'auto'
                          });

                          // ============ TOTALS SECTION ============
                          const finalY = (doc as any).lastAutoTable.finalY + 10;
                          const totalAmount = (po.vendor_po_items || []).reduce((sum: number, item: any) => sum + Number(item.total), 0);
                          
                          const totalsWidth = 80;
                          const totalsX = pageWidth - totalsWidth - 14;
                          
                          // Divider line before total
                          doc.setDrawColor(200, 200, 200);
                          doc.setLineWidth(0.3);
                          doc.line(totalsX, finalY, pageWidth - 14, finalY);
                          
                          // Total - emphasized
                          doc.setFontSize(11);
                          doc.setFont('helvetica', 'bold');
                          doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
                          doc.text('TOTAL', totalsX, finalY + 8);
                          doc.text(`$${totalAmount.toFixed(2)}`, pageWidth - 14, finalY + 8, { align: 'right' });

                          // ============ FOOTER ============
                          const footerY = Math.max(finalY + 30, pageHeight - 20);
                          if (footerY < pageHeight - 10) {
                            doc.setFontSize(9);
                            doc.setFont('helvetica', 'bold');
                            doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
                            doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
                          }

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

      {/* Packing Lists Section - For shipped/partial invoices */}
      {invoice && order && (invoice.invoice_type === 'partial' || invoice.status === 'shipped' || invoice.shipment_number) && (
        <InvoicePackingListSection
          invoiceId={invoiceId!}
          invoice={invoice}
          order={order}
          editedItems={editedItems}
          isVibeAdmin={isVibeAdmin}
          onRefresh={fetchInvoiceDetails}
        />
      )}

      {/* Shipments & Invoices Section — blanket invoices only, admin only */}
      {isVibeAdmin && invoice && invoice.invoice_type === 'full' && invoice.shipment_number === 1 && (
        <Card className="shadow-lg">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Shipments & Invoices
                </h2>
                {relatedInvoices.length > 0 && (() => {
                  const allInvoices = [invoice, ...relatedInvoices];
                  const totalBilled = allInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
                  const billingProgress = order ? (totalBilled / Number(order.total)) * 100 : 0;
                  return (
                    <p className="text-sm text-muted-foreground mt-1">
                      {allInvoices.length} invoice(s) • {formatCurrency(totalBilled)} billed ({billingProgress.toFixed(1)}% of order total)
                    </p>
                  );
                })()}
              </div>
              <Button onClick={() => setShowShipmentDialog(true)} size="sm">
                <Package className="h-4 w-4 mr-2" />
                Create Shipment Invoice
              </Button>
            </div>

            {relatedInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shipment invoices created yet. Create your first one to start billing partial shipments.</p>
            ) : (
              <div className="space-y-3">
                {relatedInvoices.map((relInvoice: any, idx: number) => (
                  <div
                    key={relInvoice.id}
                    className="p-4 bg-muted/30 rounded-lg border border-table-border hover:border-primary/40 transition-colors cursor-pointer"
                    onClick={() => navigate(`/invoices/${relInvoice.id}`)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-sm">
                            {relInvoice.shipment_number}
                          </div>
                          {idx < relatedInvoices.length - 1 && (
                            <div className="w-0.5 h-8 bg-table-border mt-2"></div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">{relInvoice.invoice_number}</span>
                            <Badge className={
                              relInvoice.invoice_type === 'partial' ? 'bg-blue-500 text-white' :
                              'bg-purple-500 text-white'
                            }>
                              {relInvoice.invoice_type?.toUpperCase() || 'FULL'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {relInvoice.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Created: {new Date(relInvoice.created_at).toLocaleDateString()}</span>
                            {relInvoice.shipping_cost > 0 && (
                              <span>• Shipping: {formatCurrency(Number(relInvoice.shipping_cost))}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{formatCurrency(Number(relInvoice.total))}</p>
                        {order && (
                          <p className="text-xs text-muted-foreground">
                            {((Number(relInvoice.total) / Number(order.total)) * 100).toFixed(1)}% of order
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Related Invoices - For child/partial invoices viewing siblings */}
      {invoice && !(invoice.invoice_type === 'full' && invoice.shipment_number === 1) && relatedInvoices.length > 0 && <Card className="shadow-lg">
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

      {/* Order Attachments - Including Customer PO - Admin only */}
      {isVibeAdmin && (orderAttachments.length > 0 || order?.po_pdf_path) && (
        <Card className="shadow-lg">
          <CardContent className="p-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Order Attachments</h2>
              <Badge variant="secondary">{orderAttachments.length + (order?.po_pdf_path ? 1 : 0)}</Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Legacy PO if exists */}
              {order?.po_pdf_path && (
                <div className="p-4 bg-background rounded-lg border border-border flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-14 rounded border border-border bg-muted flex items-center justify-center">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">Purchase Order (Original)</p>
                    <p className="text-xs text-muted-foreground mb-2">Primary PO document</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={async () => {
                        const fileName = typeof order.po_pdf_path === "string"
                          ? order.po_pdf_path.split("/").pop() || "purchase-order.pdf"
                          : "purchase-order.pdf";
                        const { data } = await supabase.storage
                          .from("po-documents")
                          .createSignedUrl(order.po_pdf_path, 3600, { download: fileName });
                        if (data?.signedUrl) {
                          window.location.href = data.signedUrl;
                        } else {
                          toast({ title: "Error", description: "Failed to load PO", variant: "destructive" });
                        }
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              )}

              {/* Order attachments - Customer PO highlighted */}
              {orderAttachments.map((attachment) => {
                const isCustomerPO = attachment.description?.toLowerCase() === 'customer po';
                return (
                  <div 
                    key={attachment.id} 
                    className={cn(
                      "p-4 rounded-lg border flex items-start gap-4",
                      isCustomerPO 
                        ? "bg-primary/5 border-primary/30" 
                        : "bg-background border-border"
                    )}
                  >
                    <div className={cn(
                      "flex-shrink-0 w-12 h-14 rounded border flex items-center justify-center",
                      isCustomerPO 
                        ? "border-primary/30 bg-primary/10" 
                        : "border-border bg-muted"
                    )}>
                      <FileText className={cn(
                        "h-6 w-6",
                        isCustomerPO ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate" title={attachment.file_name}>{attachment.file_name}</p>
                        {isCustomerPO && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">Customer PO</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {isCustomerPO ? 'Customer Purchase Order' : (attachment.description || 'No description')}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => handleDownloadOrderAttachment(attachment.file_path, attachment.file_name)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Log - Only visible to vibe_admin */}
      {invoice && isVibeAdmin && (
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

      {/* Unsync from QuickBooks Confirmation Dialog */}
      <AlertDialog open={showUnsyncDialog} onOpenChange={setShowUnsyncDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsync from QuickBooks?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the invoice from QuickBooks and remove the sync link. The invoice will remain in your portal but will no longer be connected to QuickBooks. You can re-sync it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unsyncingFromQB}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUnsyncFromQB} 
              disabled={unsyncingFromQB}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unsyncingFromQB ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Unsyncing...
                </>
              ) : (
                'Unsync from QB'
              )}
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

      {/* Create Shipment Invoice Dialog */}
      <CreateShipmentInvoiceDialog open={showShipmentDialog} onOpenChange={setShowShipmentDialog} order={order} onSuccess={fetchInvoiceDetails} initialMode="shipment" />

      {/* Send Invoice Email Dialog */}
      <SendInvoiceEmailDialog 
        open={showSendEmailDialog} 
        onOpenChange={setShowSendEmailDialog} 
        invoice={invoice} 
        order={order} 
        items={editedItems}
        senderName={currentUserName}
        senderEmail={currentUserEmail}
      />

      {/* Send Invoice Notice Dialog */}
      {showNoticeDialog && (
        <SendInvoiceNoticeDialog
          open={!!showNoticeDialog}
          onOpenChange={(open) => { if (!open) setShowNoticeDialog(null); }}
          noticeType={showNoticeDialog}
          invoice={invoice}
          order={order}
          items={editedItems}
          senderEmail={currentUserEmail}
        />
      )}
    </div>;
};
export default InvoiceDetail;
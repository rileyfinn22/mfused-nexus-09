import { useState, useEffect, useRef } from "react";
import { pdfItemDescription } from "@/lib/pdfItemText";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Download, FileText, Edit, Trash2, RefreshCw, Copy, ExternalLink, CheckCircle2, DollarSign, CalendarIcon, Mail, RotateCcw, ChevronDown, Check, Unlink, Bell, Loader2, AlertCircle, Package, ChevronsUpDown, FileSpreadsheet, Sparkles, Plus, X } from "lucide-react";

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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DOC,
  DOC_COLORS,
  docTableStyles,
  drawDetailRows,
  drawDocumentTitle,
  drawFooter,
  drawMasthead,
  drawPartyBlock,
  ensureRoom,
} from "@/lib/pdfDocument";

import { generateInvoicePDF } from "@/lib/invoicePdfUtils";
import { computeChildCredit } from "@/lib/invoiceBalance";
import { EditableDescription } from "@/components/EditableDescription";
import { InlineTrackingEditor } from "@/components/InlineTrackingEditor";
import { InvoicePackingListSection } from "@/components/InvoicePackingListSection";
import InvoiceArtworkSection from "@/components/InvoiceArtworkSection";
import { calculateInvoiceTotals, blanketTotalItems, partialTotalItems } from "@/lib/invoiceTotals";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { triggerBlobFileDownload } from "@/lib/storageUrl";
import { CARRIERS, getTrackingUrl } from "@/lib/trackingUtils";
import { EditInvoiceAddressesDialog } from "@/components/EditInvoiceAddressesDialog";

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
  const [editAddressesOpen, setEditAddressesOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);
  const [editShippingCost, setEditShippingCost] = useState<string>('');
  const [editShippingNote, setEditShippingNote] = useState<string>('');
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  const handleAiAnalyzeShipped = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) e.target.value = '';

    setAiAnalyzing(true);
    try {
      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const fileContent = btoa(binary);

      const { data, error } = await supabase.functions.invoke('parse-vendor-packing-list', {
        body: { fileContent, fileName: file.name },
      });

      if (error) throw error;
      const items = (data?.items || []) as Array<{ description: string; total_qty: string }>;
      if (items.length === 0) {
        toast({ title: "No items found", description: "AI could not extract any line items from the file.", variant: "destructive" });
        return;
      }

      // Match against editedItems by SKU or name; update shipped_quantity
      const parseQty = (s: string) => {
        const m = String(s || '').match(/[\d,]+(\.\d+)?/);
        return m ? parseFloat(m[0].replace(/,/g, '')) : 0;
      };
      const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      let matched = 0;
      setEditedItems(prev => prev.map((item: any) => {
        const itemSku = norm(item.sku);
        const itemName = norm(item.name);
        const found = items.find((p) => {
          const desc = norm(p.description);
          if (!desc) return false;
          if (itemSku && (desc.includes(itemSku) || itemSku.includes(desc))) return true;
          if (itemName && (desc.includes(itemName) || itemName.includes(desc))) return true;
          return false;
        });
        if (!found) return item;
        const qty = parseQty(found.total_qty);
        if (!qty) return item;
        matched++;
        const isBlanket = invoice?.invoice_type === 'full' && invoice?.shipment_number === 1;
        return isBlanket
          ? { ...item, shipped_quantity: qty }
          : { ...item, quantity: qty, shipped_quantity: qty, total: qty * Number(item.unit_price || 0) };
      }));

      toast({
        title: "AI analysis complete",
        description: `Updated ${matched} of ${items.length} items. Review and click Save Changes.`,
      });
    } catch (err: any) {
      console.error('AI analyze error:', err);
      toast({ title: "Analysis failed", description: err.message || "Could not parse file", variant: "destructive" });
    } finally {
      setAiAnalyzing(false);
    }
  };
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
  const [showQuickShipDialog, setShowQuickShipDialog] = useState(false);
  const [quickShipQtys, setQuickShipQtys] = useState<Record<string, string>>({});
  const [savingQuickShip, setSavingQuickShip] = useState(false);
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
  const [products, setProducts] = useState<any[]>([]);
  const [openCombobox, setOpenCombobox] = useState<Record<string, boolean>>({});
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
      // Run both permission checks in parallel (was sequential)
      const [adminRes, accessRes] = await Promise.all([
        supabase.rpc('has_role', { _user_id: user.id, _role: 'vibe_admin' }),
        supabase.rpc('user_has_company_access', { _user_id: user.id, _company_id: invoiceCompanyId }),
      ]);
      if (adminRes.error) console.error('has_role error:', adminRes.error);
      if (accessRes.error) console.error('user_has_company_access error:', accessRes.error);
      isVibeAdminUser = !!adminRes.data;
      hasCompanyAccess = !!accessRes.data;
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

    const isBlanketInvoice = invoiceData.invoice_type === 'full' && invoiceData.shipment_number === 1;

    // Run all independent queries in parallel for faster page load
    const [
      productsRes,
      allocationsRes,
      vendorPOsRes,
      relatedRes,
      allAllocationsRes,
      qbSettingsRes,
      attachmentsRes,
    ] = await Promise.all([
      invoiceData.company_id
        ? supabase
            .from('products')
            .select('id, name, item_id, description, price')
            .eq('company_id', invoiceData.company_id)
            .order('name')
        : Promise.resolve({ data: null }),
      supabase
        .from('inventory_allocations')
        .select(`
          *,
          order_items(id, name, sku, unit_price, quantity, shipped_quantity, item_id, description, line_number),
          inventory(state, available)
        `)
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('vendor_pos')
        .select(`
          *,
          vendors(name, contact_name, contact_email),
          vendor_po_items(*)
        `)
        .eq('order_id', invoiceData.order_id)
        .order('created_at', { ascending: true }),
      supabase
        .from('invoices')
        .select('*')
        .eq('order_id', invoiceData.order_id)
        .neq('id', invoiceId)
        .is('deleted_at', null)
        .order('shipment_number'),
      supabase
        .from('inventory_allocations')
        .select(`quantity_allocated, invoice_id, invoices!inner(order_id)`)
        .eq('invoices.order_id', invoiceData.order_id),
      supabase
        .from('quickbooks_settings')
        .select('realm_id')
        .eq('is_connected', true)
        .limit(1)
        .maybeSingle(),
      invoiceData.order_id
        ? supabase
            .from('order_attachments')
            .select('*')
            .eq('order_id', invoiceData.order_id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: null }),
    ]);

    if (productsRes.data) setProducts(productsRes.data);

    const allocationsData = allocationsRes.data;
    if (allocationsData) {
      allocationsData.sort((a: any, b: any) => {
        const lineA = a.order_items?.line_number ?? 999;
        const lineB = b.order_items?.line_number ?? 999;
        return lineA - lineB;
      });
      setInventoryAllocations(allocationsData);

      const isDepositInvoice = invoiceData.notes && invoiceData.notes.includes('deposit payment');
      if (isBlanketInvoice || isDepositInvoice) {
        setEditedItems(invoiceData.orders?.order_items || []);
      } else if (allocationsData.length > 0) {
        const invoiceItems = allocationsData.map((alloc: any) => ({
          ...alloc.order_items,
          quantity: alloc.quantity_allocated,
          shipped_quantity: alloc.quantity_allocated,
          total: alloc.quantity_allocated * (alloc.order_items?.unit_price || 0),
        }));
        setEditedItems(invoiceItems);
      } else {
        setEditedItems(invoiceData.invoice_type === 'full' ? invoiceData.orders?.order_items || [] : []);
      }
    } else {
      setEditedItems(invoiceData.orders?.order_items || []);
    }

    const vendorPOData = vendorPOsRes.data;
    if (vendorPOData) {
      vendorPOData.forEach((po: any) => {
        if (po.vendor_po_items) {
          po.vendor_po_items.sort((a: any, b: any) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
      });
      setVendorPOs(vendorPOData);
    }

    const relatedData = relatedRes.data;
    if (relatedData) setRelatedInvoices(relatedData);

    const totalShippedAcrossAllInvoices = allAllocationsRes.data?.reduce(
      (sum: number, alloc: any) => sum + Number(alloc.quantity_allocated || 0),
      0
    ) || 0;
    setTotalShippedAllInvoices(totalShippedAcrossAllInvoices);

    if (qbSettingsRes.data?.realm_id) setQbRealmId(qbSettingsRes.data.realm_id);
    if (attachmentsRes.data) setOrderAttachments(attachmentsRes.data);

    // Payments need relatedData, so fetch after the parallel batch
    let paymentsData;
    if (isBlanketInvoice) {
      const allInvoiceIds = [invoiceId];
      if (relatedData && relatedData.length > 0) {
        allInvoiceIds.push(...relatedData.map((inv: any) => inv.id));
      }
      const { data: allPayments, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .in('invoice_id', allInvoiceIds)
        .order('payment_date', { ascending: false });
      if (paymentsError) console.error('Error fetching payments:', paymentsError);
      if (allPayments) {
        paymentsData = allPayments.map((payment: any) => {
          const relatedInvoice = relatedData?.find((inv: any) => inv.id === payment.invoice_id);
          return {
            ...payment,
            invoices: relatedInvoice
              ? {
                  invoice_number: relatedInvoice.invoice_number,
                  invoice_type: relatedInvoice.invoice_type,
                  shipment_number: relatedInvoice.shipment_number,
                }
              : payment.invoice_id === invoiceId
              ? {
                  invoice_number: invoiceData.invoice_number,
                  invoice_type: invoiceData.invoice_type,
                  shipment_number: invoiceData.shipment_number,
                }
              : null,
          };
        });
      }
    } else if (invoiceData.parent_invoice_id) {
      const parentAndSelfIds = [invoiceId!, invoiceData.parent_invoice_id];
      if (relatedData && relatedData.length > 0) {
        parentAndSelfIds.push(...relatedData.map((inv: any) => inv.id));
      }
      const { data: allRelatedPayments, error: relatedPaymentsError } = await supabase
        .from('payments')
        .select('*')
        .in('invoice_id', parentAndSelfIds)
        .order('payment_date', { ascending: false });
      if (relatedPaymentsError) console.error('Error fetching related payments:', relatedPaymentsError);
      if (allRelatedPayments) {
        paymentsData = allRelatedPayments.map((payment: any) => {
          if (payment.invoice_id === invoiceId) {
            return { ...payment, invoices: { invoice_number: invoiceData.invoice_number, invoice_type: invoiceData.invoice_type, shipment_number: invoiceData.shipment_number } };
          }
          if (payment.invoice_id === invoiceData.parent_invoice_id) {
            return { ...payment, invoices: { invoice_number: 'Parent Blanket', invoice_type: 'full', shipment_number: 1 } };
          }
          const sibling = relatedData?.find((inv: any) => inv.id === payment.invoice_id);
          return { ...payment, invoices: sibling ? { invoice_number: sibling.invoice_number, invoice_type: sibling.invoice_type, shipment_number: sibling.shipment_number } : null };
        });
      }
    } else {
      const { data: singleInvoicePayments } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: false });
      paymentsData = singleInvoicePayments;
    }

    if (paymentsData) setPayments(paymentsData);

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

    const isBlanket = invoice.invoice_type === 'full' || (!invoice.invoice_type && !invoice.parent_invoice_id);
    const itemsToDisplay = editedItems.length > 0 ? editedItems : (order?.order_items || []);

    // For blanket invoices with children, include child invoice payments in total paid
    const pdfChildPayments = isBlanket
      ? relatedInvoices.filter((ri: any) => ri.parent_invoice_id === invoiceId).reduce((s: number, ri: any) => s + Number(ri.total_paid || 0), 0)
      : 0;

    // Prorated blanket-payment credit for child invoices — single source of truth
    // in src/lib/invoiceBalance.ts (same math as the totals section below and the
    // invoice list PDF, so every surface shows the same balance).
    const parentBlanketForPdf = !isBlanket && invoice.parent_invoice_id
      ? relatedInvoices.find((ri: any) => ri.id === invoice.parent_invoice_id && ri.invoice_type === 'full')
      : null;
    const childrenForPdf = !isBlanket && invoice.parent_invoice_id
      ? [invoice, ...relatedInvoices.filter((ri: any) =>
          ri.id !== invoice.id && ri.parent_invoice_id === invoice.parent_invoice_id)]
      : [];
    const pdfCredit = computeChildCredit(invoice, parentBlanketForPdf, childrenForPdf, {
      blanketValue: Number(parentBlanketForPdf?.total || 0),
    });

    const invoiceData = {
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      total: invoice.total,
      deposit_credit: pdfCredit.amount > 0 ? pdfCredit.amount : null,
      deposit_credit_label: pdfCredit.label,
      total_paid: (invoice.total_paid || 0) + pdfChildPayments,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      shipping_cost: invoice.shipping_cost,
      shipping_note: invoice.shipping_note,
      notes: invoice.notes,
      companies: (invoice.companies as any) || { name: order.customer_name },
      billed_percentage: invoice.billed_percentage,
      billing_name: invoice.billing_name,
      billing_street: invoice.billing_street,
      billing_city: invoice.billing_city,
      billing_state: invoice.billing_state,
      billing_zip: invoice.billing_zip,
      shipping_name: invoice.shipping_name,
      shipping_street: invoice.shipping_street,
      shipping_city: invoice.shipping_city,
      shipping_state: invoice.shipping_state,
      shipping_zip: invoice.shipping_zip,
    };

    const orderForPdf = {
      order_number: order.order_number,
      customer_name: order.customer_name,
      po_number: order.po_number,
      billing_street: order.billing_street,
      billing_city: order.billing_city,
      billing_state: order.billing_state,
      billing_zip: order.billing_zip,
      shipping_street: order.shipping_street,
      shipping_city: order.shipping_city,
      shipping_state: order.shipping_state,
      shipping_zip: order.shipping_zip,
      order_items: itemsToDisplay,
    };

    await generateInvoicePDF(invoiceData, orderForPdf);
    toast({
      title: "PDF Downloaded",
      description: `Invoice ${invoice.invoice_number} has been downloaded`
    });
  };

  const handleDownloadPackingList = async () => {
    if (!invoice || !order) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      await drawMasthead(doc);

      let yPos = drawDocumentTitle(doc, {
        label: 'PACKING LIST',
        value: String(invoice.invoice_number || ''),
        metaLabel: 'Packed',
        metaValue: format(new Date(), 'MMMM d, yyyy'),
      });

      const leftColX = DOC.MARGIN;
      const rightColX = pageWidth / 2 + 4;
      const detailsStartY = yPos;

      const shipName = String(invoice.shipping_name || order.shipping_name || '');
      const shipStreet = String(invoice.shipping_street || order.shipping_street || '');
      const shipCity = String(invoice.shipping_city || order.shipping_city || '');
      const shipState = String(invoice.shipping_state || order.shipping_state || '');
      const shipZip = String(invoice.shipping_zip || order.shipping_zip || '');

      const shipY = drawPartyBlock(doc, leftColX, yPos, {
        label: 'DELIVERY ADDRESS',
        name: shipName || '—',
        lines: [
          shipStreet || null,
          [shipCity, shipState, shipZip].filter(Boolean).join(', ').replace(', ,', ',') || '—',
        ],
      });

      const detailRows: Array<[string, string]> = [['Order #', String(order.order_number || '')]];
      if (order.po_number) detailRows.push(['PO #', String(order.po_number)]);

      const detY = drawDetailRows(doc, rightColX, detailsStartY, detailRows, { valueOffset: 30 });

      yPos = Math.max(shipY + 8, detY + 10);

      let itemsForPacking: any[] = [];
      if (inventoryAllocations.length > 0) {
        itemsForPacking = inventoryAllocations
          .filter((alloc: any) => Number(alloc.quantity_allocated) > 0)
          .map((alloc: any) => ({
            item_id: alloc.order_items?.item_id,
            sku: alloc.order_items?.sku,
            name: alloc.order_items?.name,
            description: alloc.order_items?.description,
            quantity: Number(alloc.quantity_allocated) || 0,
          }));
      }

      if (itemsForPacking.length === 0) {
        itemsForPacking = (editedItems.length > 0 ? editedItems : (order?.order_items || [])).map((item: any) => ({
          item_id: item?.item_id,
          sku: item?.sku,
          name: item?.name,
          description: item?.description,
          quantity: Number(item?.quantity ?? item?.shipped_quantity ?? 0) || 0,
        }));
      }

      const tableData = itemsForPacking.map((item: any) => [
        String(item?.item_id || 'N/A'),
        String(item?.sku || ''),
        pdfItemDescription(item),
        (Number(item?.quantity) || 0).toLocaleString(),
      ]);

      autoTable(doc, {
        ...docTableStyles(),
        startY: yPos,
        head: [['ITEM ID', 'SKU', 'DESCRIPTION', 'QTY']],
        body: tableData,
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 36, fontStyle: 'bold', textColor: DOC_COLORS.ink },
          3: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: DOC_COLORS.ink }
        },
      });

      const totalItems = itemsForPacking.reduce((sum: number, item: any) => sum + (Number(item?.quantity) || 0), 0);
      const tableEndY = ensureRoom(doc, ((doc as any).lastAutoTable?.finalY ?? yPos) + 12, 20);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DOC_COLORS.ink);
      doc.text(`Total quantity: ${totalItems.toLocaleString()}`, DOC.MARGIN, tableEndY + 4);

      drawFooter(doc);

      triggerBlobFileDownload(doc.output('blob'), `packing-list-${invoice.invoice_number}.pdf`);

      toast({
        title: "Packing List Downloaded",
        description: `Packing list for ${invoice.invoice_number} has been downloaded`
      });
    } catch (error: any) {
      console.error('handleDownloadPackingList error:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to download packing list",
        variant: "destructive"
      });
    }
  };

  const handleSaveQuantities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // For blanket invoices, we need to create inventory allocations if quantities are being set
      const isBlanketInvoice = invoice?.invoice_type === 'full' && invoice?.shipment_number === 1;
      const hasChildInvoices = relatedInvoices.some(
        (ri: any) => ri.parent_invoice_id === invoiceId
      );
      const preserveChildShipmentQuantities = isBlanketInvoice && hasChildInvoices;

      // Only protect blanket shipped quantities when child invoices exist.
      // Otherwise admins must be able to directly lower or raise shipped qty.
      let dbShippedMap: Record<string, number> = {};
      if (preserveChildShipmentQuantities && order?.id) {
        const { data: currentItems } = await supabase
          .from('order_items')
          .select('id, shipped_quantity')
          .eq('order_id', order.id);
        if (currentItems) {
          for (const ci of currentItems) {
            dbShippedMap[ci.id] = ci.shipped_quantity || 0;
          }
        }
      }
      
      // Delete removed line items (blanket direct-edit only)
      if (deletedItemIds.length > 0 && order?.id) {
        // Detach from vendor PO items first to avoid cascade wiping
        await supabase.from('vendor_po_items').update({ order_item_id: null }).in('order_item_id', deletedItemIds);
        await supabase.from('order_items').delete().in('id', deletedItemIds);
      }

      // Insert any newly added line items, then swap their temp ids
      const newItems = editedItems.filter((it: any) => typeof it.id === 'string' && it.id.startsWith('new-'));
      const tempIdToRealId: Record<string, string> = {};
      if (newItems.length > 0 && order?.id) {
        const rows = newItems.map((it: any) => ({
          order_id: order.id,
          name: it.name || 'New line item',
          sku: it.sku || it.item_id || null,
          item_id: it.item_id || null,
          product_id: it.product_id || null,
          description: it.description || null,
          quantity: Number(it.quantity) || 0,
          shipped_quantity: Number(it.shipped_quantity ?? it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
        }));
        const { data: inserted, error: insertErr } = await supabase
          .from('order_items')
          .insert(rows)
          .select('id');
        if (insertErr) throw insertErr;
        (inserted || []).forEach((row: any, idx: number) => {
          tempIdToRealId[newItems[idx].id] = row.id;
        });
      }

      // Update each EXISTING order item IN PARALLEL
      const existingItems = editedItems.filter((it: any) => !(typeof it.id === 'string' && it.id.startsWith('new-')));
      await Promise.all(existingItems.map(async (item) => {
        const editedShippedQty = Number(item.shipped_quantity) || 0;
        const dbShipped = dbShippedMap[item.id] ?? 0;
        const newShippedQty = preserveChildShipmentQuantities
          ? Math.max(editedShippedQty, dbShipped)
          : editedShippedQty;
        const orderedTotal = Number(item.quantity) * Number(item.unit_price);

        const { error } = await supabase.from('order_items').update({
          shipped_quantity: newShippedQty,
          unit_price: item.unit_price,
          quantity: item.quantity,
          total: orderedTotal,
          name: item.name,
          sku: item.sku || item.item_id,
          item_id: item.item_id,
          product_id: item.product_id,
          description: item.description,
        }).eq('id', item.id);
        if (error) throw error;

        // Only create allocations for shipment/partial invoices, NOT blanket invoices
        if (!isBlanketInvoice && newShippedQty > 0) {
          const { data: existingAlloc } = await supabase
            .from('inventory_allocations')
            .select('id, quantity_allocated')
            .eq('invoice_id', invoiceId)
            .eq('order_item_id', item.id)
            .maybeSingle();

          if (existingAlloc) {
            await supabase
              .from('inventory_allocations')
              .update({ quantity_allocated: newShippedQty })
              .eq('id', existingAlloc.id);
          } else {
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
      }));

      // Sync shipped quantities to linked vendor PO items IN PARALLEL
      try {
        await Promise.all(editedItems.map(async (item) => {
          const newShippedQty = preserveChildShipmentQuantities
            ? Math.max(Number(item.shipped_quantity) || 0, dbShippedMap[item.id] ?? 0)
            : Number(item.shipped_quantity) || 0;
          if (newShippedQty <= 0) return;

          const { data: linkedVPOItems } = await supabase
            .from('vendor_po_items')
            .select('id, unit_cost, vendor_po_id')
            .eq('order_item_id', item.id);
          if (!linkedVPOItems || linkedVPOItems.length === 0) return;

          await Promise.all(linkedVPOItems.map(async (vpoItem: any) => {
            const vpoTotal = Math.round(newShippedQty * Number(vpoItem.unit_cost) * 100) / 100;
            await supabase
              .from('vendor_po_items')
              .update({ shipped_quantity: newShippedQty, total: vpoTotal })
              .eq('id', vpoItem.id);
          }));
        }));

        // PO totals are recalculated by the vendor_po_recalc trigger as the items above are
        // written. Re-summing item.total here dropped shipping and raced the trigger.
      } catch (syncErr) {
        console.error('Vendor PO sync error (non-fatal):', syncErr);
      }

      // Recalculate totals using shared calculator - shipped qty Ã— price
      // Check if this blanket has child (partial) invoices — if so, keep placeholder
      const hasChildren = relatedInvoices.some(
        (ri: any) => ri.parent_invoice_id === invoiceId
      );
      const totalItems = blanketTotalItems(editedItems, hasChildren);
      const editedShipping = Number(editShippingCost || 0);
      let { subtotal: newSubtotal, total: newTotal } = calculateInvoiceTotals(
        totalItems,
        Number(invoice.tax || 0),
        editedShipping
      );

      // NOTE: Do NOT update order totals from invoice edit - invoice scope only
      // Update invoice totals
      const {
        error: invoiceError
      } = await supabase.from('invoices').update({
        subtotal: newSubtotal,
        total: newTotal,
        shipping_cost: editedShipping,
        shipping_note: editShippingNote || null,
      }).eq('id', invoiceId);
      if (invoiceError) throw invoiceError;
      // Update local state instead of refetching
      const remainingExisting = (order?.order_items || []).filter((oi: any) => !deletedItemIds.includes(oi.id));
      const mergedExisting = remainingExisting.map((oi: any) => {
        const edited = editedItems.find((ei: any) => ei.id === oi.id);
        return edited ? { ...oi, ...edited } : oi;
      });
      const appendedNew = editedItems
        .filter((ei: any) => typeof ei.id === 'string' && ei.id.startsWith('new-'))
        .map((ei: any) => ({ ...ei, id: tempIdToRealId[ei.id] || ei.id }));
      const updatedOrderItems = [...mergedExisting, ...appendedNew];
      setOrder({ ...order, order_items: updatedOrderItems });
      setEditedItems(updatedOrderItems);
      setDeletedItemIds([]);
      setInvoice({
        ...invoice,
        subtotal: newSubtotal,
        total: newTotal,
        shipping_cost: editedShipping,
        shipping_note: editShippingNote || null,
        orders: { ...(invoice?.orders || {}), order_items: updatedOrderItems },
      });
      toast({
        title: "Success",
        description: "Invoice line items updated"
      });
      setIsEditMode(false);
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
    const isBlanket = invoice?.invoice_type === 'full' && invoice?.shipment_number === 1;
    const isNewLine = typeof itemId === 'string' && itemId.startsWith('new-');
    setEditedItems(items => items.map(item => item.id === itemId ? {
      ...item,
      // New blanket lines: update BOTH ordered + shipped so they show up on the order too.
      // Existing blanket rows: only shipped (preserves original ordered qty).
      ...((isBlanket && !isNewLine)
        ? { shipped_quantity: newQuantity }
        : { quantity: newQuantity, shipped_quantity: newQuantity, total: newQuantity * Number(item.unit_price) }
      )
    } : item));
  };

  const handleAddInvoiceLineItem = () => {
    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEditedItems(items => [...items, {
      id: tempId,
      name: '',
      sku: '',
      item_id: null,
      product_id: null,
      description: '',
      quantity: 0,
      shipped_quantity: null,
      unit_price: 0,
      total: 0,
    }]);
  };

  const handleRemoveInvoiceLineItem = (itemId: string) => {
    if (typeof itemId === 'string' && itemId.startsWith('new-')) {
      setEditedItems(items => items.filter(i => i.id !== itemId));
    } else {
      setDeletedItemIds(prev => prev.includes(itemId) ? prev : [...prev, itemId]);
      setEditedItems(items => items.filter(i => i.id !== itemId));
    }
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

      // Re-sync to get updated payment link.
      // billed_percentage is a one-shot deposit flag — once an invoice already exists in QBO,
      // refreshing the link should always bill the full remaining balance (100%), otherwise
      // the QBO invoice/link stays stuck at the original deposit amount.
      const { error } = await supabase.functions.invoke('quickbooks-sync-invoice', {
        body: {
          invoiceId,
          billingPercentage: 100
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





  // Finalising a blanket used to be two actions that computed different totals. It is one now,
  // and the arithmetic lives in the DB (recalc_blanket_invoices_for_order) so the number here is
  // only a preview of what the database will write.
  const handleUpdateBlanketTotal = async () => {
    if (!invoice || !order) return;
    const children = (relatedInvoices || []).filter((ri: any) => ri.parent_invoice_id === invoiceId);
    const newSubtotal = (order.order_items || []).reduce(
      (sum: number, oi: any) =>
        sum + Number(oi.shipped_quantity || 0) * Number(oi.unit_price || 0),
      0
    );
    const childShipping = children.reduce((sum: number, ri: any) => sum + Number(ri.shipping_cost || 0), 0);
    // Freight is billed on the shipment that carried it; fall back to the blanket's own when
    // there are no children.
    const newShipping = children.length > 0 && childShipping > 0
      ? childShipping
      : Number(invoice.shipping_cost || 0);
    const newTotal = newSubtotal + Number(invoice.tax || 0) + newShipping;
    const childrenTotal = children.reduce((sum: number, ri: any) => sum + Number(ri.total || 0), 0);
    const blanketPaid = Number(invoice.total_paid || 0);

    const reconciliation = children.length > 0
      ? `\n\nShipment invoices: ${formatCurrency(childrenTotal)}\nPaid on this blanket: ${formatCurrency(blanketPaid)}` +
        (Math.abs(childrenTotal + blanketPaid - newTotal) > 0.01
          ? `\n\nHeads up: shipments + blanket payments come to ${formatCurrency(childrenTotal + blanketPaid)}, which does not match the new total.`
          : `\n\nThose reconcile to the new total.`)
      : '';

    // A shipped quantity of 0 or blank means one of two different things: nobody has recorded a
    // shipment on that line yet, or it genuinely shipped nothing. Finalising bills both at zero,
    // so the lines get listed here for a human to confirm rather than silently dropping value.
    const unshippedLines = (order.order_items || []).filter(
      (oi: any) => Number(oi.quantity || 0) > 0 && Number(oi.shipped_quantity || 0) === 0
    );
    const unshippedValue = unshippedLines.reduce(
      (sum: number, oi: any) => sum + Number(oi.quantity || 0) * Number(oi.unit_price || 0), 0);
    const unshippedWarning = unshippedLines.length > 0
      ? `\n\n${unshippedLines.length} line${unshippedLines.length === 1 ? '' : 's'} ` +
        `${unshippedLines.length === 1 ? 'has' : 'have'} nothing shipped and will bill zero ` +
        `(${formatCurrency(unshippedValue)} as ordered):\n` +
        unshippedLines.slice(0, 8).map((oi: any) =>
          `  • ${oi.sku || oi.name} — ordered ${Number(oi.quantity || 0).toLocaleString()}, shipped ${oi.shipped_quantity === null || oi.shipped_quantity === undefined ? 'not recorded' : '0'}`
        ).join('\n') +
        (unshippedLines.length > 8 ? `\n  ...and ${unshippedLines.length - 8} more` : '') +
        `\n\nIf any of those actually shipped, cancel and record the quantities first.`
      : '';

    if (
      !confirm(
        `Finalise this blanket at ${formatCurrency(newTotal)}?\n\n` +
        `Current total: ${formatCurrency(Number(invoice.total || 0))}\n` +
        `Shipped Ã— price: ${formatCurrency(newSubtotal)}\n` +
        `Freight${children.length > 0 && childShipping > 0 ? ' (from shipments)' : ''}: ${formatCurrency(newShipping)}\n` +
        `Tax: ${formatCurrency(Number(invoice.tax || 0))}` +
        reconciliation +
        unshippedWarning +
        `\n\nThis freezes the blanket and releases any deposit paid on it to the final shipment. You can reopen it later.`
      )
    ) {
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Setting blanket_closed_at fires trg_recalc_blanket_on_close, which writes the totals.
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'closed',
          blanket_closed_at: new Date().toISOString(),
          blanket_closed_by: user?.id ?? null,
        })
        .eq('id', invoiceId);
      if (error) throw error;

      const { data: after } = await supabase
        .from('invoices')
        .select('total')
        .eq('id', invoiceId)
        .maybeSingle();

      const written = Number(after?.total ?? newTotal);
      toast({
        title: 'Blanket Finalised',
        description: Math.abs(written - newTotal) > 0.01
          ? `Total is ${formatCurrency(written)}. It did not move to ${formatCurrency(newTotal)} — a paid or QuickBooks-synced blanket is left alone.`
          : `Final total: ${formatCurrency(written)}`,
        variant: Math.abs(written - newTotal) > 0.01 ? 'destructive' : undefined,
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to finalise blanket',
        variant: 'destructive',
      });
    }
  };

  const openQuickShipDialog = () => {
    const initial: Record<string, string> = {};
    (order?.order_items || []).forEach((oi: any) => {
      // null shipped_quantity = placeholder (blank input, dimmed "0" placeholder)
      // 0 or any number = intentional value
      initial[oi.id] = oi.shipped_quantity === null || oi.shipped_quantity === undefined
        ? ''
        : String(Number(oi.shipped_quantity));
    });
    setQuickShipQtys(initial);
    setShowQuickShipDialog(true);
  };

  const handleSaveQuickShip = async () => {
    if (!order?.order_items) return;
    setSavingQuickShip(true);
    try {
      // Persist child-shipment shipping onto the blanket FIRST, so the DB trigger
      // (which owns blanket subtotal/total) folds it into the total it computes
      // when the shipped_quantity writes below fire it. No client-side
      // subtotal/total write — the trigger applies the draw-down rule
      // (GREATEST(ordered, shipped) while open) and its settled-invoice guards.
      const newShipping = (relatedInvoices || [])
        .filter((ri: any) => ri.parent_invoice_id === invoiceId)
        .reduce((sum: number, ri: any) => sum + Number(ri.shipping_cost || 0), 0);
      if (isBlanketDisplay && newShipping > 0) {
        const { error: invErr } = await supabase
          .from('invoices')
          .update({ shipping_cost: newShipping })
          .eq('id', invoiceId);
        if (invErr) throw invErr;
      }

      // Update each order_item's shipped_quantity (each write fires the recalc trigger)
      for (const oi of order.order_items) {
        const raw = quickShipQtys[oi.id];
        if (raw === undefined) continue;
        // Empty string means "clear back to placeholder" -> null.
        // Any typed value (including "0") is intentional and stored as a number.
        const newVal: number | null = raw === '' ? null : Number(raw);
        if (newVal !== null && (!isFinite(newVal) || newVal < 0)) continue;
        const { error } = await supabase
          .from('order_items')
          .update({ shipped_quantity: newVal })
          .eq('id', oi.id);
        if (error) throw error;
      }

      toast({ title: 'Shipped Quantities Updated', description: 'Blanket totals recalculated' });
      setShowQuickShipDialog(false);
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to save shipped quantities', variant: 'destructive' });
    } finally {
      setSavingQuickShip(false);
    }
  };

  // Removing a deposit had no explicit action: you had to re-open the Bill Deposit dialog and
  // enter 100, which reads like billing a 100% deposit rather than cancelling one.
  const handleClearDeposit = async () => {
    if (!invoice) return;
    const pct = Number(invoice.billed_percentage);
    if (
      !confirm(
        `Remove the ${pct}% deposit from invoice ${invoice.invoice_number}?\n\n` +
        `It will bill the full ${formatCurrency(Number(invoice.total || 0))} instead of ${formatCurrency(Number(invoice.total || 0) * pct / 100)}.\n\n` +
        `Payments already recorded are not affected. Re-sync to QuickBooks afterwards to push the change.`
      )
    ) {
      return;
    }
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ billed_percentage: null, quickbooks_sync_status: invoice.quickbooks_id ? 'pending' : null })
        .eq('id', invoiceId);
      if (error) throw error;
      toast({
        title: 'Deposit Removed',
        description: invoice.quickbooks_id
          ? 'This invoice now bills in full. Re-sync to QuickBooks to update it there.'
          : 'This invoice now bills in full.',
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to remove deposit', variant: 'destructive' });
    }
  };

  const handleReopenInvoice = async () => {
    if (!confirm('Reopen this invoice? This will set the status back to open.')) {
      return;
    }
    try {
      const { error } = await supabase.from('invoices').update({
        status: 'open',
        blanket_closed_at: null,
        blanket_closed_by: null,
      }).eq('id', invoiceId);
      if (error) throw error;
      toast({
        title: "Invoice Reopened",
        description: "Invoice has been reopened and set to open"
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
  // billed_percentage means exactly one thing: the deposit rate someone set on this invoice.
  // null or 100 both mean no deposit.
  const hasDeposit =
    invoice?.billed_percentage != null &&
    Number(invoice.billed_percentage) > 0 &&
    Number(invoice.billed_percentage) < 100;

  // No short-shipment flag here, deliberately. Entering shipped quantities on an invoice IS
  // the invoice -- the stored subtotal is already the shipped basis, so comparing it back
  // against the ordered quantities subtracts the same shortfall twice and invents a gap that
  // does not exist. 10957 bills 16,075.875 on 8,625 shipped and is simply correct.
  
  const displayShipping = isEditMode ? Number(editShippingCost || 0) : Number(invoice?.shipping_cost || 0);
  
  // Unified total calculation using shared calculator
  const computeDisplayTotals = () => {
    if (isEditMode) {
      // Edit mode: use shipped qty, respecting child invoice placeholder logic
      const hasChildren = relatedInvoices.some(
        (ri: any) => ri.parent_invoice_id === invoiceId
      );
      const items = blanketTotalItems(editedItems, hasChildren);
      return calculateInvoiceTotals(items, Number(invoice?.tax || 0), displayShipping);
    }
    // Non-edit display uses stored invoice totals. This preserves the manual
    // "Update Blanket" value instead of re-freezing open blankets to ordered total.
    return { subtotal: Number(invoice?.subtotal || 0), total: Number(invoice?.subtotal || 0) + Number(invoice?.tax || 0) + displayShipping };
  };
  
  const { subtotal: displaySubtotal, total: rawDisplayTotal } = computeDisplayTotals();
  // For blanket invoices with children, roll up child shipping for display.
  // NOTE: "Update Blanket Total" / "Set Shipped Qty" persist Î£(child shipping) into the
  // blanket's own shipping_cost. To avoid double counting, only add child shipping on top
  // when the blanket's stored shipping_cost is 0 (legacy / not yet rolled up).
  const rawChildShipping = isBlanketDisplay
    ? relatedInvoices
        .filter((ri: any) => ri.parent_invoice_id === invoiceId)
        .reduce((sum: number, ri: any) => sum + Number(ri.shipping_cost || 0), 0)
    : 0;
  const blanketStoredShipping = Number(invoice?.shipping_cost || 0);
  const childShippingTotal = isBlanketDisplay && blanketStoredShipping === 0 ? rawChildShipping : 0;
  const displayTotal = rawDisplayTotal + childShippingTotal;
  // For blanket invoices with children, include child invoice payments in total paid
  const childPaymentsTotal = isBlanketDisplay
    ? relatedInvoices
        .filter((ri: any) => ri.parent_invoice_id === invoiceId)
        .reduce((sum: number, ri: any) => sum + Number(ri.total_paid || 0), 0)
    : 0;
  const displayTotalPaid = Number(invoice?.total_paid || 0) + childPaymentsTotal;
  const billedPct = invoice?.billed_percentage;
  // Hide the "Deposit (X%)" deduction line on blankets once any payment has been recorded —
  // the deposit was billed and (presumably) paid; "Less Payments" already accounts for it.
  // Otherwise we double-deduct (deposit line + payments line).
  // Deposit billing line only applies to parent blanket invoices, never child shipment/deposit invoices.
  // Once any shipment exists on the order, the deposit % no longer caps the bill — use realized total.
  const anyShippedOnOrder = (order?.order_items || []).some((it: any) => Number(it.shipped_quantity || 0) > 0);
  const isDepositBilling = isBlanketDisplay && !anyShippedOnOrder && billedPct != null && billedPct > 0 && billedPct < 100 && displayTotalPaid === 0;
  const displayBilledTotal = isDepositBilling ? displayTotal * (billedPct / 100) : displayTotal;
  const displayBalance = displayBilledTotal - displayTotalPaid;

  // Calculate shipped percentage from actual quantities
  const calculateShippedPercentage = () => {
    if (!order?.order_items) return 0;
    const totalOrdered = order.order_items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const totalShipped = order.order_items.reduce((sum: number, item: any) => sum + Number(item.shipped_quantity || 0), 0);
    return totalOrdered > 0 ? Math.min((totalShipped / totalOrdered) * 100, 100) : 0;
  };
  const shippedPercentage = calculateShippedPercentage();
  // Cost is what the vendor billed us, falling back to the PO we cut when nothing is billed yet.
  // Same basis as Projects, AP and Send to Finance.
  const totalVendorCost = vendorPOs.reduce((sum, po) => sum + Number(po.final_total ?? po.total ?? 0), 0);
  const totalProfit = displayTotal - totalVendorCost;
  const profitMargin = displayTotal > 0 ? (totalProfit / displayTotal * 100).toFixed(2) : '0.00';
  const shipmentInvoicesForBlanket = isBlanketDisplay && invoice
    ? relatedInvoices.filter((ri: any) =>
        ri.parent_invoice_id === invoice.id ||
        (ri.invoice_type === 'partial' && Number(ri.shipment_number || 0) > 1)
      )
    : [];
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
        <Button variant="ghost" size="sm" onClick={() => {
           const params = new URLSearchParams(window.location.search);
           const returnTo = params.get('returnTo');
           if (returnTo) {
             navigate(returnTo);
           } else {
             navigate(-1);
           }
         }}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {new URLSearchParams(window.location.search).get('returnTo') ? 'Back to Project' : 'Back to Invoices'}
        </Button>
        <div className="flex flex-wrap gap-2">
          {isVibeAdmin && <>
              {isEditMode ? <>
                  <Button size="sm" variant="outline" onClick={() => {
              setIsEditMode(false);
              setEditedItems(order?.order_items || []);
              setDeletedItemIds([]);
            }}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveQuantities}>
                    Save Changes
                  </Button>
                </> : <>
                  {/* PRIMARY ACTIONS — always visible */}
                  {invoice.quickbooks_sync_status === 'synced' && invoice.quickbooks_id ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
                          <Check className="h-4 w-4" />
                          Synced
                          <ChevronDown className="h-3 w-3" />
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
                    <Button size="sm" variant="outline" onClick={() => setShowSyncDialog(true)} disabled={syncingToQB}>
                      <RefreshCw className={`h-4 w-4 mr-1.5 ${syncingToQB ? 'animate-spin' : ''}`} />
                      Sync to QBO
                    </Button>
                  )}
                  {/* Everything below runs the billing: taking payments, setting or clearing a
                      deposit, editing shipped quantities, closing a blanket out. This page is
                      reachable by the customer the invoice belongs to -- /invoices/:invoiceId has
                      no route guard -- so none of it may render for them. */}
                  {isVibeAdmin && (
                    <>
                      {invoice.status !== 'paid' && <Button size="sm" onClick={() => setShowPaymentDialog(true)}>
                          <DollarSign className="h-4 w-4 mr-1.5" />
                          Record Payment
                        </Button>}
                      {invoice.invoice_type === 'full' && invoice.shipment_number === 1 && <Button size="sm" variant="outline" onClick={() => setShowDepositDialog(true)} className="border-blue-500 text-blue-700 hover:bg-blue-50">
                          <DollarSign className="h-4 w-4 mr-1.5" />
                          {hasDeposit ? `Deposit ${Number(invoice.billed_percentage)}%` : 'Bill Deposit'}
                        </Button>}
                      {hasDeposit && <Button size="sm" variant="outline" onClick={handleClearDeposit} className="border-amber-500 text-amber-700 hover:bg-amber-50">
                          <X className="h-4 w-4 mr-1.5" />
                          Clear Deposit
                        </Button>}
                      {invoice.invoice_type === 'full' && invoice.status !== 'closed' && <Button size="sm" variant="outline" onClick={() => navigate(`/invoices/${invoiceId}/shipped`)} className="border-purple-500 text-purple-700 hover:bg-purple-50">
                          <Package className="h-4 w-4 mr-1.5" />
                          Edit Shipped Qty
                        </Button>}
                      {invoice.invoice_type === 'full' && invoice.status !== 'closed' && <Button size="sm" variant="outline" onClick={handleUpdateBlanketTotal} className="border-blue-500 text-blue-700 hover:bg-blue-50">
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          Finalise Blanket
                        </Button>}
                    </>
                  )}

                  {/* CONSOLIDATED ACTIONS DROPDOWN — secondary actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        Actions
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel>Edit</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => {
                        if (invoice?.invoice_type === 'full' && order?.order_items) {
                          setEditedItems(order.order_items.map((item: any) => ({
                            ...item,
                            shipped_quantity: item.shipped_quantity || 0
                          })));
                        }
                        setEditShippingCost(String(invoice?.shipping_cost || 0));
                        setEditShippingNote(invoice?.shipping_note || '');
                        setIsEditMode(true);
                      }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Items
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/orders/${invoice.order_id}`)}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Order
                      </DropdownMenuItem>

                      {invoice.quickbooks_id && <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Payment Link</DropdownMenuLabel>
                        <DropdownMenuItem onClick={handleRefreshPaymentLink} disabled={refreshingLink}>
                          <RefreshCw className={`h-4 w-4 mr-2 ${refreshingLink ? 'animate-spin' : ''}`} />
                          {refreshingLink ? 'Getting Link...' : 'Get Payment Link'}
                        </DropdownMenuItem>
                      </>}

                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Email</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setShowSendEmailDialog(true)}>
                        <Mail className="h-4 w-4 mr-2" />
                        Send Invoice to Customer
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowNoticeDialog("billed")}>
                        <Bell className="h-4 w-4 mr-2" />
                        Send Billed Notice (Net 30)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowNoticeDialog("payment_due")}>
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Send Payment Due Reminder
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Status</DropdownMenuLabel>
                      {invoice.status === 'closed' && (
                        <DropdownMenuItem onClick={handleReopenInvoice}>
                          <RotateCcw className="h-4 w-4 mr-2 text-amber-600" />
                          Reopen Invoice
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Invoice
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>}
            </>}
          <Button size="sm" onClick={handleDownloadPDF} title="Download Invoice PDF" aria-label="Download Invoice">
            <Download className="h-4 w-4" />
          </Button>
          {(invoice.invoice_type === 'partial' || invoice.parent_invoice_id) && (
            <Button size="sm" variant="outline" onClick={handleDownloadPackingList} title="Download Packing List" aria-label="Download Packing List">
              <FileText className="h-4 w-4" />
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
                <div className="flex items-start gap-2">
                  <span className="text-sm text-muted-foreground shrink-0 mt-1">Customer PO:</span>
                  {isVibeAdmin ? (
                    <div className="flex-1 min-w-[180px]">
                      <EditableDescription
                        value={(invoice as any)?.customer_po_number ?? order?.po_number ?? ""}
                        placeholder="Add customer PO…"
                        onSave={async (newValue) => {
                          if (!invoice?.id) return;
                          const val = newValue?.trim() ? newValue.trim() : null;
                          const { error } = await supabase
                            .from("invoices")
                            .update({ customer_po_number: val })
                            .eq("id", invoice.id);
                          if (error) {
                            toast({ title: "Error", description: "Failed to save PO", variant: "destructive" });
                            return;
                          }
                          setInvoice({ ...invoice, customer_po_number: val } as any);
                        }}
                      />
                    </div>
                  ) : (
                    ((invoice as any)?.customer_po_number || order?.po_number) && (
                      <p className="text-sm text-muted-foreground">{(invoice as any)?.customer_po_number || order?.po_number}</p>
                    )
                  )}
                </div>



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
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span>Invoice Date:</span>
                    {isVibeAdmin ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" className="h-auto p-0 text-xs font-medium hover:bg-transparent">
                            {format(new Date(invoice.invoice_date), "MMM d, yyyy")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar
                            mode="single"
                            selected={invoice.invoice_date ? new Date(invoice.invoice_date) : undefined}
                            onSelect={async (date) => {
                              if (!date) return;
                              const { error } = await supabase
                                .from('invoices')
                                .update({ invoice_date: date.toISOString() })
                                .eq('id', invoice.id);
                              if (error) {
                                toast({ title: "Error", description: "Failed to update invoice date", variant: "destructive" });
                              } else {
                                setInvoice({ ...invoice, invoice_date: date.toISOString() });
                                toast({ title: "Invoice date updated" });
                              }
                            }}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span>{new Date(invoice.invoice_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">Shipped Date</p>
                  <p className="text-[11px] text-muted-foreground mb-1">Net 30 starts from this date</p>
                  {isVibeAdmin ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className={cn(
                            "h-auto p-0 font-medium hover:bg-transparent",
                            !invoice.shipped_date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {invoice.shipped_date ? format(new Date(invoice.shipped_date), "MMM d, yyyy") : "Set Shipped Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={invoice.shipped_date ? new Date(invoice.shipped_date) : undefined}
                          onSelect={async (date) => {
                            const iso = date ? date.toISOString() : null;
                            const updates: { shipped_date: string | null; invoice_date?: string } = { shipped_date: iso };
                            if (iso) updates.invoice_date = iso;
                            const { error } = await supabase
                              .from('invoices')
                              .update(updates)
                              .eq('id', invoice.id);

                            if (error) {
                              toast({ title: "Error", description: "Failed to update shipped date", variant: "destructive" });
                            } else {
                              setInvoice({ ...invoice, shipped_date: iso, ...(iso ? { invoice_date: iso } : {}) });
                              toast({ title: iso ? "Shipped & invoice date updated" : "Shipped date cleared" });
                            }
                          }}

                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <p className="font-medium">
                      {invoice.shipped_date ? format(new Date(invoice.shipped_date), "MMM d, yyyy") : "Not set"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Shipping Information */}
          <div className="p-8 border-b">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-sm font-semibold">Addresses</h3>
              {isVibeAdmin && (
                <Button variant="outline" size="sm" onClick={() => setEditAddressesOpen(true)}>
                  <Edit className="h-3 w-3 mr-1" /> Edit
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Ship To</h4>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{invoice?.shipping_name || order?.shipping_name}</p>
                  <p className="text-muted-foreground">{invoice?.shipping_street || order?.shipping_street}</p>
                  <p className="text-muted-foreground">
                    {invoice?.shipping_city || order?.shipping_city}, {invoice?.shipping_state || order?.shipping_state} {invoice?.shipping_zip || order?.shipping_zip}
                  </p>
                </div>
              </div>
              {(invoice?.billing_name || order?.billing_name) && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Bill To</h4>
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{invoice?.billing_name || order?.billing_name}</p>
                    <p className="text-muted-foreground">{invoice?.billing_street || order?.billing_street}</p>
                    <p className="text-muted-foreground">
                      {invoice?.billing_city || order?.billing_city}, {invoice?.billing_state || order?.billing_state} {invoice?.billing_zip || order?.billing_zip}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Shipping Method & Tracking */}
            <div className="mt-6 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">Shipping Method</h3>
                {isVibeAdmin ? (
                  <Input
                    defaultValue={invoice?.shipping_method || ''}
                    placeholder="e.g., LTL Freight, Ground, Ocean FCL"
                    onBlur={async (e) => {
                      const val = e.target.value || null;
                      if (val === (invoice?.shipping_method || null)) return;
                      const { error } = await supabase
                        .from('invoices')
                        .update({ shipping_method: val })
                        .eq('id', invoice.id);
                      if (error) {
                        toast({ title: "Error", description: "Failed to update shipping method", variant: "destructive" });
                      } else {
                        setInvoice({ ...invoice, shipping_method: val });
                        toast({ title: "Shipping method updated" });
                      }
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{invoice?.shipping_method || '—'}</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Tracking</h3>
                {isVibeAdmin ? (
                  <div className="flex gap-2">
                    <Input
                      defaultValue={invoice?.tracking_carrier || ''}
                      placeholder="Carrier"
                      className="w-40"
                      onBlur={async (e) => {
                        const val = e.target.value.trim() || null;
                        if (val === (invoice?.tracking_carrier || null)) return;
                        const trackingUrl = invoice?.tracking_number ? getTrackingUrl(val || '', invoice.tracking_number) : null;
                        const { error } = await supabase
                          .from('invoices')
                          .update({ tracking_carrier: val, tracking_url: trackingUrl })
                          .eq('id', invoice.id);
                        if (error) {
                          toast({ title: "Error", description: "Failed to update carrier", variant: "destructive" });
                        } else {
                          setInvoice({ ...invoice, tracking_carrier: val, tracking_url: trackingUrl });
                        }
                      }}
                    />
                    <Input
                      defaultValue={invoice?.tracking_number || ''}
                      placeholder="Tracking #"
                      onBlur={async (e) => {
                        const val = e.target.value || null;
                        if (val === (invoice?.tracking_number || null)) return;
                        const trackingUrl = val ? getTrackingUrl(invoice?.tracking_carrier || '', val) : null;
                        const { error } = await supabase
                          .from('invoices')
                          .update({ tracking_number: val, tracking_url: trackingUrl })
                          .eq('id', invoice.id);
                        if (error) {
                          toast({ title: "Error", description: "Failed to update tracking", variant: "destructive" });
                        } else {
                          setInvoice({ ...invoice, tracking_number: val, tracking_url: trackingUrl });
                          toast({ title: "Tracking updated" });
                        }
                      }}
                      className="flex-1"
                    />
                  </div>
                ) : (
                  invoice?.tracking_number ? (
                    <a
                      href={invoice.tracking_url || getTrackingUrl(invoice.tracking_carrier || '', invoice.tracking_number)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {CARRIERS.find(c => c.value === invoice.tracking_carrier)?.label || invoice.tracking_carrier} — {invoice.tracking_number}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )
                )}
              </div>
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
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <h2 className="text-lg font-semibold">
                Order Items
                {invoice?.invoice_type === 'partial' && <span className="ml-2 text-sm font-normal text-muted-foreground">
                    (Items in this shipment only)
                  </span>}
                {isEditMode && <span className="ml-2 text-sm font-normal text-muted-foreground">
                    (Editing Mode - Adjust quantities and prices as needed)
                  </span>}
              </h2>
              {isEditMode && isVibeAdmin && (
                <div className="flex items-center gap-2">
                  <input
                    ref={aiFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleAiAnalyzeShipped}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={aiAnalyzing}
                    onClick={() => aiFileInputRef.current?.click()}
                  >
                    {aiAnalyzing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" />AI Analyze Excel</>
                    )}
                  </Button>
                </div>
              )}
            </div>

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
                const shippedRaw = isEditMode && editedItem
                  ? editedItem.shipped_quantity
                  : (invoice?.invoice_type === 'partial' ? item.quantity : orderItem?.shipped_quantity);
                const isShippedPlaceholder = shippedRaw === null || shippedRaw === undefined;
                const shippedQty = Number(shippedRaw ?? 0);
                
                
                const isNewLine = typeof item.id === 'string' && item.id.startsWith('new-');
                const showRowDelete = isEditMode && isVibeAdmin && invoice?.invoice_type === 'full';
                return <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">
                        {isEditMode ? (
                          <Input
                            value={item.sku || item.item_id || ''}
                            onChange={e => setEditedItems(items => items.map(i => i.id === item.id ? { ...i, sku: e.target.value, item_id: e.target.value } : i))}
                            placeholder="SKU"
                            className="h-8 w-32 font-mono text-xs"
                          />
                        ) : (item.sku || item.item_id || '-')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {isEditMode ? (
                          <Popover open={openCombobox[`inv-item-${item.id}`]} onOpenChange={(open) => setOpenCombobox(prev => ({ ...prev, [`inv-item-${item.id}`]: open }))}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-between text-left font-medium h-auto py-1.5 px-2">
                                <span className="truncate text-sm">{item.name || 'Pick product / type name…'}</span>
                                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[350px] p-0" align="start">
                              <Command>
                                <CommandInput
                                  placeholder="Search products or type custom name…"
                                  onValueChange={(val) => setEditedItems(items => items.map(i => i.id === item.id ? { ...i, _typedName: val } : i))}
                                />
                                <CommandList>
                                  <CommandEmpty>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditedItems(items => items.map(i => i.id === item.id ? { ...i, name: (i._typedName || '').trim() || i.name, product_id: null } : i));
                                        setOpenCombobox(prev => ({ ...prev, [`inv-item-${item.id}`]: false }));
                                      }}
                                    >
                                      Use custom name
                                    </Button>
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {products.map((product) => (
                                      <CommandItem
                                        key={product.id}
                                        value={`${product.name} ${product.item_id || ''}`}
                                        onSelect={() => {
                                          setEditedItems(items => items.map(i => 
                                            i.id === item.id ? {
                                              ...i,
                                              product_id: product.id,
                                              sku: product.item_id || product.id.slice(0, 8),
                                              item_id: product.item_id || null,
                                              name: product.name,
                                              description: product.description || '',
                                            } : i
                                          ));
                                          setOpenCombobox(prev => ({ ...prev, [`inv-item-${item.id}`]: false }));
                                        }}
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", item.product_id === product.id ? "opacity-100" : "opacity-0")} />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm truncate">{product.name}</p>
                                          {product.item_id && <p className="text-xs text-muted-foreground">{product.item_id}</p>}
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          item.name
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {isEditMode ? (
                          <Input
                            value={item.description || ''}
                            onChange={e => setEditedItems(items => items.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
                            placeholder="Description"
                            className="h-8 text-sm"
                          />
                        ) : isVibeAdmin ? (
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
                            {isEditMode && isNewLine ? (
                              <Input type="number" min="0" value={item.quantity || 0} onChange={e => handleQuantityChange(item.id, parseInt(e.target.value) || 0)} className="w-24 text-center" />
                            ) : orderedQty}
                          </TableCell>
                          <TableCell className="text-center">
                            {isEditMode ? (
                              <Input type="number" min="0" value={isShippedPlaceholder ? '' : shippedQty} placeholder="0" onChange={e => handleQuantityChange(item.id, parseInt(e.target.value) || 0)} className={`w-24 text-center ${isShippedPlaceholder ? 'text-muted-foreground/50 italic' : ''}`} title={isShippedPlaceholder ? 'Placeholder — not yet shipped. Type 0 to intentionally record no shipment.' : ''} />
                            ) : isShippedPlaceholder ? (
                              <span className="inline-flex items-center gap-1 text-muted-foreground/50 italic" title="Placeholder — not yet shipped. Click Quick Ship to record actual qty.">0</span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                {shippedQty}
                                {isVibeAdmin && orderItem && shippedQty === 0 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 text-muted-foreground hover:text-foreground"
                                    title="Revert to placeholder (not yet shipped)"
                                    onClick={async () => {
                                      const { error } = await supabase.from('order_items').update({ shipped_quantity: null }).eq('id', orderItem.id);
                                      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
                                      toast({ title: 'Reverted to placeholder', description: `${item.sku} shipped qty cleared.` });
                                      fetchInvoiceDetails();
                                    }}
                                  >
                                    <RotateCcw className="h-2.5 w-2.5" />
                                  </Button>
                                )}
                              </span>
                            )}
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
                        <div className="flex items-center justify-end gap-2">
                          <span>
                            {(() => {
                              const price = Number(item.unit_price) || 0;
                              if (invoice?.invoice_type !== 'full') {
                                return formatCurrency(shippedQty * price);
                              }
                              return formatCurrency((isShippedPlaceholder ? (Number(item.quantity) || 0) : shippedQty) * price);
                            })()}
                          </span>

                          {showRowDelete && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveInvoiceLineItem(item.id)}
                              title="Remove line"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>;
              })}
              {isEditMode && isVibeAdmin && invoice?.invoice_type === 'full' && (
                <TableRow>
                  <TableCell colSpan={invoice?.invoice_type === 'full' ? 7 : 6}>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddInvoiceLineItem}>
                      <Plus className="h-4 w-4 mr-1.5" /> Add Line Item
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              </TableBody>
            </Table>

            {/* Billing Breakdown - Only for child invoices (deposits and shipments) */}

            {/* Invoice Totals */}
            {(() => {
              // Child invoices always show their OWN numbers (subtotal, shipping, total).
              // Blanket-level payments appear as a prorated credit line — computed by
              // src/lib/invoiceBalance.ts, the same math as the PDF and list downloads,
              // so this page and the customer's PDF can never disagree.
              const isPartialChild = invoice && invoice.invoice_type !== 'full' && invoice.parent_invoice_id;
              const parentBlanket = isPartialChild
                ? relatedInvoices.find((ri: any) => ri.id === invoice.parent_invoice_id && ri.invoice_type === 'full')
                : null;
              const allBlanketChildren = isPartialChild
                ? [invoice, ...relatedInvoices.filter(
                    (ri: any) => ri.id !== invoice.id && ri.parent_invoice_id === invoice.parent_invoice_id
                  )]
                : [];
              const pageCredit = computeChildCredit(invoice, parentBlanket, allBlanketChildren, {
                blanketValue: Number(parentBlanket?.total || 0),
              });

              const depositLabel = pageCredit.label || 'Less Blanket Payments';
              const mirroredSubtotal = displaySubtotal;
              const mirroredShipping = Number(invoice?.shipping_cost || 0) + childShippingTotal;
              const depositCredit = pageCredit.amount;
              const showDepositCredit = depositCredit > 0.005;
              const mirroredBalance = displayBilledTotal - displayTotalPaid - depositCredit;
              const showBalanceRow = showDepositCredit || displayTotalPaid > 0;

              return (
            <div className="flex justify-end mt-8">
              <div className="space-y-2 w-80">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{formatCurrency(mirroredSubtotal)}</span>
                </div>
                {/* Shipping Line - editable for vibe admins */}
                {(mirroredShipping > 0 || (isVibeAdmin && isEditMode)) ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm items-center gap-2">
                      <span className="text-muted-foreground">Shipping{childShippingTotal > 0 && isBlanketDisplay ? ' (from shipments)' : ''}</span>
                      {isVibeAdmin && isEditMode ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editShippingCost}
                          onChange={(e) => setEditShippingCost(e.target.value)}
                          className="w-28 text-right h-8"
                          placeholder="0.00"
                        />
                      ) : (
                        <span className="font-semibold">{formatCurrency(mirroredShipping)}</span>
                      )}
                    </div>
                    {isVibeAdmin && isEditMode ? (
                      <Input
                        value={editShippingNote}
                        onChange={(e) => setEditShippingNote(e.target.value)}
                        className="text-xs h-7"
                        placeholder="Shipping note/description…"
                      />
                    ) : invoice?.shipping_note ? (
                      <p className="text-xs text-muted-foreground pl-1">{invoice.shipping_note}</p>
                    ) : null}
                  </div>
                ) : isVibeAdmin ? (
                  <button
                    onClick={() => { setIsEditMode(true); setEditShippingCost('0'); setEditShippingNote(''); }}
                    className="text-xs text-primary hover:underline cursor-pointer"
                  >
                    + Add Shipping Line
                  </button>
                ) : null}
                {isDepositBilling && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground font-medium">Deposit ({billedPct}%)</span>
                    <span className="font-semibold">{formatCurrency(displayBilledTotal)}</span>
                  </div>
                )}
                {showDepositCredit && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {depositLabel}
                    </span>
                    <span className="font-semibold text-green-600">({formatCurrency(depositCredit)})</span>
                  </div>
                )}
                {displayTotalPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Less Payments</span>
                    <span className="font-semibold text-green-600">({formatCurrency(displayTotalPaid)})</span>
                  </div>
                )}
                <div className="h-px bg-border my-2"></div>
                <div className="flex justify-between">
                  <span className="text-lg font-semibold">{showBalanceRow ? 'Balance Due' : (isDepositBilling ? 'Deposit Due' : 'Total')}</span>
                  <span className="text-2xl font-bold">{formatCurrency(showBalanceRow ? mirroredBalance : displayBilledTotal)}</span>
                </div>
                {isEditMode && <p className="text-xs text-muted-foreground italic mt-2">
                    Totals will be saved when you click "Save Changes"
                  </p>}
              </div>
            </div>
              );
            })()}
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
                    <p className="text-lg font-semibold">{formatCurrency(Number(invoice.total || 0) + childShippingTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Shipped Invoiced</p>
                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(
                        (order?.order_items?.reduce((sum: number, item: any) =>
                          sum + (Number(item.shipped_quantity || 0) * Number(item.unit_price || 0)), 0) || 0)
                        + childShippingTotal
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
                    <TableCell className="text-sm text-muted-foreground max-w-xs">
                      {payment.notes ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-left truncate max-w-[200px] block hover:text-foreground transition-colors cursor-pointer underline decoration-dotted underline-offset-2">
                              {payment.notes}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">Payment Notes</p>
                              <p className="text-sm whitespace-pre-wrap">{payment.notes}</p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : '-'}
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
                {shipmentInvoicesForBlanket.length > 0 && (() => {
                  const totalBilled = shipmentInvoicesForBlanket.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
                  const billingProgress = order ? (totalBilled / Number(order.total)) * 100 : 0;
                  return (
                    <p className="text-sm text-muted-foreground mt-1">
                      {shipmentInvoicesForBlanket.length} shipment invoice(s) • {formatCurrency(totalBilled)} billed ({billingProgress.toFixed(1)}% of order total)
                    </p>
                  );
                })()}
              </div>
              <Button onClick={() => setShowShipmentDialog(true)} size="sm">
                <Package className="h-4 w-4 mr-2" />
                Create Shipment Invoice
              </Button>
            </div>

            {shipmentInvoicesForBlanket.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shipment invoices created yet. Create your first one to start billing partial shipments.</p>
            ) : (
              <div className="space-y-3">
                {shipmentInvoicesForBlanket.map((relInvoice: any, idx: number) => (
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
                          {idx < shipmentInvoicesForBlanket.length - 1 && (
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
            
            <div className="space-y-4">
              {vendorPOs.map(po => {
                const poItems = po.vendor_po_items || [];
                const shippedTotal = poItems.reduce((sum: number, item: any) => sum + ((item.shipped_quantity || 0) * (item.final_unit_cost || item.unit_cost || 0)), 0);
                const orderedTotal = Number(po.total || 0);
                return (
                  <Card key={po.id} className="border hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <h3 className="font-semibold">{po.vendors?.name || 'Unknown Vendor'}</h3>
                            <p className="text-xs text-muted-foreground">PO: {po.po_number}</p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">
                            {po.status.replace('_', ' ')}
                          </span>
                          {po.expected_delivery_date && (
                            <span className="text-xs text-muted-foreground">
                              Delivery: {new Date(po.expected_delivery_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Shipped / Ordered</p>
                            <p className="text-sm font-bold">
                              {formatCurrency(shippedTotal)} / {formatCurrency(orderedTotal)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/vendor-pos/${po.id}?returnTo=/invoices/${invoiceId}`)}>
                              <FileText className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Tracking Info - Inline Editable */}
                      <div className="mb-3 px-1">
                        <InlineTrackingEditor
                          vendorPoId={po.id}
                          trackingCarrier={po.tracking_carrier}
                          trackingNumber={po.tracking_number}
                          onUpdated={fetchInvoiceDetails}
                          compact
                        />
                      </div>
                      
                      {/* Inline items table */}
                      {poItems.length > 0 && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Item</TableHead>
                              <TableHead className="text-xs">SKU</TableHead>
                              <TableHead className="text-xs text-right">Ordered</TableHead>
                              <TableHead className="text-xs text-right">Shipped</TableHead>
                              <TableHead className="text-xs text-right">Unit Cost</TableHead>
                              <TableHead className="text-xs text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {poItems.map((item: any) => {
                              const shipped = item.shipped_quantity || 0;
                              const unitCost = item.final_unit_cost || item.unit_cost || 0;
                              const itemTotal = shipped > 0 ? shipped * unitCost : item.quantity * unitCost;
                              return (
                                <TableRow key={item.id} className="text-xs">
                                  <TableCell className="font-medium py-2">{item.name}</TableCell>
                                  <TableCell className="font-mono text-muted-foreground py-2">{item.sku}</TableCell>
                                  <TableCell className="text-right py-2">{item.quantity?.toLocaleString()}</TableCell>
                                  <TableCell className={cn("text-right py-2 font-medium", shipped > 0 ? "text-success" : "text-muted-foreground")}>
                                    {shipped > 0 ? shipped.toLocaleString() : '—'}
                                  </TableCell>
                                  <TableCell className="text-right py-2">{formatUnitPrice(unitCost)}</TableCell>
                                  <TableCell className="text-right py-2 font-medium">{formatCurrency(itemTotal)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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

      {/* Packing Lists Section - Show on all invoices for admin management */}
      {invoice && order && (
        <InvoicePackingListSection
          invoiceId={invoiceId!}
          invoice={invoice}
          order={order}
          editedItems={editedItems}
          isVibeAdmin={isVibeAdmin}
          onRefresh={fetchInvoiceDetails}
        />
      )}

      {/* Art files for this invoice's products (matched by SKU, like the order page) */}
      {order && <InvoiceArtworkSection orderItems={order.order_items || []} />}


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
      <Dialog open={showQuickShipDialog} onOpenChange={setShowQuickShipDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Set Shipped Quantities</DialogTitle>
            <DialogDescription>
              Quickly enter shipped quantity for each line item. The blanket total will be recalculated as Î£(shipped Ã— price) + child shipping.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
            {(order?.order_items || []).map((oi: any) => (
              <div key={oi.id} className="grid grid-cols-[1fr_auto_120px] items-center gap-3 border-b pb-2">
                <div>
                  <p className="text-sm font-medium">{oi.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{oi.sku}</p>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  Ordered: {Number(oi.quantity || 0).toLocaleString()}<br />
                  @ {formatUnitPrice(Number(oi.unit_price || 0))}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Shipped</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={quickShipQtys[oi.id] ?? ''}
                    onChange={(e) => setQuickShipQtys((prev) => ({ ...prev, [oi.id]: e.target.value }))}
                    className={(quickShipQtys[oi.id] ?? '') === '' ? 'text-muted-foreground/50 italic' : ''}
                    title={(quickShipQtys[oi.id] ?? '') === '' ? 'Placeholder — leave blank until shipped, or type 0 to intentionally record no shipment' : ''}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center text-sm border-t pt-3">
            <span className="text-muted-foreground">New subtotal preview:</span>
            <span className="font-semibold">
              {formatCurrency(
                (order?.order_items || []).reduce((sum: number, oi: any) => {
                  const raw = quickShipQtys[oi.id];
                  const qty = raw !== undefined && raw !== '' ? Number(raw) : Number(oi.shipped_quantity || 0);
                  return sum + (isFinite(qty) ? qty : 0) * Number(oi.unit_price || 0);
                }, 0)
              )}
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickShipDialog(false)} disabled={savingQuickShip}>Cancel</Button>
            <Button onClick={handleSaveQuickShip} disabled={savingQuickShip}>
              {savingQuickShip ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save & Update Total'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <EditInvoiceAddressesDialog
        open={editAddressesOpen}
        onOpenChange={setEditAddressesOpen}
        invoice={invoice}
        order={order}
        onSaved={(updated) => setInvoice(updated)}
      />
    </div>;
};
export default InvoiceDetail;
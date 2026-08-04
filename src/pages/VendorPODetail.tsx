import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Edit, Save, X, Plus, Send, DollarSign, Trash2, FileCheck, Paperclip, Upload, FileText, ExternalLink, Package, Banknote } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { VIBE_COMPANY } from "@/lib/pdfBranding";
import { EmailPreviewDialog, AdditionalAttachment, ArtworkFile } from "@/components/EmailPreviewDialog";
import { RecordVendorPOPaymentDialog } from "@/components/RecordVendorPOPaymentDialog";
import { UpdateBillDialog } from "@/components/UpdateBillDialog";
import { VendorPOPackingListSection } from "@/components/VendorPOPackingListSection";
import { getTrackingUrl, CARRIERS } from "@/lib/trackingUtils";
import { InlineTrackingEditor } from "@/components/InlineTrackingEditor";
import { normalizeStorageObjectPath, openStorageObjectInNewTab } from "@/lib/storageUrl";
import VendorProductionPanel from "@/components/vendor/VendorProductionPanel";

const VendorPODetail = () => {
  const { poId } = useParams();
  const navigate = useNavigate();
  
  // Get returnTo parameter from URL to navigate back properly
  const searchParams = new URLSearchParams(window.location.search);
  const returnTo = searchParams.get('returnTo') || '/vendor-pos';
  const autoSend = searchParams.get('send') === 'true';
  const [po, setPO] = useState<any>(null);
  const [poItems, setPOItems] = useState<any[]>([]);
  const [poPayments, setPOPayments] = useState<any[]>([]);
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedPO, setEditedPO] = useState<any>({});
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [artworkFiles, setArtworkFiles] = useState<ArtworkFile[]>([]);
  const [loadingArtwork, setLoadingArtwork] = useState(false);

  // Coming from Vendor Status, lead with exactly what the vendor sees; the
  // standard admin PO content follows below.
  const vendorViewFirst = returnTo === '/vendor-status';

  useEffect(() => {
    checkAdminStatus();
  }, []);

  useEffect(() => {
    // Only fetch data if user is confirmed as admin
    if (isAdmin === true && poId) {
      fetchPODetails();
    } else if (isAdmin === false) {
      // Redirect non-admins to dashboard
      navigate('/dashboard');
    }
  }, [isAdmin, poId]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      const roles = (data || []).map((r: any) => String(r.role));
      setIsAdmin(roles.includes('admin') || roles.includes('vibe_admin') || roles.includes('finance'));
    } else {
      setIsAdmin(false);
    }
  };

  const fetchPODetails = async () => {
    setLoading(true);
    
    // Fetch PO
    const { data: poData, error: poError } = await supabase
      .from('vendor_pos')
      .select('*, orders(order_number, customer_name)')
      .eq('id', poId)
      .single();

    if (poError || !poData) {
      toast({
        title: "Error",
        description: "Failed to load vendor PO",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    setPO(poData);
    setEditedPO(poData);

    // Fetch vendor
    const { data: vendorData } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', poData.vendor_id)
      .single();

    if (vendorData) {
      setVendor(vendorData);
    }

    // Fetch PO items
    const { data: itemsData } = await supabase
      .from('vendor_po_items')
      .select('*')
      .eq('vendor_po_id', poId)
      .order('created_at', { ascending: true });

    if (itemsData) {
      // Recalculate totals based on effective quantity (shipped if > 0, otherwise ordered)
      const recalculated = itemsData.map((item: any) => {
        const effectiveQty = Number(item.shipped_quantity) > 0 ? Number(item.shipped_quantity) : Number(item.quantity);
        return {
          ...item,
          total: Math.round(effectiveQty * Number(item.unit_cost) * 100) / 100,
        };
      });
      setPOItems(recalculated);
    }

    // Fetch PO payments
    const { data: paymentsData } = await supabase
      .from('vendor_po_payments')
      .select('*')
      .eq('vendor_po_id', poId)
      .order('payment_date', { ascending: false });

    if (paymentsData) {
      setPOPayments(paymentsData);
    }

    setLoading(false);
  };

  const handleSavePO = async () => {
    if (!isAdmin) return;

    try {
      // Delete removed items first
      for (const delId of deletedItemIds) {
        const { error: delErr } = await supabase
          .from('vendor_po_items')
          .delete()
          .eq('id', delId);
        if (delErr) {
          console.error('Delete error:', delErr);
          throw new Error(`Failed to delete line: ${delErr.message}`);
        }
      }

      // Update existing items with edited quantities and costs
      for (const item of poItems) {
        if (!item.isNew) {
          // Use shipped_quantity if available, otherwise fall back to ordered quantity
          const effectiveQty = Number(item.shipped_quantity) > 0 ? Number(item.shipped_quantity) : Number(item.quantity);
          // Round to 2 decimal places to avoid floating point precision issues
          const newTotal = Math.round(effectiveQty * Number(item.unit_cost) * 100) / 100;
          const isCustom = !item.order_item_id;

          const updatePayload: any = {
            quantity: item.quantity,
            shipped_quantity: item.shipped_quantity,
            unit_cost: item.unit_cost,
            total: newTotal,
          };
          // Only allow editing name/description on custom lines (not linked to order items)
          if (isCustom) {
            updatePayload.sku = item.sku;
            updatePayload.name = item.name;
            updatePayload.description = item.description ?? null;
          }

          const { error: updateError } = await supabase
            .from('vendor_po_items')
            .update(updatePayload)
            .eq('id', item.id);

          if (updateError) {
            console.error('Update error:', updateError);
            throw new Error(`Failed to update item: ${updateError.message}`);
          }
        } else {
          // Insert new custom line items
          if (!item.sku || !item.name || item.quantity <= 0) {
            throw new Error('Please fill in all required fields for custom line items');
          }

          const { error: insertError } = await supabase
            .from('vendor_po_items')
            .insert({
              vendor_po_id: poId,
              order_item_id: null,
              sku: item.sku,
              name: item.name,
              description: item.description || null,
              quantity: item.quantity,
              shipped_quantity: null,
              unit_cost: item.unit_cost,
              total: item.total
            } as any);

          if (insertError) {
            console.error('Insert error:', insertError);
            throw new Error(`Failed to add custom line item: ${insertError.message}`);
          }
        }
      }

      // Calculate new total from all items - round to 2 decimal places
      const itemsTotal = Math.round(poItems.reduce((sum, item) => sum + Number(item.total), 0) * 100) / 100;
      const shippingCost = Number(editedPO.shipping_cost) || 0;
      const newTotal = Math.round((itemsTotal + shippingCost) * 100) / 100;

      // Update the PO
      const { error: poError } = await supabase
        .from('vendor_pos')
        .update({
          status: editedPO.status,
          expected_delivery_date: editedPO.expected_delivery_date,
          ship_to_name: editedPO.ship_to_name,
          ship_to_street: editedPO.ship_to_street,
          ship_to_city: editedPO.ship_to_city,
          ship_to_state: editedPO.ship_to_state,
          ship_to_zip: editedPO.ship_to_zip,
          tracking_carrier: editedPO.tracking_carrier || null,
          tracking_number: editedPO.tracking_number || null,
          tracking_url: editedPO.tracking_url || null,
          shipping_cost: shippingCost,
          total: newTotal
        })
        .eq('id', poId);

      if (poError) throw poError;

      toast({
        title: "PO Updated",
        description: "Purchase order updated successfully"
      });
      setIsEditMode(false);
      setDeletedItemIds([]);
      fetchPODetails();
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update purchase order",
        variant: "destructive"
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !po) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB",
        variant: "destructive"
      });
      return;
    }

    try {
      setUploadingFile(true);
      
      // Create a unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${po.id}/${Date.now()}.${fileExt}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('po-documents')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get the public URL
      // Update vendor PO with attachment info
      const { error: updateError } = await supabase
        .from('vendor_pos')
        .update({
          attachment_url: normalizeStorageObjectPath(fileName, 'po-documents'),
          attachment_name: file.name
        })
        .eq('id', po.id);

      if (updateError) throw updateError;

      toast({
        title: "File Uploaded",
        description: `${file.name} attached successfully`
      });

      fetchPODetails();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file",
        variant: "destructive"
      });
    } finally {
      setUploadingFile(false);
      // Reset the input
      event.target.value = '';
    }
  };

  const handleRemoveAttachment = async () => {
    if (!po?.attachment_url) return;

    try {
      // Extract file path from URL
      const normalizedPath = normalizeStorageObjectPath(po.attachment_url, 'po-documents');
      if (normalizedPath) {
        await supabase.storage
          .from('po-documents')
          .remove([normalizedPath]);
      }

      // Clear attachment from vendor PO
      await supabase
        .from('vendor_pos')
        .update({
          attachment_url: null,
          attachment_name: null
        })
        .eq('id', po.id);

      toast({
        title: "Attachment Removed",
        description: "File has been removed"
      });

      fetchPODetails();
    } catch (error: any) {
      console.error('Remove error:', error);
      toast({
        title: "Error",
        description: "Failed to remove attachment",
        variant: "destructive"
      });
    }
  };

  const fetchCaseStickerInfo = async (): Promise<Array<{ orderNumber?: string; invoiceNumber?: string; customerPO?: string }>> => {
    if (!po) return [];
    const orderIdSet = new Set<string>();
    if (po.order_id) orderIdSet.add(po.order_id);
    const itemOrderItemIds = poItems.map((i: any) => i.order_item_id).filter(Boolean);
    if (itemOrderItemIds.length > 0) {
      const { data: oiRows } = await supabase
        .from('order_items')
        .select('order_id')
        .in('id', itemOrderItemIds);
      (oiRows || []).forEach((r: any) => r.order_id && orderIdSet.add(r.order_id));
    }
    if (orderIdSet.size === 0) return [];
    const orderIds = Array.from(orderIdSet);
    const [{ data: invoices }, { data: orderRows }] = await Promise.all([
      supabase
        .from('invoices')
        .select('invoice_number, customer_po_number, order_id, orders(order_number, po_number)')
        .in('order_id', orderIds)
        .is('deleted_at', null)
        .neq('invoice_type', 'deposit')
        .order('invoice_number'),
      supabase
        .from('orders')
        .select('id, order_number, po_number')
        .in('id', orderIds),
    ]);
    const orderMap = new Map<string, any>((orderRows || []).map((o: any) => [o.id, o]));
    const seen = new Set<string>();
    const entries: Array<{ orderNumber?: string; invoiceNumber?: string; customerPO?: string }> = [];
    const ordersWithInvoice = new Set<string>();
    (invoices || []).forEach((inv: any) => {
      const key = `${inv.invoice_number}-${inv.order_id}`;
      if (seen.has(key)) return;
      seen.add(key);
      ordersWithInvoice.add(inv.order_id);
      entries.push({
        orderNumber: inv.orders?.order_number,
        invoiceNumber: inv.invoice_number,
        customerPO: inv.customer_po_number || inv.orders?.po_number || undefined,
      });
    });
    // Fallback: include any order that has no invoice yet so the CPO still prints
    orderIds.forEach((oid) => {
      if (ordersWithInvoice.has(oid)) return;
      const o = orderMap.get(oid);
      if (!o) return;
      entries.push({
        orderNumber: o.order_number,
        invoiceNumber: undefined,
        customerPO: o.po_number || undefined,
      });
    });
    return entries;
  };

  const drawCaseStickerCallout = (
    doc: jsPDF,
    startY: number,
    pageWidth: number,
    info: Array<{ orderNumber?: string; invoiceNumber?: string; customerPO?: string }>
  ): number => {
    if (!info || info.length === 0) return startY;
    const boxX = 14;
    const boxW = pageWidth - 28;
    const lineHeight = 5;
    const padding = 4;
    const boxH = 14 + info.length * lineHeight + padding;

    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.4);
    doc.roundedRect(boxX, startY, boxW, boxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(146, 64, 14);
    doc.text('REQUIRED ON CASE STICKERS', boxX + padding, startY + padding + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text('Each case label must include the Vibe Invoice # and Customer PO # below:', boxX + padding, startY + padding + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    let y = startY + padding + 14;
    info.forEach((row) => {
      const parts: string[] = [];
      if (row.orderNumber) parts.push(`Order #${row.orderNumber}`);
      if (row.invoiceNumber) parts.push(`Inv # ${row.invoiceNumber}`);
      if (row.customerPO) parts.push(`PO ${row.customerPO}`);
      doc.text('• ' + parts.join('   |   '), boxX + padding, y);
      y += lineHeight;
    });

    return startY + boxH + 6;
  };

  const handleDownloadPDF = async () => {
    if (!po || !vendor) return;

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
    doc.text(vendor.name, leftColX, yPos + 8);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    let vendorY = yPos + 14;
    if (vendor.contact_name) {
      doc.text(vendor.contact_name, leftColX, vendorY);
      vendorY += 5;
    }
    if (vendor.contact_email) {
      doc.text(vendor.contact_email, leftColX, vendorY);
      vendorY += 5;
    }
    if (vendor.contact_phone) {
      doc.text(vendor.contact_phone, leftColX, vendorY);
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
    
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Order #:', rightColX, detailsStartY + 21);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(po.orders?.order_number || 'N/A', rightColX + 45, detailsStartY + 21);
    
    yPos += 40;
    
    // Ship To section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Ship To', leftColX, yPos);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    
    let shipY = yPos + 7;
    if (po.ship_to_name) {
      doc.setFont('helvetica', 'bold');
      doc.text(po.ship_to_name, leftColX, shipY);
      doc.setFont('helvetica', 'normal');
      shipY += 5;
    }
    if (po.ship_to_street) {
      doc.text(po.ship_to_street, leftColX, shipY);
      shipY += 5;
    }
    const cityStateZip = [po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(', ');
    if (cityStateZip) {
      doc.text(cityStateZip, leftColX, shipY);
    }
    
    yPos += 28;

    // Case sticker callout (Vibe Invoice # + Customer PO #)
    const csInfoDownload = await fetchCaseStickerInfo();
    yPos = drawCaseStickerCallout(doc, yPos, pageWidth, csInfoDownload);

    // ============ ITEMS TABLE ============
    const tableData = poItems.map(item => [
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
    const itemsTotal = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    const shippingCost = Number(po.shipping_cost || 0);
    const totalAmount = itemsTotal + shippingCost;
    
    const totalsWidth = 80;
    const totalsX = pageWidth - totalsWidth - 14;
    
    // Subtotal
    if (shippingCost > 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Subtotal', totalsX, finalY + 4);
      doc.text(`$${itemsTotal.toFixed(2)}`, pageWidth - 14, finalY + 4, { align: 'right' });
      
      doc.text('Shipping', totalsX, finalY + 12);
      doc.text(`$${shippingCost.toFixed(2)}`, pageWidth - 14, finalY + 12, { align: 'right' });
    }
    
    // Divider line before total
    const totalLineY = shippingCost > 0 ? finalY + 16 : finalY;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totalsX, totalLineY, pageWidth - 14, totalLineY);
    
    // Total - emphasized
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('TOTAL', totalsX, totalLineY + 8);
    doc.text(`$${totalAmount.toFixed(2)}`, pageWidth - 14, totalLineY + 8, { align: 'right' });

    // ============ FOOTER ============
    // Only add footer if there's enough space, otherwise it will overlap with table
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
  };

  const generatePdfBase64 = async (): Promise<string> => {
    if (!po || !vendor) return '';

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
    doc.text(vendor.name, leftColX, yPos + 8);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    let vendorY = yPos + 14;
    if (vendor.contact_name) {
      doc.text(vendor.contact_name, leftColX, vendorY);
      vendorY += 5;
    }
    if (vendor.contact_email) {
      doc.text(vendor.contact_email, leftColX, vendorY);
      vendorY += 5;
    }
    if (vendor.contact_phone) {
      doc.text(vendor.contact_phone, leftColX, vendorY);
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
    
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Order #:', rightColX, detailsStartY + 21);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(po.orders?.order_number || 'N/A', rightColX + 45, detailsStartY + 21);
    
    yPos += 40;
    
    // Ship To section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Ship To', leftColX, yPos);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    
    let shipY = yPos + 7;
    if (po.ship_to_name) {
      doc.setFont('helvetica', 'bold');
      doc.text(po.ship_to_name, leftColX, shipY);
      doc.setFont('helvetica', 'normal');
      shipY += 5;
    }
    if (po.ship_to_street) {
      doc.text(po.ship_to_street, leftColX, shipY);
      shipY += 5;
    }
    const cityStateZip = [po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(', ');
    if (cityStateZip) {
      doc.text(cityStateZip, leftColX, shipY);
    }
    
    yPos += 28;

    // Case sticker callout (Vibe Invoice # + Customer PO #)
    const csInfoEmail = await fetchCaseStickerInfo();
    yPos = drawCaseStickerCallout(doc, yPos, pageWidth, csInfoEmail);

    // ============ ITEMS TABLE ============
    const tableData = poItems.map(item => [
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
    const itemsTotal = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    const shippingCost = Number(po.shipping_cost || 0);
    const totalAmount = itemsTotal + shippingCost;
    
    const totalsWidth = 80;
    const totalsX = pageWidth - totalsWidth - 14;
    
    if (shippingCost > 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Subtotal', totalsX, finalY + 4);
      doc.text(`$${itemsTotal.toFixed(2)}`, pageWidth - 14, finalY + 4, { align: 'right' });
      
      doc.text('Shipping', totalsX, finalY + 12);
      doc.text(`$${shippingCost.toFixed(2)}`, pageWidth - 14, finalY + 12, { align: 'right' });
    }
    
    const totalLineY = shippingCost > 0 ? finalY + 16 : finalY;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totalsX, totalLineY, pageWidth - 14, totalLineY);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('TOTAL', totalsX, totalLineY + 8);
    doc.text(`$${totalAmount.toFixed(2)}`, pageWidth - 14, totalLineY + 8, { align: 'right' });

    // ============ FOOTER ============
    const footerY = Math.max(finalY + 30, pageHeight - 20);
    if (footerY < pageHeight - 10) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
    }

    return doc.output('datauristring').split(',')[1];
  };

  const handleSendEmail = async (data: { to: string[]; subject: string; message: string; additionalAttachments?: AdditionalAttachment[] }) => {
    setSendingEmail(true);
    try {
      const pdfBase64 = await generatePdfBase64();

      // Build additional attachments array
      const additionalAttachmentsData = data.additionalAttachments?.map(a => ({
        filename: a.file.name,
        content: a.base64,
      }));
      
      const itemsTotal = poItems.reduce((sum, item) => sum + Number(item.total), 0);
      const totalAmount = itemsTotal + Number(po.shipping_cost || 0);

      const caseStickerInfo = await fetchCaseStickerInfo();
      
      const response = await supabase.functions.invoke('send-vendor-po-email', {
        body: {
          poId: poId,
          recipientEmails: data.to,
          senderName: VIBE_COMPANY.name,
          senderEmail: 'accounting@vibepkg.com',
          customMessage: data.message,
          pdfBase64,
          pdfFilename: `PO-${po.po_number}.pdf`,
          poNumber: po.po_number,
          orderDate: po.order_date,
          expectedDeliveryDate: po.expected_delivery_date,
          totalAmount: totalAmount,
          vendorName: vendor?.contact_name || vendor?.name || 'Vendor',
          additionalAttachments: additionalAttachmentsData && additionalAttachmentsData.length > 0 ? additionalAttachmentsData : undefined,
          caseStickerInfo: caseStickerInfo.length > 0 ? caseStickerInfo : undefined,
        }
      });

      if (response.error) throw response.error;

      // Update PO status to sent
      await supabase
        .from('vendor_pos')
        .update({ status: 'sent' })
        .eq('id', poId);

      toast({
        title: "PO Sent",
        description: `Purchase order sent to ${data.to.join(', ')}`
      });

      setShowEmailPreview(false);
      fetchPODetails();
    } catch (error: any) {
      console.error('Send error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive"
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const getDefaultEmailMessage = () => {
    const itemsTotal = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    const totalAmount = itemsTotal + Number(po.shipping_cost || 0);
    return `Dear ${vendor.contact_name || vendor.name},

Please find attached the purchase order from ${VIBE_COMPANY.name}.

PO Number: ${po.po_number}
Order Date: ${new Date(po.order_date).toLocaleDateString()}
Total Amount: $${totalAmount.toFixed(2)}

Please confirm receipt of this order and provide an estimated delivery date.

IMPORTANT: Each case sticker must include the Vibe Invoice # and Customer PO # shown on the attached PO. These references are required for our customer to receive the shipment.

Thank you for your business.`;
  };

  // Fetch artwork files for all SKUs in this PO
  const fetchArtworkFiles = async () => {
    if (poItems.length === 0) return;
    
    setLoadingArtwork(true);
    try {
      // Get unique SKUs from PO items
      const skus = [...new Set(poItems.map(item => item.sku).filter(Boolean))];
      
      if (skus.length === 0) {
        setArtworkFiles([]);
        return;
      }
      
      const { data, error } = await supabase
        .from('artwork_files')
        .select('id, sku, filename, artwork_url, artwork_type, is_approved')
        .in('sku', skus)
        .order('sku')
        .order('is_approved', { ascending: false });
      
      if (error) {
        console.error('Error fetching artwork:', error);
        setArtworkFiles([]);
        return;
      }
      
      setArtworkFiles(data || []);
    } catch (error) {
      console.error('Error fetching artwork files:', error);
      setArtworkFiles([]);
    } finally {
      setLoadingArtwork(false);
    }
  };

  // Fetch artwork when email dialog opens
  const handleOpenEmailDialog = () => {
    setShowEmailPreview(true);
    fetchArtworkFiles();
  };

  // Auto-open send dialog when navigated with ?send=true
  useEffect(() => {
    if (autoSend && po && vendor?.contact_email && !showEmailPreview) {
      setShowEmailPreview(true);
    }
  }, [autoSend, po, vendor]);


  // Show loading while checking admin status or loading PO data
  if (isAdmin === null || loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading vendor PO...</p>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Vendor PO not found</p>
      </div>
    );
  }

  // Subtotal must match the per-line amounts shown in the table:
  // when final qty/cost are in play, the line total is final_quantity * final_unit_cost.
  const displayedItemsTotal = poItems.reduce((sum, item) => {
    const useFinal = po.final_total && item.final_quantity != null && item.final_unit_cost != null;
    return sum + (useFinal
      ? Number(item.final_quantity) * Number(item.final_unit_cost)
      : Number(item.total || 0));
  }, 0);

  const poShippingCost = Number(po.shipping_cost || 0);
  // What the PO was originally cut for (ordered quantities)
  const orderedGrandTotal =
    Math.round((poItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0) + poShippingCost) * 100) / 100;
  // What is actually owed based on shipped/final quantities shown in the table
  const adjustedGrandTotal = Math.round((displayedItemsTotal + poShippingCost) * 100) / 100;
  const effectiveBillTotal = po.final_total != null ? Number(po.final_total) : adjustedGrandTotal;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(returnTo)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {returnTo.startsWith('/projects/') ? 'Back to Project' : 'Back'}
        </Button>
        <div className="flex gap-3">
          {isAdmin && (
            <>
              {isEditMode ? (
                <>
                  <Button variant="outline" onClick={() => {
                    setIsEditMode(false);
                    setEditedPO(po);
                    setDeletedItemIds([]);
                    fetchPODetails();
                  }}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSavePO}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setIsEditMode(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit PO
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setShowFinalizeDialog(true)}>
                <FileCheck className="h-4 w-4 mr-2" />
                Update Bill
              </Button>
              <Button variant="outline" onClick={() => setShowPaymentDialog(true)}>
                <DollarSign className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
              <Button variant="outline" onClick={() => navigate(`/financing?addPO=${po.id}&poNumber=${po.po_number}&poTotal=${effectiveBillTotal}&poDesc=${encodeURIComponent(po.description || '')}`)}>
                <Banknote className="h-4 w-4 mr-2" />
                Send to Finance
              </Button>
            </>
          )}
          {isAdmin && (po.status === 'created' || po.status === 'draft') && (
            <Button
              variant="outline"
              onClick={async () => {
                const { error } = await supabase
                  .from('vendor_pos')
                  .update({ status: 'sent' })
                  .eq('id', poId);
                if (error) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                } else {
                  toast({ title: "Marked as Sent", description: "PO status updated without sending email." });
                  fetchPODetails();
                }
              }}
            >
              <FileCheck className="h-4 w-4 mr-2" />
              Mark as Sent
            </Button>
          )}
          {vendor?.contact_email && (
            <Button onClick={handleOpenEmailDialog}>
              <Send className="h-4 w-4 mr-2" />
              Send to Vendor
            </Button>
          )}
        </div>
      </div>

      {/* From Vendor Status: exactly what the vendor sees, before the admin PO document */}
      {vendorViewFirst && (
        <div className="mb-6">
          <VendorProductionPanel poId={po.id} />
        </div>
      )}

      {/* PO Details Card */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-table-border p-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold mb-2">Vendor PO #{po.po_number}</h1>
                <p className="text-sm text-muted-foreground">
                  Customer Order: {po.orders?.order_number || 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Customer: {po.orders?.customer_name || 'N/A'}
                </p>
                <InlineTrackingEditor
                  vendorPoId={po.id}
                  trackingCarrier={po.tracking_carrier}
                  trackingNumber={po.tracking_number}
                  onUpdated={fetchPODetails}
                />
              </div>
              <div className="text-right">
                {(() => {
                  const getStatusBadge = () => {
                    switch (po.status) {
                      case 'paid':
                        return <Badge className="bg-green-500 text-white">Paid</Badge>;
                      case 'partial':
                        return <Badge variant="default">Partial Paid</Badge>;
                      case 'sent':
                        return <Badge variant="destructive">Sent</Badge>;
                      case 'created':
                        return <Badge variant="secondary">Created</Badge>;
                      case 'unpaid':
                        return <Badge variant="destructive">Sent</Badge>;
                      default:
                        return <Badge variant="secondary">{po.status.replace('_', ' ')}</Badge>;
                    }
                  };
                  return getStatusBadge();
                })()}
              </div>
            </div>

            {/* Payment Summary */}
            <div className="mt-6 bg-background/80 backdrop-blur rounded-lg p-4">
              <div className="grid grid-cols-5 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Original PO</p>
                  <p className="text-lg font-bold">${orderedGrandTotal.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {po.final_total != null ? 'Final Bill' : 'Adjusted (shipped)'}
                  </p>
                  <p className={`text-lg font-bold ${po.final_total != null || adjustedGrandTotal !== orderedGrandTotal ? 'text-primary' : 'text-muted-foreground'}`}>
                    ${effectiveBillTotal.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-bold text-success">${Number(po.total_paid || 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount Owed</p>
                  <p className="text-lg font-bold text-destructive">
                    ${(effectiveBillTotal - Number(po.total_paid || 0)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payments</p>
                  <p className="text-lg font-bold">{poPayments.length}</p>
                </div>
              </div>
            </div>

            {/* Dates and Ship To */}
            <div className="grid grid-cols-2 gap-6 mt-6 bg-background/80 backdrop-blur rounded-lg p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Order Date</Label>
                  <Input
                    type="date"
                    value={po.order_date ? new Date(po.order_date).toISOString().split('T')[0] : ''}
                    className="mt-1"
                    onChange={async (e) => {
                      if (!e.target.value) return;
                      const newDate = new Date(e.target.value).toISOString();
                      const { error } = await supabase.from('vendor_pos').update({ order_date: newDate }).eq('id', po.id);
                      if (!error) setPO({ ...po, order_date: newDate });
                      else toast({ title: 'Error', description: error.message, variant: 'destructive' });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Requested Due Date</Label>
                  <Input
                    type="date"
                    value={po.expected_delivery_date ? new Date(po.expected_delivery_date).toISOString().split('T')[0] : ''}
                    className="mt-1"
                    onChange={async (e) => {
                      const val = e.target.value ? new Date(e.target.value).toISOString() : null;
                      const { error } = await supabase.from('vendor_pos').update({ expected_delivery_date: val }).eq('id', po.id);
                      if (!error) setPO({ ...po, expected_delivery_date: val });
                      else toast({ title: 'Error', description: error.message, variant: 'destructive' });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Shipping Method</Label>
                  <Input
                    defaultValue={po.shipping_method || ''}
                    placeholder="e.g. Ocean LCL, Air, Ground"
                    className="mt-1"
                    onBlur={async (e) => {
                      const val = e.target.value.trim() || null;
                      if (val === (po.shipping_method || null)) return;
                      const { error } = await supabase.from('vendor_pos').update({ shipping_method: val } as any).eq('id', po.id);
                      if (!error) setPO({ ...po, shipping_method: val });
                      else toast({ title: 'Error', description: error.message, variant: 'destructive' });
                    }}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Ship To Address</Label>
                {isEditMode ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Name / Company"
                      value={editedPO.ship_to_name || ''}
                      onChange={(e) => setEditedPO({...editedPO, ship_to_name: e.target.value})}
                    />
                    <Input
                      placeholder="Street Address"
                      value={editedPO.ship_to_street || ''}
                      onChange={(e) => setEditedPO({...editedPO, ship_to_street: e.target.value})}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        placeholder="City"
                        value={editedPO.ship_to_city || ''}
                        onChange={(e) => setEditedPO({...editedPO, ship_to_city: e.target.value})}
                      />
                      <Input
                        placeholder="State"
                        value={editedPO.ship_to_state || ''}
                        onChange={(e) => setEditedPO({...editedPO, ship_to_state: e.target.value})}
                      />
                      <Input
                        placeholder="ZIP"
                        value={editedPO.ship_to_zip || ''}
                        onChange={(e) => setEditedPO({...editedPO, ship_to_zip: e.target.value})}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-sm">
                    {po.ship_to_name || po.ship_to_street ? (
                      <>
                        {po.ship_to_name && <p className="font-medium">{po.ship_to_name}</p>}
                        {po.ship_to_street && <p>{po.ship_to_street}</p>}
                        {(po.ship_to_city || po.ship_to_state || po.ship_to_zip) && (
                          <p>{[po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(', ')}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">Not set</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Vendor Info */}
          <div className="p-8 border-b">
            <h2 className="text-lg font-semibold mb-4">Vendor Information</h2>
            {vendor ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Vendor Name</Label>
                  <p className="font-medium">{vendor.name}</p>
                </div>
                {vendor.contact_name && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Contact Person</Label>
                    <p className="font-medium">{vendor.contact_name}</p>
                  </div>
                )}
                {vendor.contact_email && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="font-medium">{vendor.contact_email}</p>
                  </div>
                )}
                {vendor.contact_phone && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <p className="font-medium">{vendor.contact_phone}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Vendor information not available</p>
            )}
          </div>

          {/* Attachments Section */}
          <div className="p-8 border-b">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Attachments
            </h2>
            <div className="space-y-4">
              {po?.attachment_url ? (
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">{po.attachment_name || 'Attached File'}</p>
                      <p className="text-xs text-muted-foreground">Vendor PI / Invoice</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openStorageObjectInNewTab('po-documents', po.attachment_url)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={handleRemoveAttachment}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                  <Paperclip className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    No file attached. Upload vendor PI or invoice.
                  </p>
                  {isAdmin && (
                    <div>
                      <input
                        type="file"
                        id="file-upload"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                        onChange={handleFileUpload}
                        disabled={uploadingFile}
                      />
                      <label htmlFor="file-upload">
                        <Button
                          variant="outline"
                          disabled={uploadingFile}
                          asChild
                        >
                          <span className="cursor-pointer">
                            {uploadingFile ? (
                              <>Uploading...</>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload File
                              </>
                            )}
                          </span>
                        </Button>
                      </label>
                    </div>
                  )}
                </div>
              )}
              {isAdmin && po?.attachment_url && (
                <div>
                  <input
                    type="file"
                    id="file-replace"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                  />
                  <label htmlFor="file-replace">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={uploadingFile}
                      asChild
                    >
                      <span className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        Replace File
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="p-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Order Items</h2>
              {isAdmin && isEditMode && (
                <Button
                  size="sm"
                  onClick={() => {
                    const newItem = {
                      id: `temp-${Date.now()}`,
                      sku: '',
                      name: '',
                      quantity: 1,
                      shipped_quantity: null,
                      unit_cost: 0,
                      total: 0,
                      isNew: true
                    };
                    setPOItems([...poItems, newItem]);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Custom Line
                </Button>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Ordered</TableHead>
                  <TableHead className="text-center">Shipped</TableHead>
                  {po.final_total && <TableHead className="text-center">Final Qty</TableHead>}
                  <TableHead className="text-right">Unit Cost</TableHead>
                  {po.final_total && <TableHead className="text-right">Final Cost</TableHead>}
                  <TableHead className="text-right">Total</TableHead>
                  {isAdmin && isEditMode && <TableHead className="text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {poItems.map((item, index) => (
                  <TableRow key={item.id} className={item.sku === 'SHIPPING' ? 'bg-muted/50' : ''}>
                    <TableCell>
                      {isEditMode && (item.isNew || !item.order_item_id) ? (
                        <Input
                          value={item.sku || ''}
                          onChange={(e) => {
                            const updated = [...poItems];
                            updated[index].sku = e.target.value;
                            setPOItems(updated);
                          }}
                          placeholder="SKU"
                          className="font-mono"
                        />
                      ) : (
                        <span className="font-mono">{item.sku}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditMode && (item.isNew || !item.order_item_id) ? (
                        <div className="space-y-1">
                          <Input
                            value={item.name || ''}
                            onChange={(e) => {
                              const updated = [...poItems];
                              updated[index].name = e.target.value;
                              setPOItems(updated);
                            }}
                            placeholder="Product name"
                          />
                          <Input
                            value={item.description || ''}
                            onChange={(e) => {
                              const updated = [...poItems];
                              updated[index].description = e.target.value;
                              setPOItems(updated);
                            }}
                            placeholder="Description (optional)"
                            className="text-xs"
                          />
                        </div>
                      ) : (
                        <div>
                          <span>{item.name}</span>
                          {item.description && (
                            <span className="block text-xs text-muted-foreground">{item.description}</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.sku === 'SHIPPING' ? '-' : (
                        isEditMode && item.isNew ? (
                          <Input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...poItems];
                              const newQty = parseInt(e.target.value) || 0;
                              updated[index].quantity = newQty;
                              const effectiveQty = updated[index].shipped_quantity > 0 ? updated[index].shipped_quantity : newQty;
                              updated[index].total = Math.round(effectiveQty * Number(updated[index].unit_cost) * 100) / 100;
                              setPOItems(updated);
                            }}
                            className="w-24 text-center"
                          />
                        ) : (
                          item.quantity
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.sku === 'SHIPPING' ? '-' : (
                        isEditMode ? (
                          <Input
                            type="number"
                            min="0"
                            value={item.shipped_quantity}
                            onChange={(e) => {
                              const updated = [...poItems];
                              const newQuantity = parseInt(e.target.value) || 0;
                              updated[index].shipped_quantity = newQuantity;
                              if (updated[index].isNew) {
                                updated[index].quantity = newQuantity;
                              }
                              // Use shipped_quantity for total if available, otherwise ordered quantity
                              const effectiveQty = updated[index].shipped_quantity > 0 ? updated[index].shipped_quantity : updated[index].quantity;
                              updated[index].total = Math.round(effectiveQty * Number(updated[index].unit_cost) * 100) / 100;
                              setPOItems(updated);
                            }}
                            className="w-24 text-center"
                          />
                        ) : (
                          item.shipped_quantity
                        )
                      )}
                    </TableCell>
                    {po.final_total && (
                      <TableCell className="text-center font-medium">
                        {item.sku === 'SHIPPING' ? '-' : (item.final_quantity ?? '-')}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {isEditMode ? (
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={item.unit_cost}
                          onChange={(e) => {
                            const updated = [...poItems];
                            // Round to 4 decimal places to avoid floating point precision issues
                            const newCost = Math.round((parseFloat(e.target.value) || 0) * 10000) / 10000;
                            updated[index].unit_cost = newCost;
                            // Use shipped_quantity for total if available, otherwise ordered quantity
                            const effectiveQty = updated[index].shipped_quantity > 0 ? updated[index].shipped_quantity : updated[index].quantity;
                            updated[index].total = Math.round(effectiveQty * newCost * 100) / 100;
                            setPOItems(updated);
                          }}
                          className="w-28 text-right"
                        />
                      ) : (
                        `$${Number(item.unit_cost).toFixed(3)}`
                      )}
                    </TableCell>
                    {po.final_total && (
                      <TableCell className="text-right font-medium">
                        {item.final_unit_cost ? `$${Number(item.final_unit_cost).toFixed(3)}` : '-'}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-medium">
                      ${po.final_total && item.final_quantity != null && item.final_unit_cost != null
                        ? (Number(item.final_quantity) * Number(item.final_unit_cost)).toFixed(2)
                        : Number(item.total).toFixed(2)
                      }
                    </TableCell>
                    {isAdmin && isEditMode && (
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (!item.isNew) {
                              const ok = window.confirm(`Remove line "${item.sku || item.name}" from this PO?`);
                              if (!ok) return;
                              setDeletedItemIds((prev) => [...prev, item.id]);
                            }
                            const updated = poItems.filter((_, i) => i !== index);
                            setPOItems(updated);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Shipping & Total */}
            <div className="flex justify-end mt-6 pt-6 border-t">
              <div className="w-72 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="font-medium">${displayedItemsTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Shipping</span>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editedPO.shipping_cost || 0}
                      onChange={(e) => setEditedPO({ ...editedPO, shipping_cost: parseFloat(e.target.value) || 0 })}
                      className="w-28 text-right"
                    />
                  ) : (
                    <span className="font-medium">${Number(po.shipping_cost || 0).toFixed(2)}</span>
                  )}
                </div>
                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-2xl font-bold">
                    ${(displayedItemsTotal + Number(isEditMode ? (editedPO.shipping_cost || 0) : (po.shipping_cost || 0))).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vendor production (same panel the vendor sees) — here unless it already led the page */}
      {!vendorViewFirst && (
        <div className="mt-6">
          <VendorProductionPanel poId={po.id} />
        </div>
      )}

      {/* Payments Section */}
      {poPayments.length > 0 && (
        <Card className="shadow-lg mt-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Payment History</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isAdmin && <TableHead className="text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {poPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {new Date(payment.payment_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="capitalize">
                      {payment.payment_method.replace('_', ' ')}
                    </TableCell>
                    <TableCell>
                      {payment.reference_number || '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {payment.notes || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${Number(payment.amount).toFixed(2)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={async () => {
                            if (!confirm('Delete this payment?')) return;
                            const { error } = await supabase
                              .from('vendor_po_payments')
                              .delete()
                              .eq('id', payment.id);
                            if (error) {
                              toast({
                                title: "Error",
                                description: "Failed to delete payment",
                                variant: "destructive"
                              });
                            } else {
                              toast({ title: "Payment deleted" });
                              fetchPODetails();
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end mt-4 pt-4 border-t">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Payments</p>
                <p className="text-xl font-bold text-green-600">
                  ${poPayments.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Packing Lists Section */}
      {po && (
        <VendorPOPackingListSection
          vendorPOId={po.id}
          vendorPO={po}
          order={po.orders}
          poItems={poItems}
          isAdmin={isAdmin === true}
          onRefresh={fetchPODetails}
        />
      )}

      {/* Email Preview Dialog */}
      <EmailPreviewDialog
        open={showEmailPreview}
        onOpenChange={setShowEmailPreview}
        title="Send Purchase Order to Vendor"
        defaultTo={vendor?.contact_email || ''}
        defaultSubject={`Purchase Order ${po?.po_number} from ${VIBE_COMPANY.name}`}
        defaultMessage={getDefaultEmailMessage()}
        attachmentName={`PO-${po?.po_number}.pdf`}
        artworkFiles={artworkFiles}
        loadingArtwork={loadingArtwork}
        onSend={handleSendEmail}
        sending={sendingEmail}
      />

      {/* Record Payment Dialog */}
      <RecordVendorPOPaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        vendorPO={po}
        onSuccess={() => {
          fetchPODetails();
        }}
      />

      {/* Update Bill Dialog */}
      <UpdateBillDialog
        open={showFinalizeDialog}
        onOpenChange={setShowFinalizeDialog}
        vendorPO={po}
        poItems={poItems}
        onSuccess={() => {
          fetchPODetails();
        }}
      />
    </div>
  );
};

export default VendorPODetail;
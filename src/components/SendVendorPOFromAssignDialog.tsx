import { useState, useEffect } from "react";
import { pdfItemDescription } from "@/lib/pdfItemText";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Send, ArrowLeft, Edit, Save, X, Eye, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { VIBE_COMPANY } from "@/lib/pdfBranding";
import { formatCurrency, formatDocDate, formatUnitPrice } from "@/lib/utils";
import {
  DOC,
  DOC_COLORS,
  docTableStyles,
  drawDetailRows,
  drawDocumentTitle,
  drawFooter,
  drawMasthead,
  drawPartyBlock,
  drawTotals,
  ensureRoom,
} from "@/lib/pdfDocument";
import { EmailPreviewDialog, AdditionalAttachment, ArtworkFile } from "@/components/EmailPreviewDialog";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface SendVendorPOFromAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorPoId: string;
  vendorPoNumber: string;
}

export function SendVendorPOFromAssignDialog({
  open,
  onOpenChange,
  vendorPoId,
  vendorPoNumber,
}: SendVendorPOFromAssignDialogProps) {
  const [loading, setLoading] = useState(true);
  const [po, setPO] = useState<any>(null);
  const [vendor, setVendor] = useState<any>(null);
  const [poItems, setPOItems] = useState<any[]>([]);
  const [editingItems, setEditingItems] = useState<Record<string, { unit_cost: string; quantity: string }>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [artworkFiles, setArtworkFiles] = useState<ArtworkFile[]>([]);
  const [loadingArtwork, setLoadingArtwork] = useState(false);

  useEffect(() => {
    if (open && vendorPoId) {
      fetchPODetails();
    }
  }, [open, vendorPoId]);

  const fetchPODetails = async () => {
    setLoading(true);
    try {
      const { data: poData, error: poError } = await supabase
        .from("vendor_pos")
        .select("*, orders(order_number, customer_name)")
        .eq("id", vendorPoId)
        .single();

      if (poError) throw poError;
      setPO(poData);

      const [vendorRes, itemsRes] = await Promise.all([
        supabase.from("vendors").select("*").eq("id", poData.vendor_id).single(),
        supabase
          .from("vendor_po_items")
          .select("*, order_items(order_id, orders(order_number, po_number))")
          .eq("vendor_po_id", vendorPoId)
          .order("created_at"),
      ]);

      if (vendorRes.data) setVendor(vendorRes.data);
      if (itemsRes.data) setPOItems(itemsRes.data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    const edits: Record<string, { unit_cost: string; quantity: string }> = {};
    poItems.forEach((item) => {
      edits[item.id] = {
        unit_cost: Number(item.unit_cost).toFixed(3),
        quantity: String(item.quantity),
      };
    });
    setEditingItems(edits);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingItems({});
  };

  const saveEdits = async () => {
    setSavingEdits(true);
    try {
      for (const item of poItems) {
        const edit = editingItems[item.id];
        if (!edit) continue;
        const unitCost = parseFloat(edit.unit_cost);
        const qty = parseInt(edit.quantity);

        await supabase
          .from("vendor_po_items")
          .update({ unit_cost: unitCost, quantity: qty, total: unitCost * qty })
          .eq("id", item.id);
      }
      // vendor_pos.total is recalculated by the vendor_po_recalc trigger. Summing it here
      // dropped shipping, which is how POs ended up short by their freight amount.

      setIsEditing(false);
      setEditingItems({});
      await fetchPODetails();
      toast({ title: "PO Updated", description: "Line items saved successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSavingEdits(false);
    }
  };

  const fetchArtworkFiles = async () => {
    if (poItems.length === 0) return;
    setLoadingArtwork(true);
    try {
      const skus = [...new Set(poItems.map((item) => item.sku).filter(Boolean))];
      if (skus.length === 0) {
        setArtworkFiles([]);
        return;
      }
      const { data } = await supabase
        .from("artwork_files")
        .select("id, sku, filename, artwork_url, artwork_type, is_approved")
        .in("sku", skus);
      setArtworkFiles((data as ArtworkFile[]) || []);
    } catch {
      setArtworkFiles([]);
    } finally {
      setLoadingArtwork(false);
    }
  };

  const getOrderNumbers = (): string[] => {
    const set = new Set<string>();
    poItems.forEach((item: any) => {
      const num = item?.order_items?.orders?.order_number;
      if (num) set.add(num);
    });
    if (set.size === 0 && po?.orders?.order_number) set.add(po.orders.order_number);
    return Array.from(set);
  };

  const fetchCaseStickerInfo = async () => {
    const orderIds = new Set<string>();
    poItems.forEach((item: any) => {
      const oid = item?.order_items?.order_id;
      if (oid) orderIds.add(oid);
    });
    if (orderIds.size === 0 && po?.order_id) orderIds.add(po.order_id);
    if (orderIds.size === 0) return [];

    const orderIdList = Array.from(orderIds);
    const [{ data: invoices }, { data: orderRows }] = await Promise.all([
      supabase
        .from("invoices")
        .select("invoice_number, customer_po_number, order_id, orders(order_number, po_number)")
        .in("order_id", orderIdList)
        .is("deleted_at", null)
        .neq("invoice_type", "deposit")
        .order("invoice_number"),
      supabase
        .from("orders")
        .select("id, order_number, po_number")
        .in("id", orderIdList),
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
    orderIdList.forEach((oid) => {
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
    doc.roundedRect(boxX, startY, boxW, boxH, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(146, 64, 14);
    doc.text("REQUIRED ON CASE STICKERS", boxX + padding, startY + padding + 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text("Each case label must include the Vibe Invoice # and Customer PO # below:", boxX + padding, startY + padding + 8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    let y = startY + padding + 14;
    info.forEach((row) => {
      const parts: string[] = [];
      if (row.orderNumber) parts.push(`Order #${row.orderNumber}`);
      if (row.invoiceNumber) parts.push(`Inv # ${row.invoiceNumber}`);
      if (row.customerPO) parts.push(`PO ${row.customerPO}`);
      doc.text("• " + parts.join("   |   "), boxX + padding, y);
      y += lineHeight;
    });

    return startY + boxH + 6;
  };

  const generatePdfBase64 = async (): Promise<string> => {
    if (!po || !vendor || poItems.length === 0) throw new Error("Missing PO data");

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    await drawMasthead(doc);

    let yPos = drawDocumentTitle(doc, {
      label: "PURCHASE ORDER",
      value: po.po_number,
      metaLabel: "Issued",
      metaValue: formatDocDate(po.order_date, "long"),
    });

    const leftColX = DOC.MARGIN;
    const rightColX = pageWidth / 2 + 4;
    const detailsStartY = yPos;

    const vendorY = drawPartyBlock(doc, leftColX, yPos, {
      label: "VENDOR",
      name: vendor.name,
      lines: [vendor.contact_name, vendor.contact_email, vendor.contact_phone],
    });

    const detailRows: Array<[string, string]> = [];
    if (po.expected_delivery_date) {
      detailRows.push(["Due Date", formatDocDate(po.expected_delivery_date, "medium")]);
    }
    detailRows.push(["Order #", getOrderNumbers().join(", ") || po.orders?.order_number || "N/A"]);

    const detY = drawDetailRows(doc, rightColX, detailsStartY, detailRows, { valueOffset: 30 });

    yPos = Math.max(vendorY + 6, detY + 8);

    // Ship To
    if (po.ship_to_name) {
      const cityStateZip = [
        [po.ship_to_city, po.ship_to_state].filter(Boolean).join(", "),
        po.ship_to_zip,
      ].filter(Boolean).join(" ");
      yPos = drawPartyBlock(doc, leftColX, yPos, {
        label: "SHIP TO",
        name: po.ship_to_name,
        lines: [po.ship_to_street, cityStateZip || null],
      }) + 8;
    }

    // Case sticker callout (Vibe Invoice # + Customer PO #)
    const csInfo = await fetchCaseStickerInfo();
    yPos = drawCaseStickerCallout(doc, yPos, pageWidth, csInfo);

    // Items table
    const tableData = poItems.map((item) => [
      item.sku,
      pdfItemDescription(item),
      item.quantity.toLocaleString(),
      formatUnitPrice(Number(item.unit_cost)),
      formatCurrency(Number(item.total)),
    ]);

    autoTable(doc, {
      ...docTableStyles(),
      startY: yPos,
      head: [["SKU", "DESCRIPTION", "QTY", "UNIT COST", "AMOUNT"]],
      body: tableData,
      columnStyles: {
        0: { cellWidth: 40, fontStyle: "bold", textColor: DOC_COLORS.ink },
        1: { cellWidth: "auto" },
        2: { cellWidth: 20, halign: "right" },
        3: { cellWidth: 26, halign: "right" },
        4: { cellWidth: 28, halign: "right", fontStyle: "bold", textColor: DOC_COLORS.ink },
      },
      tableWidth: "auto",
    });

    // Total
    const finalY = ensureRoom(doc, (doc as any).lastAutoTable.finalY + 10, 20);
    const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);

    drawTotals(doc, finalY + 4, {
      rows: [],
      grandLabel: "TOTAL",
      grandValue: formatCurrency(totalAmount),
    });

    drawFooter(doc, "Reference this PO number on all shipments and invoices.");

    return doc.output("datauristring").split(",")[1];
  };

  const getDefaultEmailMessage = () => {
    if (!po || !vendor) return "";
    const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    const orderNums = getOrderNumbers();
    const orderLine = orderNums.length > 0
      ? `Order Number${orderNums.length > 1 ? "s" : ""}: ${orderNums.join(", ")}\n`
      : "";
    return `Dear ${vendor.contact_name || vendor.name},

Please find attached the purchase order from ${VIBE_COMPANY.name}.

PO Number: ${po.po_number}
${orderLine}Order Date: ${formatDocDate(po.order_date, "numeric")}
Total Amount: $${totalAmount.toFixed(2)}

Please confirm receipt of this order and provide an estimated delivery date.

IMPORTANT: Each case sticker must include the Vibe Invoice # and Customer PO # shown on the attached PO. These references are required for our customer to receive the shipment.

Thank you for your business.`;
  };

  const getPreviewHtml = () => {
    if (!po || !vendor) return undefined;
    const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    const formattedAmount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalAmount);
    const formattedOrderDate = formatDocDate(po.order_date, "long");
    const formattedDeliveryDate = po.expected_delivery_date
      ? formatDocDate(po.expected_delivery_date, "long")
      : null;
    const vendorName = vendor?.contact_name || vendor?.name || "Valued Vendor";
    const customMessage = getDefaultEmailMessage();
    const messageHtml = customMessage.split('\n').map((line: string) => line.trim() === '' ? '<br/>' : `<p style="margin: 8px 0; color: #374151; font-size: 16px; line-height: 1.6;">${line}</p>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f5;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width:100%;background-color:#f4f4f5;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);padding:40px 40px 30px 40px;border-radius:12px 12px 0 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr><td><h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">VibePKG</h1><p style="margin:8px 0 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Premium Packaging Solutions</p></td>
<td align="right"><span style="background-color:rgba(255,255,255,0.2);color:#ffffff;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;">PURCHASE ORDER</span></td></tr></table></td></tr>
<tr><td style="padding:40px;">
${messageHtml}
${messageHtml}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;border-radius:8px;margin:24px 0;">
<tr><td style="padding:24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr><td style="padding-bottom:16px;border-bottom:1px solid #e5e7eb;"><p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">PO Number</p><p style="margin:4px 0 0 0;color:#111827;font-size:18px;font-weight:600;">${po.po_number}</p>${getOrderNumbers().length > 0 ? `<p style="margin:12px 0 0 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Order Number${getOrderNumbers().length > 1 ? 's' : ''}</p><p style="margin:4px 0 0 0;color:#111827;font-size:16px;font-weight:600;">${getOrderNumbers().join(', ')}</p>` : ''}</td></tr>
<tr><td style="padding:16px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr><td width="50%"><p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Order Date</p><p style="margin:4px 0 0 0;color:#111827;font-size:16px;font-weight:500;">${formattedOrderDate}</p></td>
<td width="50%" align="right"><p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Total Amount</p><p style="margin:4px 0 0 0;color:#16a34a;font-size:24px;font-weight:700;">${formattedAmount}</p></td></tr></table></td></tr>
${formattedDeliveryDate ? `<tr><td style="padding-top:16px;border-top:1px solid #e5e7eb;"><p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Expected Delivery</p><p style="margin:4px 0 0 0;color:#111827;font-size:16px;font-weight:500;">${formattedDeliveryDate}</p></td></tr>` : ''}
</table></td></tr></table>
<p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">The purchase order PDF is attached to this email for your records.</p>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:24px 40px;border-radius:0 0 12px 12px;border-top:1px solid #e5e7eb;">
<p style="margin:0;color:#ef4444;font-size:12px;font-weight:600;">⚠️ Please do not reply to this email — this mailbox is not monitored.</p>
<p style="margin:8px 0 0 0;color:#6b7280;font-size:14px;">Questions? Contact us at <a href="mailto:accounting@vibepkg.com" style="color:#16a34a;text-decoration:none;">accounting@vibepkg.com</a></p>
<p style="margin:16px 0 0 0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} VibePKG. All rights reserved.</p>
</td></tr></table></td></tr></table></body></html>`;
  };

  const handleDownloadPdf = async () => {
    try {
      const pdfBase64 = await generatePdfBase64();
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `PO-${po.po_number}.pdf`;
      link.click();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleOpenEmailDialog = () => {
    setShowEmailPreview(true);
    fetchArtworkFiles();
  };

  const handleSendEmail = async (data: {
    to: string[];
    subject: string;
    message: string;
    additionalAttachments?: AdditionalAttachment[];
  }) => {
    setSendingEmail(true);
    try {
      const pdfBase64 = await generatePdfBase64();
      const additionalAttachmentsData = data.additionalAttachments?.map((a) => ({
        filename: a.file.name,
        content: a.base64,
      }));
      const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);
      const caseStickerInfo = await fetchCaseStickerInfo();

      const response = await supabase.functions.invoke("send-vendor-po-email", {
        body: {
          poId: vendorPoId,
          recipientEmails: data.to,
          senderName: VIBE_COMPANY.name,
          senderEmail: "accounting@vibepkg.com",
          customMessage: data.message,
          pdfBase64,
          pdfFilename: `PO-${po.po_number}.pdf`,
          poNumber: po.po_number,
          orderNumbers: getOrderNumbers(),
          orderDate: po.order_date,
          expectedDeliveryDate: po.expected_delivery_date,
          totalAmount,
          vendorName: vendor?.contact_name || vendor?.name || "Vendor",
          additionalAttachments:
            additionalAttachmentsData && additionalAttachmentsData.length > 0
              ? additionalAttachmentsData
              : undefined,
          caseStickerInfo: caseStickerInfo.length > 0 ? caseStickerInfo : undefined,
        },
      });

      if (response.error) throw response.error;

      await supabase.from("vendor_pos").update({ status: "sent" }).eq("id", vendorPoId);

      toast({
        title: "PO Sent",
        description: `Purchase order sent to ${data.to.join(", ")}`,
      });

      setShowEmailPreview(false);
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send email", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);

  const getEditTotal = () => {
    return poItems.reduce((sum, item) => {
      const edit = editingItems[item.id];
      if (!edit) return sum + Number(item.total);
      return sum + parseFloat(edit.unit_cost || "0") * parseInt(edit.quantity || "0");
    }, 0);
  };

  return (
    <>
      <Dialog open={open && !showEmailPreview} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              PO {vendorPoNumber} Preview
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : po && vendor ? (
            <ScrollArea className="flex-1 overflow-y-auto pr-2">
            <div className="space-y-4">
              {/* PO Header Info */}
              <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Vendor</p>
                  <p className="font-semibold">{vendor.name}</p>
                  {vendor.contact_name && <p className="text-sm text-muted-foreground">{vendor.contact_name}</p>}
                  {vendor.contact_email && <p className="text-sm text-muted-foreground">{vendor.contact_email}</p>}
                </div>
                <div className="space-y-1 text-right">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">PO Number</p>
                    <p className="font-semibold">{po.po_number}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">Date</p>
                    <p className="text-sm">{formatDocDate(po.order_date, "numeric")}</p>
                  </div>
                  {po.orders?.order_number && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">Order</p>
                      <p className="text-sm">{po.orders.order_number}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between">
                <Badge
                  variant={po.status === "sent" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {po.status === 'sent' ? 'Sent' : po.status === 'created' ? 'Created' : po.status}
                </Badge>
                {!isEditing ? (
                  <Button variant="outline" size="sm" onClick={startEditing}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit Items
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEditing} disabled={savingEdits}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={saveEdits} disabled={savingEdits}>
                      {savingEdits ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      Save
                    </Button>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <ScrollArea className="max-h-[40vh]">
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
                    {poItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                        <TableCell className="text-sm">{item.name}</TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              type="number"
                              className="h-8 w-20 text-center mx-auto"
                              value={editingItems[item.id]?.quantity || ""}
                              onChange={(e) =>
                                setEditingItems((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], quantity: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            item.quantity.toLocaleString()
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.001"
                              className="h-8 w-24 text-right ml-auto"
                              value={editingItems[item.id]?.unit_cost || ""}
                              onChange={(e) =>
                                setEditingItems((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], unit_cost: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            `$${Number(item.unit_cost).toFixed(3)}`
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {isEditing
                            ? `$${(parseFloat(editingItems[item.id]?.unit_cost || "0") * parseInt(editingItems[item.id]?.quantity || "0")).toFixed(2)}`
                            : `$${Number(item.total).toFixed(2)}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <Separator />

              {/* Total */}
              <div className="flex justify-end">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-primary">
                    ${isEditing ? getEditTotal().toFixed(2) : totalAmount.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
            </ScrollArea>
          ) : (
            <p className="text-center text-muted-foreground py-8">Failed to load PO details</p>
          )}

          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={loading || !po}
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            <Button
              onClick={handleOpenEmailDialog}
              disabled={loading || !vendor?.contact_email || isEditing}
            >
              <Send className="h-4 w-4 mr-2" />
              Compose Email & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Compose Dialog */}
      <EmailPreviewDialog
        open={showEmailPreview}
        onOpenChange={(open) => {
          setShowEmailPreview(open);
          if (!open) {
            // Re-show the preview dialog when email dialog closes
          }
        }}
        title="Send Purchase Order to Vendor"
        defaultTo={vendor?.contact_email || ""}
        defaultSubject={`Purchase Order ${po?.po_number} from ${VIBE_COMPANY.name}`}
        defaultMessage={getDefaultEmailMessage()}
        attachmentName={`PO-${po?.po_number}.pdf`}
        artworkFiles={artworkFiles}
        loadingArtwork={loadingArtwork}
        previewHtml={getPreviewHtml()}
        onSend={handleSendEmail}
        sending={sendingEmail}
      />
    </>
  );
}

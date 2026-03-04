import { useState, useEffect } from "react";
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
        supabase.from("vendor_po_items").select("*").eq("vendor_po_id", vendorPoId).order("created_at"),
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
      let newTotal = 0;
      for (const item of poItems) {
        const edit = editingItems[item.id];
        if (!edit) continue;
        const unitCost = parseFloat(edit.unit_cost);
        const qty = parseInt(edit.quantity);
        const itemTotal = unitCost * qty;
        newTotal += itemTotal;

        await supabase
          .from("vendor_po_items")
          .update({ unit_cost: unitCost, quantity: qty, total: itemTotal })
          .eq("id", item.id);
      }

      await supabase.from("vendor_pos").update({ total: newTotal }).eq("id", vendorPoId);

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

  const generatePdfBase64 = async (): Promise<string> => {
    if (!po || !vendor || poItems.length === 0) throw new Error("Missing PO data");

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const primaryGreen = [22, 163, 74] as const;
    const darkGray = [17, 24, 39] as const;
    const mediumGray = [107, 114, 128] as const;
    const lightGray = [249, 250, 251] as const;

    // Header
    let yPos = 20;
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text(VIBE_COMPANY.name, 14, yPos);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    yPos += 8;
    doc.text(VIBE_COMPANY.address.street, 14, yPos);
    yPos += 5;
    doc.text(`${VIBE_COMPANY.address.city}, ${VIBE_COMPANY.address.state} ${VIBE_COMPANY.address.zip}`, 14, yPos);
    yPos += 5;
    doc.text("accounting@vibepkg.com", 14, yPos);
    yPos += 10;

    // Divider
    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.line(14, yPos, pageWidth - 14, yPos);
    yPos += 12;

    // Title
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text("Purchase Order", 14, yPos);
    yPos += 15;

    // Vendor info (left)
    const leftColX = 14;
    const rightColX = pageWidth / 2 + 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("Vendor", leftColX, yPos);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(vendor.name, leftColX, yPos + 8);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    let vendorY = yPos + 14;
    if (vendor.contact_name) { doc.text(vendor.contact_name, leftColX, vendorY); vendorY += 5; }
    if (vendor.contact_email) { doc.text(vendor.contact_email, leftColX, vendorY); vendorY += 5; }
    if (vendor.contact_phone) { doc.text(vendor.contact_phone, leftColX, vendorY); }

    // PO details (right)
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("PO #:", rightColX, yPos);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(po.po_number, rightColX + 45, yPos);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("Date:", rightColX, yPos + 7);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(new Date(po.order_date).toLocaleDateString(), rightColX + 45, yPos + 7);

    if (po.expected_delivery_date) {
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text("Due Date:", rightColX, yPos + 14);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(new Date(po.expected_delivery_date).toLocaleDateString(), rightColX + 45, yPos + 14);
    }

    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("Order #:", rightColX, yPos + 21);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(po.orders?.order_number || "N/A", rightColX + 45, yPos + 21);

    yPos += 40;

    // Ship To
    if (po.ship_to_name) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text("Ship To", leftColX, yPos);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      let shipY = yPos + 7;
      doc.setFont("helvetica", "bold");
      doc.text(po.ship_to_name, leftColX, shipY);
      doc.setFont("helvetica", "normal");
      shipY += 5;
      if (po.ship_to_street) { doc.text(po.ship_to_street, leftColX, shipY); shipY += 5; }
      const cityStateZip = [po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(", ");
      if (cityStateZip) doc.text(cityStateZip, leftColX, shipY);
      yPos += 28;
    }

    // Items table
    const tableData = poItems.map((item) => [
      item.sku,
      item.name,
      item.quantity.toLocaleString(),
      `$${Number(item.unit_cost).toFixed(3)}`,
      `$${Number(item.total).toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["SKU", "DESCRIPTION", "QTY", "UNIT COST", "AMOUNT"]],
      body: tableData,
      theme: "plain",
      headStyles: {
        fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 9,
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 4,
        textColor: [darkGray[0], darkGray[1], darkGray[2]],
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: [lightGray[0], lightGray[1], lightGray[2]] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right", fontStyle: "bold" },
      },
      margin: { left: 14, right: 14 },
      showHead: "firstPage",
      tableLineWidth: 0,
      tableWidth: "auto",
    });

    // Total
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    const totalsX = pageWidth - 80 - 14;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totalsX, finalY, pageWidth - 14, finalY);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("TOTAL", totalsX, finalY + 8);
    doc.text(`$${totalAmount.toFixed(2)}`, pageWidth - 14, finalY + 8, { align: "right" });

    // Footer
    const footerY = Math.max(finalY + 30, pageHeight - 20);
    if (footerY < pageHeight - 10) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text("Thank you for your business!", pageWidth / 2, pageHeight - 12, { align: "center" });
    }

    return doc.output("datauristring").split(",")[1];
  };

  const getDefaultEmailMessage = () => {
    if (!po || !vendor) return "";
    const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    return `Dear ${vendor.contact_name || vendor.name},

Please find attached the purchase order from ${VIBE_COMPANY.name}.

PO Number: ${po.po_number}
Order Date: ${new Date(po.order_date).toLocaleDateString()}
Total Amount: $${totalAmount.toFixed(2)}

Please confirm receipt of this order and provide an estimated delivery date.

Thank you for your business.`;
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
          orderDate: po.order_date,
          expectedDeliveryDate: po.expected_delivery_date,
          totalAmount,
          vendorName: vendor?.contact_name || vendor?.name || "Vendor",
          additionalAttachments:
            additionalAttachmentsData && additionalAttachmentsData.length > 0
              ? additionalAttachmentsData
              : undefined,
        },
      });

      if (response.error) throw response.error;

      await supabase.from("vendor_pos").update({ status: "submitted" }).eq("id", vendorPoId);

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
                    <p className="text-sm">{new Date(po.order_date).toLocaleDateString()}</p>
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
                  variant={po.status === "submitted" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {po.status}
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
        onSend={handleSendEmail}
        sending={sendingEmail}
      />
    </>
  );
}

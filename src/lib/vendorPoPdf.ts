// Vendor PO PDF — same document layout the vibe-admin side generates
// (company header, Purchase Order title, vendor + details columns, Ship To,
// case-sticker callout with Vibe Invoice # / Customer PO #, items table,
// totals). Used by the vendor portal's Download PDF button.
import jsPDF from "jspdf";
import { pdfItemDescription } from "@/lib/pdfItemText";
import autoTable from "jspdf-autotable";

// The PO document is what we ordered, so every figure on it is quantity x unit_cost.
// The stored line `total` column is a stale cache that no money math reads, and reading
// it here made the vendor's own download disagree with the admin PDF of the same PO.
// Mirrors orderedLineAmount / splitPOTotals in VendorPODetail.tsx and public.vendor_po_recalc.
const isShippingItem = (item: any) =>
  item?.sku === 'SHIPPING' || item?.item_type === 'shipping';

const orderedLineAmount = (item: any) =>
  Number(item?.quantity || 0) * Number(item?.unit_cost || 0);

export interface PoPdfStickerRow {
  orderNumber?: string;
  invoiceNumber?: string;
  customerPO?: string;
}

export interface PoPdfData {
  poNumber: string;
  orderDate: string;
  expectedDeliveryDate?: string | null;
  orderNumber?: string | null;
  vendorName: string;
  vendorContact?: { name?: string | null; email?: string | null; phone?: string | null };
  shipTo: {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  };
  stickerInfo: PoPdfStickerRow[];
  items: Array<{ sku: string | null; name: string | null; description?: string | null; quantity: number; unit_cost: number; total: number }>;
  shippingCost: number;
  total: number;
}

const drawCaseStickerCallout = (
  doc: jsPDF,
  startY: number,
  pageWidth: number,
  info: PoPdfStickerRow[]
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

export async function downloadVendorPoPdf(data: PoPdfData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const primaryGreen = [76, 175, 80];
  const darkGray = [51, 51, 51];
  const lightGray = [248, 248, 248];
  const mediumGray = [100, 100, 100];

  // ============ HEADER ============
  let yPos = 15;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text("ArmorPak Inc. DBA Vibe Packaging", 14, yPos);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text("1415 S 700 W", 14, yPos + 7);
  doc.text("Salt Lake City, UT 84104", 14, yPos + 12);
  doc.text("www.vibepkg.com", 14, yPos + 17);

  try {
    const logoResponse = await fetch("/images/vibe-logo.png");
    const logoBlob = await logoResponse.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
    doc.addImage(logoBase64, "PNG", pageWidth - 54, yPos - 5, 40, 25);
  } catch {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("VIBE", pageWidth - 14, yPos + 8, { align: "right" });
  }

  yPos += 28;
  doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth - 14, yPos);
  yPos += 12;

  // ============ TITLE ============
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text("Purchase Order", 14, yPos);
  yPos += 15;

  // ============ VENDOR & DETAILS ============
  const leftColX = 14;
  const rightColX = pageWidth / 2 + 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text("Vendor", leftColX, yPos);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(data.vendorName, leftColX, yPos + 8);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  let vendorY = yPos + 14;
  if (data.vendorContact?.name) { doc.text(data.vendorContact.name, leftColX, vendorY); vendorY += 5; }
  if (data.vendorContact?.email) { doc.text(data.vendorContact.email, leftColX, vendorY); vendorY += 5; }
  if (data.vendorContact?.phone) { doc.text(data.vendorContact.phone, leftColX, vendorY); }

  const detailsStartY = yPos;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text("PO #:", rightColX, detailsStartY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(data.poNumber, rightColX + 45, detailsStartY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text("Date:", rightColX, detailsStartY + 7);
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(new Date(data.orderDate).toLocaleDateString(), rightColX + 45, detailsStartY + 7);

  if (data.expectedDeliveryDate) {
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("Due Date:", rightColX, detailsStartY + 14);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(new Date(data.expectedDeliveryDate).toLocaleDateString(), rightColX + 45, detailsStartY + 14);
  }

  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text("Order #:", rightColX, detailsStartY + 21);
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(data.orderNumber || "N/A", rightColX + 45, detailsStartY + 21);

  yPos += 40;

  // ============ SHIP TO ============
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text("Ship To", leftColX, yPos);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  let shipY = yPos + 7;
  if (data.shipTo.name) {
    doc.setFont("helvetica", "bold");
    doc.text(data.shipTo.name, leftColX, shipY);
    doc.setFont("helvetica", "normal");
    shipY += 5;
  }
  if (data.shipTo.street) { doc.text(data.shipTo.street, leftColX, shipY); shipY += 5; }
  const cityStateZip = [data.shipTo.city, data.shipTo.state, data.shipTo.zip].filter(Boolean).join(", ");
  if (cityStateZip) doc.text(cityStateZip, leftColX, shipY);

  yPos += 28;

  // ============ CASE STICKER CALLOUT ============
  yPos = drawCaseStickerCallout(doc, yPos, pageWidth, data.stickerInfo);

  // ============ ITEMS ============
  // Shipping is summarised in the totals section below, so it must not also appear as a line.
  const tableData = data.items.filter((item) => !isShippingItem(item)).map((item) => [
    item.sku || "",
    pdfItemDescription(item),
    Number(item.quantity).toLocaleString(),
    `$${Number(item.unit_cost).toFixed(3)}`,
    `$${orderedLineAmount(item).toFixed(2)}`,
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
    bodyStyles: { fontSize: 9, cellPadding: 4, textColor: [darkGray[0], darkGray[1], darkGray[2]], lineWidth: 0 },
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

  // ============ TOTALS ============
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const itemsTotal = data.items
    .filter((item) => !isShippingItem(item))
    .reduce((sum, item) => sum + orderedLineAmount(item), 0);
  const shippingLineSum = data.items
    .filter(isShippingItem)
    .reduce((sum, item) => sum + orderedLineAmount(item), 0);
  const shippingCost = shippingLineSum !== 0 ? shippingLineSum : Number(data.shippingCost || 0);
  const totalAmount = Math.round((itemsTotal + shippingCost) * 100) / 100;

  const totalsWidth = 80;
  const totalsX = pageWidth - totalsWidth - 14;

  if (shippingCost > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("Subtotal", totalsX, finalY + 4);
    doc.text(`$${itemsTotal.toFixed(2)}`, pageWidth - 14, finalY + 4, { align: "right" });
    doc.text("Shipping", totalsX, finalY + 12);
    doc.text(`$${shippingCost.toFixed(2)}`, pageWidth - 14, finalY + 12, { align: "right" });
  }

  const totalLineY = shippingCost > 0 ? finalY + 16 : finalY;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(totalsX, totalLineY, pageWidth - 14, totalLineY);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text("TOTAL", totalsX, totalLineY + 8);
  doc.text(`$${totalAmount.toFixed(2)}`, pageWidth - 14, totalLineY + 8, { align: "right" });

  // ============ FOOTER ============
  const footerY = Math.max(finalY + 30, pageHeight - 20);
  if (footerY < pageHeight - 10) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("Thank you for your business!", pageWidth / 2, pageHeight - 12, { align: "center" });
  }

  doc.save(`vendor-po-${data.poNumber}.pdf`);
}

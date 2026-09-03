// Vendor PO PDF — same document layout the vibe-admin side generates
// (company header, Purchase Order title, vendor + details columns, Ship To,
// case-sticker callout with Vibe Invoice # / Customer PO #, items table,
// totals). Used by the vendor portal's Download PDF button.
import jsPDF from "jspdf";
import { pdfItemDescription } from "@/lib/pdfItemText";
import { formatCurrency, formatUnitPrice } from "@/lib/utils";
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
  drawTotals,
  ensureRoom,
  type TotalsRow,
} from "@/lib/pdfDocument";

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
  const boxX = DOC.MARGIN;
  const boxW = pageWidth - DOC.MARGIN * 2;
  const lineHeight = 5;
  const padding = 4;
  const boxH = 14 + info.length * lineHeight + padding;

  // The one place a warm accent earns its keep: this is a hard requirement the
  // vendor must not skim past. Kept as a tinted panel with a left keyline
  // rather than a full amber outline, so it reads as a callout, not a warning
  // sticker glued to an otherwise neutral document.
  doc.setFillColor(253, 246, 227);
  doc.rect(boxX, startY, boxW, boxH, "F");
  doc.setFillColor(180, 122, 21);
  doc.rect(boxX, startY, 1.6, boxH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(124, 78, 12);
  doc.text("REQUIRED ON CASE STICKERS", boxX + padding + 3, startY + padding + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...DOC_COLORS.body);
  doc.text("Each case label must include the Vibe Invoice # and Customer PO # below:", boxX + padding + 3, startY + padding + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DOC_COLORS.ink);
  let y = startY + padding + 14;
  info.forEach((row) => {
    const parts: string[] = [];
    if (row.orderNumber) parts.push(`Order #${row.orderNumber}`);
    if (row.invoiceNumber) parts.push(`Inv # ${row.invoiceNumber}`);
    if (row.customerPO) parts.push(`PO ${row.customerPO}`);
    doc.text("• " + parts.join("   |   "), boxX + padding + 3, y);
    y += lineHeight;
  });

  return startY + boxH + 6;
};

/**
 * Renders the PO document. This is the only implementation — the vendor
 * portal's download, the admin download and the admin email attachment all go
 * through it, so a vendor can never receive two POs that look like they came
 * from different companies.
 *
 * `totals` lets the admin side pass the figures splitPOTotals already computed
 * rather than have this file re-derive them; omitted, the same derivation runs
 * here off the line items.
 */
export async function renderVendorPoDoc(
  data: PoPdfData,
  totals?: { itemsTotal: number; shipping: number; totalAmount: number }
): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ============ HEADER ============
  await drawMasthead(doc);

  let yPos = drawDocumentTitle(doc, {
    label: "PURCHASE ORDER",
    value: data.poNumber,
    metaLabel: "Issued",
    metaValue: new Date(data.orderDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  });

  // ============ VENDOR & DETAILS ============
  const leftColX = DOC.MARGIN;
  const rightColX = pageWidth / 2 + 4;
  const detailsStartY = yPos;

  const vendorY = drawPartyBlock(doc, leftColX, yPos, {
    label: "VENDOR",
    name: data.vendorName,
    lines: [data.vendorContact?.name, data.vendorContact?.email, data.vendorContact?.phone],
  });

  const detailRows: Array<[string, string]> = [];
  if (data.expectedDeliveryDate) {
    detailRows.push([
      "Due Date",
      new Date(data.expectedDeliveryDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    ]);
  }
  detailRows.push(["Order #", data.orderNumber || "N/A"]);

  const detY = drawDetailRows(doc, rightColX, detailsStartY, detailRows, { valueOffset: 30 });

  yPos = Math.max(vendorY + 6, detY + 8);

  // ============ SHIP TO ============
  // "City, ST ZIP" — joining all three with commas produced "Salt Lake City,
  // UT, 84104", which is not how an address is written.
  const cityStateZip = [
    [data.shipTo.city, data.shipTo.state].filter(Boolean).join(", "),
    data.shipTo.zip,
  ].filter(Boolean).join(" ");
  yPos = drawPartyBlock(doc, leftColX, yPos, {
    label: "SHIP TO",
    name: data.shipTo.name || null,
    lines: [data.shipTo.street, cityStateZip || null],
  }) + 8;

  // ============ CASE STICKER CALLOUT ============
  yPos = drawCaseStickerCallout(doc, yPos, pageWidth, data.stickerInfo);

  // ============ ITEMS ============
  // Shipping is summarised in the totals section below, so it must not also appear as a line.
  const tableData = data.items.filter((item) => !isShippingItem(item)).map((item) => [
    item.sku || "",
    pdfItemDescription(item),
    Number(item.quantity).toLocaleString(),
    formatUnitPrice(Number(item.unit_cost)),
    formatCurrency(orderedLineAmount(item)),
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

  // ============ TOTALS ============
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const derivedItemsTotal = data.items
    .filter((item) => !isShippingItem(item))
    .reduce((sum, item) => sum + orderedLineAmount(item), 0);
  const shippingLineSum = data.items
    .filter(isShippingItem)
    .reduce((sum, item) => sum + orderedLineAmount(item), 0);
  const derivedShipping = shippingLineSum !== 0 ? shippingLineSum : Number(data.shippingCost || 0);

  const itemsTotal = totals ? totals.itemsTotal : derivedItemsTotal;
  const shippingCost = totals ? totals.shipping : derivedShipping;
  const totalAmount = totals
    ? totals.totalAmount
    : Math.round((derivedItemsTotal + derivedShipping) * 100) / 100;

  const totalsRows: TotalsRow[] = shippingCost > 0
    ? [
        { label: "Subtotal", value: formatCurrency(itemsTotal) },
        { label: "Shipping", value: formatCurrency(shippingCost) },
      ]
    : [];

  drawTotals(doc, ensureRoom(doc, finalY, totalsRows.length * 9 + 16) + 4, {
    rows: totalsRows,
    grandLabel: "TOTAL",
    grandValue: formatCurrency(totalAmount),
  });

  // ============ FOOTER ============
  drawFooter(doc, "Reference this PO number on all shipments and invoices.");

  return doc;
}

export async function downloadVendorPoPdf(data: PoPdfData) {
  const doc = await renderVendorPoDoc(data);
  doc.save(`vendor-po-${data.poNumber}.pdf`);
}

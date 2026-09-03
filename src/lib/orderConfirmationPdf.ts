import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { pdfItemDescription } from "@/lib/pdfItemText";
import { formatCurrency, formatUnitPrice } from "@/lib/utils";
import {
  DOC,
  DOC_COLORS,
  docTableStyles,
  drawDetailRows,
  drawDocumentTitle,
  drawFooter,
  drawMasthead,
  drawNotes,
  drawPartyBlock,
  drawTotals,
  ensureRoom,
} from "@/lib/pdfDocument";

interface OrderConfirmationData {
  order_number: string;
  order_date: string;
  po_number?: string | null;
  customer_name: string;
  description?: string | null;
  shipping_name: string;
  shipping_street: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
}

interface ConfirmationItem {
  name: string;
  sku: string;
  quantity: number;
  unit_price?: number;
  description?: string | null;
}

export async function generateOrderConfirmationPdf(
  order: OrderConfirmationData,
  items: ConfirmationItem[]
): Promise<{ blob: Blob; base64: string }> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ============ HEADER ============
  await drawMasthead(doc);

  let yPos = drawDocumentTitle(doc, {
    label: "ORDER CONFIRMATION",
    value: order.order_number,
    metaLabel: "Ordered",
    metaValue: new Date(order.order_date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  });

  // ============ SHIP TO & ORDER DETAILS ============
  const leftColX = DOC.MARGIN;
  const rightColX = pageWidth / 2 + 4;
  const detailsStartY = yPos;

  const shipY = drawPartyBlock(doc, leftColX, yPos, {
    label: "SHIP TO",
    name: order.shipping_name || order.customer_name,
    lines: [
      order.shipping_street || null,
      order.shipping_city
        ? `${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`
        : null,
    ],
  });

  const detailRows: Array<[string, string]> = [["Customer", order.customer_name]];
  if (order.po_number) detailRows.push(["PO #", order.po_number]);

  const detY = drawDetailRows(doc, rightColX, detailsStartY, detailRows, { valueOffset: 30 });

  yPos = Math.max(shipY + 8, detY + 10);

  // ============ DESCRIPTION ============
  if (order.description) {
    yPos = drawNotes(doc, yPos, "DESCRIPTION", order.description) + 10;
  }

  // ============ ITEMS TABLE ============
  const hasAnyPrice = items.some(i => (i.unit_price || 0) > 0);

  const tableHead = hasAnyPrice
    ? [["#", "PRODUCT", "SKU", "QTY", "UNIT PRICE", "TOTAL"]]
    : [["#", "PRODUCT", "SKU", "QTY", "DESCRIPTION"]];

  const tableBody = items.map((item, i) => {
    const qtyStr = item.quantity.toLocaleString();
    if (hasAnyPrice) {
      const price = item.unit_price || 0;
      const lineTotal = item.quantity * price;
      return [
        (i + 1).toString(),
        pdfItemDescription(item),
        item.sku,
        qtyStr,
        formatUnitPrice(price),
        formatCurrency(lineTotal),
      ];
    }
    return [
      (i + 1).toString(),
      pdfItemDescription(item),
      item.sku,
      qtyStr,
      item.description || "",
    ];
  });

  autoTable(doc, {
    ...docTableStyles(),
    startY: yPos,
    head: tableHead,
    body: tableBody,
    columnStyles: hasAnyPrice
      ? {
          // The line-number column must clear its own padding or autoTable is
          // left with a negative content width and drops the digit to the
          // cell's baseline, well below the row it belongs to.
          0: { cellWidth: 12, textColor: DOC_COLORS.muted, cellPadding: { top: 4, right: 1, bottom: 4, left: 5 } },
          2: { fontStyle: "bold", cellWidth: 40, textColor: DOC_COLORS.ink },
          3: { halign: "right", cellWidth: 20, overflow: "visible" },
          4: { halign: "right", cellWidth: 27 },
          5: { halign: "right", cellWidth: 28, fontStyle: "bold", textColor: DOC_COLORS.ink },
        }
      : {
          0: { cellWidth: 12, textColor: DOC_COLORS.muted, cellPadding: { top: 4, right: 1, bottom: 4, left: 5 } },
          2: { fontStyle: "bold", cellWidth: 40, textColor: DOC_COLORS.ink },
          3: { halign: "right", cellWidth: 20, overflow: "visible" },
        },
  });

  // ============ TOTAL QTY & GRAND TOTAL ============
  let finalY = ((doc as any).lastAutoTable?.finalY || yPos + 40) + 10;
  finalY = ensureRoom(doc, finalY, 24);

  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DOC_COLORS.muted);
  doc.text(
    `${items.length} line${items.length === 1 ? "" : "s"}  ·  ${totalQty.toLocaleString()} units`,
    DOC.MARGIN,
    finalY + 5
  );

  if (hasAnyPrice) {
    const grandTotal = items.reduce((sum, i) => sum + i.quantity * (i.unit_price || 0), 0);
    drawTotals(doc, finalY + 5, {
      rows: [],
      grandLabel: "TOTAL",
      grandValue: formatCurrency(grandTotal),
    });
  }

  // ============ FOOTER ============
  drawFooter(doc);

  const base64 = doc.output("datauristring").split(",")[1];
  const blob = doc.output("blob");
  return { blob, base64 };
}

import jsPDF from "jspdf";
import { pdfItemDescription } from "@/lib/pdfItemText";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
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
  type TotalsRow,
} from "@/lib/pdfDocument";

interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  total: number;
  total_paid?: number | null;
  subtotal?: number;
  tax?: number;
  shipping_cost?: number | null;
  shipping_note?: string | null;
  notes?: string | null;
  companies?: { name: string } | null;
  billed_percentage?: number | null;
  /**
   * Blanket-level payments credited to this child invoice (prorated in shipment
   * order — see src/lib/invoiceBalance.ts, the single owner of that math).
   */
  deposit_credit?: number | null;
  deposit_credit_label?: string | null;
  // Invoice-level address overrides (take precedence over order addresses)
  billing_name?: string | null;
  billing_street?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  shipping_name?: string | null;
  shipping_street?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
}

interface OrderData {
  order_number: string;
  customer_name: string;
  po_number?: string | null;
  billing_street?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  shipping_street?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
  order_items?: OrderItem[];
}

export interface OrderItem {
  sku: string;
  name: string;
  description?: string | null;
  quantity: number;
  shipped_quantity?: number;
  unit_price: number;
}

const renderInvoiceToDoc = async (
  invoice: InvoiceData,
  order: OrderData
): Promise<jsPDF> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ============ HEADER ============
  await drawMasthead(doc);

  let yPos = drawDocumentTitle(doc, {
    label: 'INVOICE',
    value: invoice.invoice_number,
    metaLabel: 'Issued',
    metaValue: format(new Date(invoice.invoice_date), 'MMMM d, yyyy'),
  });

  // ============ BILLED TO & INVOICE DETAILS SECTION ============
  const leftColX = DOC.MARGIN;
  const rightColX = pageWidth / 2 + 4;
  const detailsStartY = yPos;

  // Prefer invoice-level address overrides, then order billing, then order shipping
  const billStreet = invoice.billing_street || invoice.shipping_street || order.billing_street || order.shipping_street || '';
  const billCity = invoice.billing_city || invoice.shipping_city || order.billing_city || order.shipping_city || '';
  const billState = invoice.billing_state || invoice.shipping_state || order.billing_state || order.shipping_state || '';
  const billZip = invoice.billing_zip || invoice.shipping_zip || order.billing_zip || order.shipping_zip || '';

  const billY = drawPartyBlock(doc, leftColX, yPos, {
    label: 'BILLED TO',
    name: invoice.billing_name || invoice.companies?.name || order.customer_name,
    lines: [
      billStreet || null,
      billCity ? `${billCity}, ${billState} ${billZip}` : null,
    ],
  });

  const detailRows: Array<[string, string]> = [];
  if (invoice.due_date) {
    detailRows.push(['Due Date', format(new Date(invoice.due_date), 'MMM d, yyyy')]);
  }
  detailRows.push(['Order #', order.order_number]);
  if (order.po_number) detailRows.push(['PO #', order.po_number]);

  const detailY = drawDetailRows(doc, rightColX, detailsStartY, detailRows, { valueOffset: 30 });

  yPos = Math.max(billY + 8, detailY + 10);

  // ============ ITEMS TABLE ============
  const items = order.order_items || [];
  // Use shipped quantity as the source of truth when ANY item has shipped
  // (matches the footer/DB logic). When nothing has shipped on the invoice,
  // fall back to ordered qty so deposit/blanket invoices still display lines.
  const anyShippedForRows = items.some((it) => Number(it.shipped_quantity || 0) > 0);
  const tableData = items.map((item) => {
    const qty = anyShippedForRows
      ? Number(item.shipped_quantity || 0)
      : Number(item.quantity || 0);
    return [
      item.sku || '',
      pdfItemDescription(item),
      qty.toLocaleString(),
      formatUnitPrice(item.unit_price || 0),
      formatCurrency(qty * (item.unit_price || 0))
    ];
  });
  
  const tableInnerWidth = pageWidth - DOC.MARGIN * 2;
  autoTable(doc, {
    ...docTableStyles(),
    startY: yPos,
    head: [['SKU', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT']],
    body: tableData,
    columnStyles: {
      // 40mm clears the SKUs actually in use; at 32 they broke mid-token
      // ("MYL-35-MATT / E"), which reads as a defect on a billing document.
      0: { cellWidth: 40, textColor: DOC_COLORS.ink, fontStyle: 'bold' },
      1: { cellWidth: tableInnerWidth - 40 - 20 - 26 - 30 },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: DOC_COLORS.ink }
    },
  });
  
  // Get final Y position after table
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  
  // ============ TOTALS SECTION ============
  // The stored invoice.subtotal is the source of truth (DB trigger owns it) so the
  // PDF always matches the portal, the list page, and QuickBooks. Line math is only
  // a fallback for callers that couldn't supply the stored value.
  const anyShipped = items.some((item) => Number(item.shipped_quantity || 0) > 0);
  const lineSubtotal = anyShipped
    ? items.reduce((sum, item) => {
        const shipped = Number(item.shipped_quantity || 0);
        return sum + (shipped > 0 ? shipped : 0) * Number(item.unit_price || 0);
      }, 0)
    : items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);

  const computedSubtotal = invoice.subtotal != null ? Number(invoice.subtotal) : lineSubtotal;
  const shippingAmount = Number(invoice.shipping_cost || 0);
  const computedTotal = computedSubtotal + Number(invoice.tax || 0) + shippingAmount;

  // Prorated blanket-payment credit for child invoices (computed by the caller via
  // src/lib/invoiceBalance.ts). This invoice's own subtotal/shipping always show —
  // a child never displays blanket-wide numbers.
  const depositCredit = Number(invoice.deposit_credit || 0);

  const billedPct = invoice.billed_percentage;
  const totalPaidPreview = invoice.total_paid || 0;
  // Deposit line only applies when nothing has shipped AND no payments have been recorded.
  // Otherwise it's misleading clutter (deposit was already billed/paid; "Less Payments" covers it).
  const isDeposit = depositCredit <= 0.005 && !anyShipped && totalPaidPreview === 0 && billedPct != null && billedPct > 0 && billedPct < 100;
  const billedTotal = isDeposit ? computedTotal * (billedPct / 100) : computedTotal;

  const totalPaid = invoice.total_paid || 0;
  const balance = billedTotal - totalPaid - depositCredit;
  const hasPayments = totalPaid > 0;
  const hasShipping = shippingAmount > 0;


  const totalsRows: TotalsRow[] = [
    { label: 'Subtotal', value: formatCurrency(computedSubtotal) },
  ];

  if (hasShipping) {
    totalsRows.push({
      label: 'Shipping',
      value: formatCurrency(shippingAmount),
      note: invoice.shipping_note || null,
    });
  }

  // Deposit line (when billed_percentage < 100)
  if (isDeposit) {
    totalsRows.push({
      label: `Deposit (${billedPct}%)`,
      value: formatCurrency(billedTotal),
      emphasis: true,
    });
  }

  // Blanket-level payments credited to this child (prorated, never credited twice)
  if (depositCredit > 0.005) {
    totalsRows.push({
      label: invoice.deposit_credit_label || 'Less Blanket Payments',
      value: `(${formatCurrency(depositCredit)})`,
    });
  }

  // Less Deposit / Payments
  if (hasPayments) {
    totalsRows.push({ label: 'Less Payments', value: `(${formatCurrency(totalPaid)})` });
  }

  const totalsHeight = totalsRows.length * 9 + 16;
  finalY = ensureRoom(doc, finalY, totalsHeight);

  let footerY = drawTotals(doc, finalY + 5, {
    rows: totalsRows,
    grandLabel: 'BALANCE DUE',
    grandValue: formatCurrency(hasPayments || depositCredit > 0.005 ? balance : billedTotal),
    width: 85,
  });

  // ============ TERMS / NOTES ============
  footerY += 12;

  if (invoice.notes) {
    footerY = ensureRoom(doc, footerY, 24);
    footerY = drawNotes(doc, footerY, 'NOTES', invoice.notes) + 8;
  }

  footerY = ensureRoom(doc, footerY, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...DOC_COLORS.muted);
  doc.text('All remaining amounts are due on the agreed upon terms.', DOC.MARGIN, footerY);

  drawFooter(doc);

  return doc;
};

export const generateInvoicePDF = async (
  invoice: InvoiceData,
  order: OrderData
): Promise<void> => {
  const doc = await renderInvoiceToDoc(invoice, order);
  doc.save(`Invoice_${invoice.invoice_number}.pdf`);
};

/**
 * Generate invoice PDF and return as base64 string (for email attachment).
 */
export const generateInvoicePDFBase64 = async (
  invoice: InvoiceData,
  order: OrderData
): Promise<string> => {
  const doc = await renderInvoiceToDoc(invoice, order);
  return doc.output('datauristring').split(',')[1];
};

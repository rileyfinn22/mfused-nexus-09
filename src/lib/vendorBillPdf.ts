import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DOC,
  DOC_COLORS,
  docTableStyles,
  drawDetailRows,
  drawDocumentTitle,
  drawFooter,
  drawMastheadSync,
  drawNotes,
  ensureRoom,
} from "@/lib/pdfDocument";

// A one-page record of a vendor bill. Every bill can be downloaded, including the ones migrated
// off the PO that have no document of their own -- those are exactly the ones you cannot open
// otherwise. Where the vendor sent an actual file it stays available separately; this is the
// record of what we entered against it.
//
// It always states the three references you need to match it up: our PO number, the vendor's own
// invoice number when we have one, and the Vibe invoice(s) the PO was raised against.

export interface VendorBillPdfData {
  poNumber: string;
  vendorName?: string | null;
  invoiceNumber?: string | null;
  billDate?: string | null;
  dueDate?: string | null;
  subtotal: number;
  freight: number;
  total: number;
  currency?: string | null;
  status?: string | null;
  source?: string | null;
  vibeInvoiceNumbers?: string[];
  customerPO?: string | null;
  documentName?: string | null;
  notes?: string | null;
}

const money = (n: number, currency: string) =>
  `${currency === 'USD' ? '$' : ''}${Number(n || 0).toFixed(2)}${currency && currency !== 'USD' ? ' ' + currency : ''}`;

const asDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

export function downloadVendorBillPdf(data: VendorBillPdfData) {
  const doc = new jsPDF();
  const currency = data.currency || 'USD';

  drawMastheadSync(doc);

  let y = drawDocumentTitle(doc, {
    label: 'VENDOR BILL',
    value: data.invoiceNumber || data.poNumber || '—',
    metaLabel: 'Bill Date',
    metaValue: asDate(data.billDate),
  });

  if (data.status === 'draft') {
    // Internal record: say plainly it is not confirmed rather than letting the
    // figures read as settled.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(180, 83, 9);
    doc.text('DRAFT — NOT YET CONFIRMED', DOC.MARGIN, y);
    y += 8;
  }

  y = drawDetailRows(
    doc,
    DOC.MARGIN,
    y,
    [
      ['Our PO', data.poNumber || '—'],
      ["Vendor's invoice #", data.invoiceNumber || '—'],
      ['Vendor', data.vendorName || '—'],
      ['Vibe invoice', data.vibeInvoiceNumbers?.length ? data.vibeInvoiceNumbers.join(', ') : '—'],
      ['Customer PO', data.customerPO || '—'],
      ['Due date', asDate(data.dueDate)],
    ],
    { label: 'REFERENCES', valueOffset: 46 }
  ) + 10;

  autoTable(doc, {
    ...docTableStyles(),
    startY: y,
    head: [['', 'AMOUNT']],
    body: [
      ['Goods', money(data.subtotal, currency)],
      ['Freight', money(data.freight, currency)],
      ['Total', money(data.total, currency)],
    ],
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 45, halign: 'right', fontStyle: 'bold', textColor: DOC_COLORS.ink },
    },
    didParseCell: (hook: any) => {
      if (hook.section !== 'body') return;
      hook.cell.styles.lineColor = DOC_COLORS.rule;
      hook.cell.styles.lineWidth = { top: 0, right: 0, bottom: 0.1, left: 0 };
      if (hook.row.index === 2) {
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.fontSize = 10.5;
        hook.cell.styles.textColor = DOC_COLORS.ink;
        hook.cell.styles.lineWidth = { top: 0.4, right: 0, bottom: 0, left: 0 };
      }
    },
  });

  let afterY = ensureRoom(doc, (doc as any).lastAutoTable.finalY + 12, 20);

  if (data.documentName) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DOC_COLORS.muted);
    doc.text(`Vendor document on file: ${data.documentName}`, DOC.MARGIN, afterY);
    afterY += 10;
  }

  if (data.notes) {
    afterY = ensureRoom(doc, afterY, 24);
    drawNotes(doc, afterY, 'NOTES', data.notes);
  }

  drawFooter(doc, 'Internal record of the bill entered against this PO.');

  const safePo = String(data.poNumber || 'PO').replace(/[^\w.-]+/g, '_');
  const safeInv = data.invoiceNumber ? `-${String(data.invoiceNumber).replace(/[^\w.-]+/g, '_')}` : '';
  doc.save(`vendor-bill-${safePo}${safeInv}.pdf`);
}

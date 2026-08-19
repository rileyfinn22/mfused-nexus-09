import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const pageWidth = doc.internal.pageSize.getWidth();
  const currency = data.currency || 'USD';
  const primaryGreen: [number, number, number] = [22, 101, 52];
  const mediumGray: [number, number, number] = [110, 110, 110];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text('VENDOR BILL', 14, 20);

  if (data.status === 'draft') {
    doc.setFontSize(10);
    doc.setTextColor(180, 83, 9);
    doc.text('DRAFT — not yet confirmed', 14, 27);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  let y = data.status === 'draft' ? 37 : 32;

  const refs: Array<[string, string]> = [
    ['Our PO', data.poNumber || '—'],
    ["Vendor's invoice #", data.invoiceNumber || '—'],
    ['Vendor', data.vendorName || '—'],
    ['Vibe invoice', data.vibeInvoiceNumbers?.length ? data.vibeInvoiceNumbers.join(', ') : '—'],
    ['Customer PO', data.customerPO || '—'],
    ['Bill date', asDate(data.billDate)],
    ['Due date', asDate(data.dueDate)],
  ];

  refs.forEach(([label, value]) => {
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text(label, 14, y);
    doc.setTextColor(30, 30, 30);
    doc.text(String(value), 60, y);
    y += 6;
  });

  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['', 'AMOUNT']],
    body: [
      ['Goods', money(data.subtotal, currency)],
      ['Freight', money(data.freight, currency)],
      ['Total', money(data.total, currency)],
    ],
    theme: 'plain',
    headStyles: {
      fillColor: primaryGreen, textColor: 255, fontStyle: 'bold', fontSize: 9, cellPadding: 4,
    },
    bodyStyles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.row.index === 2) {
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.fontSize = 11;
      }
    },
  });

  let afterY = (doc as any).lastAutoTable.finalY + 10;

  if (data.documentName) {
    doc.setFontSize(9);
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text(`Vendor document on file: ${data.documentName}`, 14, afterY);
    afterY += 6;
  }

  if (data.notes) {
    doc.setFontSize(9);
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    const lines = doc.splitTextToSize(data.notes, pageWidth - 28);
    doc.text(lines, 14, afterY);
  }

  const safePo = String(data.poNumber || 'PO').replace(/[^\w.-]+/g, '_');
  const safeInv = data.invoiceNumber ? `-${String(data.invoiceNumber).replace(/[^\w.-]+/g, '_')}` : '';
  doc.save(`vendor-bill-${safePo}${safeInv}.pdf`);
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface QuantityTier {
  qty: number;
  unit_price: number;
  note?: string;
}

interface PriceBreak {
  qty: number;
  unit_price: number;
  label?: string;
  note?: string;
  tiers?: QuantityTier[];
}

interface QuoteItem {
  sku: string;
  name: string;
  description: string | null;
  state: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  price_breaks: PriceBreak[];
  selected_tier: number | null;
}

interface Quote {
  quote_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_name: string | null;
  shipping_street: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  terms: string | null;
  valid_until: string | null;
  description: string | null;
  subtotal: number;
  tax: number;
  shipping_cost: number;
  shipping_method: string | null;
  lead_time?: string | null;
  total: number;
  created_at: string;
}

// Vibe Packaging brand colors
const COLORS = {
  primaryGreen: [76, 175, 80] as [number, number, number],
  darkGray: [51, 51, 51] as [number, number, number],
  mediumGray: [100, 100, 100] as [number, number, number],
  lightGray: [248, 248, 248] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export async function generateQuotePDF(quote: Quote, items: QuoteItem[]): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ============ HEADER ============
  let yPos = 15;

  // Company name + address on left
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryGreen);
  doc.text('ArmorPak Inc. DBA Vibe Packaging', 14, yPos);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.mediumGray);
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
  } catch {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryGreen);
    doc.text('VIBE', pageWidth - 14, yPos + 8, { align: 'right' });
  }

  yPos += 28;

  // Green divider
  doc.setDrawColor(...COLORS.primaryGreen);
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth - 14, yPos);

  yPos += 12;

  // ============ QUOTE TITLE ============
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.darkGray);
  doc.text('Quote', 14, yPos);

  yPos += 15;

  // ============ CUSTOMER & DETAILS SECTION ============
  const leftColX = 14;
  const rightColX = pageWidth / 2 + 10;

  // Customer info on left
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.mediumGray);
  doc.text('Prepared for', leftColX, yPos);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.darkGray);
  doc.text(quote.customer_name, leftColX, yPos + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.mediumGray);

  let custY = yPos + 14;
  if (quote.customer_email) {
    doc.text(quote.customer_email, leftColX, custY);
    custY += 5;
  }
  if (quote.customer_phone) {
    doc.text(quote.customer_phone, leftColX, custY);
    custY += 5;
  }

  // Ship-to under customer info
  if (quote.shipping_street) {
    custY += 3;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.mediumGray);
    doc.text('Ship to', leftColX, custY);
    doc.setFont('helvetica', 'normal');
    custY += 6;
    if (quote.shipping_name) {
      doc.text(quote.shipping_name, leftColX, custY);
      custY += 5;
    }
    doc.text(quote.shipping_street, leftColX, custY);
    custY += 5;
    doc.text(`${quote.shipping_city || ''}, ${quote.shipping_state || ''} ${quote.shipping_zip || ''}`, leftColX, custY);
  }

  // Quote details on right
  const detailsStartY = yPos;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.mediumGray);

  const detailRows: [string, string][] = [
    ['Quote #:', quote.quote_number],
    ['Date:', new Date(quote.created_at).toLocaleDateString()],
  ];
  if (quote.valid_until) {
    detailRows.push(['Valid Until:', new Date(quote.valid_until).toLocaleDateString()]);
  }
  if (quote.terms) detailRows.push(['Terms:', quote.terms]);
  if (quote.shipping_method) {
    const methodLabel = quote.shipping_method === 'domestic' ? 'Domestic'
      : quote.shipping_method === 'air' ? 'Air Freight'
      : quote.shipping_method === 'ocean' ? 'Ocean Freight'
      : quote.shipping_method;
    detailRows.push(['Shipping:', methodLabel]);
  }

  detailRows.forEach(([label, value], i) => {
    const rowY = detailsStartY + i * 7;
    doc.setTextColor(...COLORS.mediumGray);
    doc.setFont('helvetica', 'normal');
    doc.text(label, rightColX, rowY);
    doc.setTextColor(...COLORS.darkGray);
    doc.setFont('helvetica', 'bold');
    doc.text(value, rightColX + 45, rowY);
  });

  yPos = Math.max(custY + 10, detailsStartY + detailRows.length * 7 + 10, yPos + 40);

  // ============ ITEMS TABLE ============
  const tableBody: (string | { content: string; colSpan?: number; styles?: any })[][] = [];

  items.forEach((item) => {
    const hasPriceBreaks = item.price_breaks && item.price_breaks.length > 0;
    const isDescriptionMode = item.quantity === 0 && item.description;
    const descLine = item.description ? `\n${item.description}` : '';

    if (isDescriptionMode) {
      tableBody.push([
        { content: `${item.name}\n${item.sku}${item.state ? ` (${item.state})` : ''}\n\n${item.description}`, colSpan: 4, styles: { fontStyle: 'normal' } }
      ]);
    } else if (hasPriceBreaks) {
      tableBody.push([
        { content: `${item.name}\n${item.sku}${item.state ? ` (${item.state})` : ''}${descLine}`, colSpan: 4, styles: { fontStyle: 'bold', fillColor: COLORS.lightGray } }
      ]);
      item.price_breaks.forEach((pb, i) => {
        const label = pb.label?.trim() ? pb.label : `Option ${i + 1}`;
        const tiers = pb.tiers && pb.tiers.length > 0 ? pb.tiers : null;
        if (tiers) {
          tableBody.push([
            { content: `  ${label}`, colSpan: 4, styles: { fontStyle: 'bold' } }
          ]);
          tiers.forEach((t) => {
            tableBody.push([
              `      ${t.qty.toLocaleString()} units`,
              formatUnitPrice(t.unit_price),
              t.qty.toLocaleString(),
              formatCurrency(t.qty * t.unit_price)
            ]);
          });
        } else {
          tableBody.push([
            `  ${label}`,
            formatUnitPrice(pb.unit_price),
            pb.qty.toLocaleString(),
            formatCurrency(pb.qty * pb.unit_price)
          ]);
        }
      });
    } else {
      tableBody.push([
        `${item.name}\n${item.sku}${item.state ? ` (${item.state})` : ''}${descLine}`,
        formatUnitPrice(item.unit_price),
        item.quantity.toLocaleString(),
        formatCurrency(item.total)
      ]);
    }
  });

  autoTable(doc, {
    startY: yPos,
    head: [['ITEM', 'UNIT PRICE', 'QTY', 'TOTAL']],
    body: tableBody,
    theme: 'plain',
    headStyles: {
      fillColor: COLORS.primaryGreen,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 4
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 4,
      textColor: COLORS.darkGray,
      lineWidth: 0
    },
    alternateRowStyles: {
      fillColor: COLORS.lightGray
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: 'right', cellWidth: 35 },
      2: { halign: 'center', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 35, fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 },
    showHead: 'firstPage',
    tableLineWidth: 0
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const hasAnyPriceBreaks = items.some(item => item.price_breaks && item.price_breaks.length > 0);

  // ============ TOTALS SECTION ============
  if (!hasAnyPriceBreaks) {
    const totalsWidth = 85;
    const totalsX = pageWidth - totalsWidth - 14;
    let totalsY = finalY + 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.darkGray);

    doc.text('Subtotal', totalsX, totalsY);
    doc.text(formatCurrency(quote.subtotal), totalsX + totalsWidth, totalsY, { align: 'right' });
    totalsY += 8;

    if (quote.shipping_cost > 0) {
      doc.text('Shipping', totalsX, totalsY);
      doc.text(formatCurrency(quote.shipping_cost), totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 8;
    }

    if (quote.tax > 0) {
      doc.text('Tax', totalsX, totalsY);
      doc.text(formatCurrency(quote.tax), totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 8;
    }

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totalsX, totalsY, totalsX + totalsWidth, totalsY);
    totalsY += 6;

    // Total - emphasized
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryGreen);
    doc.text('TOTAL', totalsX, totalsY);
    doc.text(formatCurrency(quote.total), totalsX + totalsWidth, totalsY, { align: 'right' });
  } else {
    // Note about pricing tiers
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...COLORS.mediumGray);
    doc.text('* Pricing shown per shipping option. Customer selects preferred option.', 14, finalY);
  }

  // ============ NOTES ============
  if (quote.description) {
    const notesY = hasAnyPriceBreaks ? finalY + 15 : finalY + 35;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.darkGray);
    doc.text('Notes:', 14, notesY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.mediumGray);
    const notesLines = doc.splitTextToSize(quote.description, pageWidth - 28);
    doc.text(notesLines, 14, notesY + 6);
  }

  // ============ FOOTER ============
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryGreen);
  doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });

  doc.save(`${quote.quote_number}.pdf`);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUnitPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

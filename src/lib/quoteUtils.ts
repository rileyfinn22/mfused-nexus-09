import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { measureRichText, drawRichText } from './pdfRichText';

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

// Professional palette — charcoal/slate, no lime green
const COLORS = {
  ink: [35, 41, 49] as [number, number, number],          // headings / body emphasis
  body: [70, 78, 89] as [number, number, number],         // body text
  muted: [120, 128, 138] as [number, number, number],     // labels / secondary
  rule: [220, 224, 230] as [number, number, number],      // dividers
  headerBg: [245, 246, 248] as [number, number, number],  // table header band
  rowAlt: [250, 251, 252] as [number, number, number],    // subtle zebra
  productBand: [35, 41, 49] as [number, number, number],  // dark product header
  optionBand: [240, 242, 245] as [number, number, number],
};

export async function generateQuotePDF(quote: Quote, items: QuoteItem[]): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const MARGIN = 16;

  // ============ HEADER ============
  let yPos = 18;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.ink);
  doc.text('ArmorPak Inc. DBA Vibe Packaging', MARGIN, yPos);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.muted);
  doc.text('1415 S 700 W  ·  Salt Lake City, UT 84104  ·  www.vibepkg.com', MARGIN, yPos + 6);

  // Logo right
  try {
    const logoResponse = await fetch('/images/vibe-logo.png');
    const logoBlob = await logoResponse.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
    doc.addImage(logoBase64, 'PNG', pageWidth - MARGIN - 36, yPos - 8, 36, 22);
  } catch {
    // Silent fallback — no colored mark
  }

  yPos += 16;

  // Subtle neutral divider (no lime green)
  doc.setDrawColor(...COLORS.rule);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, yPos, pageWidth - MARGIN, yPos);

  yPos += 14;

  // ============ QUOTE TITLE ============
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.muted);
  doc.text('QUOTE', MARGIN, yPos);

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.ink);
  doc.text(quote.quote_number, MARGIN, yPos + 9);

  // Date block right-aligned
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.muted);
  const dateLabel = new Date(quote.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text('Issued', pageWidth - MARGIN, yPos, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.ink);
  doc.setFontSize(10);
  doc.text(dateLabel, pageWidth - MARGIN, yPos + 6, { align: 'right' });

  yPos += 18;

  // ============ BILL TO + DETAILS ============
  const leftColX = MARGIN;
  const rightColX = pageWidth / 2 + 4;
  const detailsStartY = yPos;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.muted);
  doc.text('PREPARED FOR', leftColX, yPos);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.ink);
  doc.text(quote.customer_name, leftColX, yPos + 7);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.body);

  let custY = yPos + 13;
  if (quote.customer_email) { doc.text(quote.customer_email, leftColX, custY); custY += 5; }
  if (quote.customer_phone) { doc.text(quote.customer_phone, leftColX, custY); custY += 5; }

  if (quote.shipping_street) {
    custY += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('SHIP TO', leftColX, custY);
    custY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.body);
    if (quote.shipping_name) { doc.text(quote.shipping_name, leftColX, custY); custY += 5; }
    doc.text(quote.shipping_street, leftColX, custY); custY += 5;
    doc.text(`${quote.shipping_city || ''}, ${quote.shipping_state || ''} ${quote.shipping_zip || ''}`, leftColX, custY);
  }

  // Details right
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.muted);
  doc.text('DETAILS', rightColX, detailsStartY);

  const detailRows: [string, string][] = [];
  if (quote.valid_until) detailRows.push(['Valid Until', new Date(quote.valid_until).toLocaleDateString()]);
  if (quote.terms) detailRows.push(['Terms', quote.terms]);
  if (quote.shipping_method) {
    const methodLabel = quote.shipping_method === 'domestic' ? 'Domestic'
      : quote.shipping_method === 'air' ? 'Air Freight'
      : quote.shipping_method === 'ocean' ? 'Ocean Freight'
      : quote.shipping_method;
    detailRows.push(['Shipping', methodLabel]);
  }
  if (quote.lead_time) detailRows.push(['Lead Time', quote.lead_time]);

  detailRows.forEach(([label, value], i) => {
    const rowY = detailsStartY + 7 + i * 6;
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label, rightColX, rowY);
    doc.setTextColor(...COLORS.ink);
    doc.setFont('helvetica', 'bold');
    doc.text(value, rightColX + 38, rowY);
  });

  yPos = Math.max(custY + 12, detailsStartY + 7 + detailRows.length * 6 + 10, yPos + 40);

  // ============ ITEMS TABLE ============
  type Row = (string | { content: string; colSpan?: number })[];
  const tableBody: Row[] = [];
  // Per-row metadata: kind + optional descriptionHtml for rich rendering
  type Kind = 'product' | 'description' | 'option' | 'tier' | 'simple';
  const rowMeta: { kind: Kind; descHtml?: string }[] = [];

  const DESC_COL = 0;

  const allDescriptionOnly = items.length > 0 && items.every(
    (it) => it.quantity === 0 && !!it.description && (!it.price_breaks || it.price_breaks.length === 0)
  );
  const FULL_SPAN = allDescriptionOnly ? 1 : 4;

  const pushProductRow = (headerLine: string, descHtml?: string) => {
    tableBody.push([{ content: headerLine, colSpan: FULL_SPAN }]);
    rowMeta.push({ kind: 'product' });
    if (descHtml) {
      tableBody.push([{ content: '', colSpan: FULL_SPAN }]);
      rowMeta.push({ kind: 'description', descHtml });
    }
  };

  items.forEach((item) => {
    const hasPriceBreaks = item.price_breaks && item.price_breaks.length > 0;
    const isDescriptionMode = item.quantity === 0 && item.description;
    const headerLine = `${item.name}    ${item.sku}${item.state ? `  ·  ${item.state}` : ''}`;

    if (isDescriptionMode) {
      pushProductRow(headerLine, item.description!);
    } else if (hasPriceBreaks) {
      pushProductRow(headerLine, item.description || undefined);
      item.price_breaks.forEach((pb, i) => {
        const label = pb.label?.trim() ? pb.label : `Option ${i + 1}`;
        const noteSuffix = pb.note?.trim() ? `\n${pb.note.trim()}` : '';
        const tiers = pb.tiers && pb.tiers.length > 0 ? pb.tiers : null;

        if (tiers) {
          tableBody.push([{ content: `${label}${noteSuffix}`, colSpan: FULL_SPAN }]);
          rowMeta.push({ kind: 'option' });
          tiers.forEach((t) => {
            const tNote = t.note?.trim() ? `\n${t.note.trim()}` : '';
            tableBody.push([
              `${t.qty.toLocaleString()} units${tNote}`,
              formatUnitPrice(t.unit_price),
              t.qty.toLocaleString(),
              formatCurrency(t.qty * t.unit_price),
            ]);
            rowMeta.push({ kind: 'tier' });
          });
        } else {
          tableBody.push([
            `${label}${noteSuffix}`,
            formatUnitPrice(pb.unit_price),
            pb.qty.toLocaleString(),
            formatCurrency(pb.qty * pb.unit_price),
          ]);
          rowMeta.push({ kind: 'option' });
        }
      });
    } else {
      pushProductRow(headerLine, item.description || undefined);
      tableBody.push([
        '',
        formatUnitPrice(item.unit_price),
        item.quantity.toLocaleString(),
        formatCurrency(item.total),
      ]);
      rowMeta.push({ kind: 'simple' });
    }
  });

  const tableInnerWidth = pageWidth - MARGIN * 2;
  const headRow = allDescriptionOnly
    ? [['ITEM']]
    : [['ITEM', 'UNIT PRICE', 'QTY', 'TOTAL']];

  // Pre-measure description heights so cells reserve correct space
  const descHeights: Record<number, number> = {};
  rowMeta.forEach((m, i) => {
    if (m.kind === 'description' && m.descHtml) {
      const widthAvailable = tableInnerWidth - 12;
      const { totalHeight } = measureRichText(doc, m.descHtml, widthAvailable, 9);
      descHeights[i] = totalHeight + 6;
    }
  });

  autoTable(doc, {
    startY: yPos,
    head: headRow,
    body: tableBody,
    theme: 'plain',
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: COLORS.muted,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 6 },
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 6 },
      textColor: COLORS.body,
      lineWidth: 0,
    },
    columnStyles: allDescriptionOnly
      ? { 0: { cellWidth: tableInnerWidth } }
      : {
          0: { cellWidth: 92 },
          1: { halign: 'right', cellWidth: 28 },
          2: { halign: 'right', cellWidth: 22 },
          3: { halign: 'right', cellWidth: tableInnerWidth - 92 - 28 - 22, fontStyle: 'bold' },
        },
    margin: { left: MARGIN, right: MARGIN, bottom: 24 },
    showHead: 'firstPage',
    tableLineWidth: 0,
    willDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return;
      const meta = rowMeta[data.row.index];
      if (!meta || meta.kind !== 'product') return;
      // Keep product header together with following description row (and any first child row)
      let groupH = data.row.height || 14;
      for (let i = data.row.index + 1; i < rowMeta.length && i <= data.row.index + 2; i++) {
        const m = rowMeta[i];
        if (!m) break;
        const r = (data.table.body as any[])[i];
        groupH += (r?.height) || 12;
        if (m.kind !== 'description') break;
      }
      const pageH = doc.internal.pageSize.getHeight();
      const bottomLimit = pageH - 24;
      if (data.cursor && data.cursor.y + groupH > bottomLimit && data.cursor.y > 40) {
        doc.addPage();
        data.cursor.y = 20;
      }
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const meta = rowMeta[data.row.index];
      if (!meta) return;

      if (meta.kind === 'product') {
        data.cell.styles.fillColor = [232, 235, 239] as any;
        data.cell.styles.textColor = COLORS.ink;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 10.5;
        data.cell.styles.cellPadding = { top: 6, right: 6, bottom: 6, left: 10 };
      } else if (meta.kind === 'description') {
        data.cell.text = [''];
        data.cell.styles.fillColor = COLORS.rowAlt;
        data.cell.styles.cellPadding = { top: 4, right: 6, bottom: 6, left: 10 };
        if (data.column.index === DESC_COL) {
          data.cell.styles.minCellHeight = descHeights[data.row.index] || 10;
        }
      } else if (meta.kind === 'option') {
        data.cell.styles.fillColor = COLORS.optionBand;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = COLORS.ink;
      } else if (meta.kind === 'tier') {
        if (data.column.index === 0) {
          data.cell.styles.cellPadding = { top: 3, right: 4, bottom: 3, left: 14 };
          data.cell.styles.textColor = COLORS.muted;
        }
      }

      data.cell.styles.lineColor = COLORS.rule;
      if (meta.kind === 'product') {
        data.cell.styles.lineWidth = { top: 0.4, right: 0, bottom: 0, left: 0 } as any;
      } else if (meta.kind === 'description') {
        data.cell.styles.lineWidth = { top: 0, right: 0, bottom: 0.2, left: 0 } as any;
      } else {
        data.cell.styles.lineWidth = { top: 0, right: 0, bottom: 0.1, left: 0 } as any;
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const meta = rowMeta[data.row.index];
      if (!meta) return;

      if (meta.kind === 'product' && data.column.index === 0) {
        doc.setFillColor(...COLORS.ink);
        doc.rect(data.cell.x, data.cell.y + 2, 1.6, data.cell.height - 4, 'F');
      }

      if (meta.kind === 'description' && data.column.index === DESC_COL && meta.descHtml) {
        const x = data.cell.x + 10;
        const y = data.cell.y + 4;
        const width = tableInnerWidth - 16;
        drawRichText(doc, meta.descHtml, x, y, width, 9);
      }
    },
  });

  let finalY = (doc as any).lastAutoTable.finalY + 10;
  const hasAnyPriceBreaks = items.some((item) => item.price_breaks && item.price_breaks.length > 0);

  const FOOTER_RESERVE = 24;
  const ensureRoom = (needed: number) => {
    if (finalY + needed > pageHeight - FOOTER_RESERVE) {
      doc.addPage();
      finalY = 20;
    }
  };

  // ============ TOTALS ============
  if (!hasAnyPriceBreaks) {
    const totalsHeight = 8 + (quote.shipping_cost > 0 ? 7 : 0) + (quote.tax > 0 ? 7 : 0) + 14;
    ensureRoom(totalsHeight + 5);

    const totalsWidth = 80;
    const totalsX = pageWidth - totalsWidth - MARGIN;
    let totalsY = finalY + 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.body);
    doc.text('Subtotal', totalsX, totalsY);
    doc.text(formatCurrency(quote.subtotal), totalsX + totalsWidth, totalsY, { align: 'right' });
    totalsY += 7;

    if (quote.shipping_cost > 0) {
      doc.text('Shipping', totalsX, totalsY);
      doc.text(formatCurrency(quote.shipping_cost), totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 7;
    }
    if (quote.tax > 0) {
      doc.text('Tax', totalsX, totalsY);
      doc.text(formatCurrency(quote.tax), totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 7;
    }

    doc.setDrawColor(...COLORS.rule);
    doc.setLineWidth(0.3);
    doc.line(totalsX, totalsY, totalsX + totalsWidth, totalsY);
    totalsY += 6;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.ink);
    doc.text('TOTAL', totalsX, totalsY);
    doc.text(formatCurrency(quote.total), totalsX + totalsWidth, totalsY, { align: 'right' });
    finalY = totalsY + 6;
  } else {
    ensureRoom(10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...COLORS.muted);
    doc.text('* Pricing shown per shipping option. Customer selects preferred option.', MARGIN, finalY);
    finalY += 6;
  }

  // ============ NOTES (rich text) ============
  if (quote.description) {
    const widthAvailable = pageWidth - MARGIN * 2;
    const { totalHeight } = measureRichText(doc, quote.description, widthAvailable, 9);
    const notesHeight = 8 + totalHeight;
    ensureRoom(notesHeight + 10);
    const notesY = finalY + 10;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.muted);
    doc.text('NOTES', MARGIN, notesY);
    drawRichText(doc, quote.description, MARGIN, notesY + 3, widthAvailable, 9);
  }

  // ============ FOOTER ============
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COLORS.rule);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageHeight - 14, pageWidth - MARGIN, pageHeight - 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    doc.text('Thank you for your business.', MARGIN, pageHeight - 8);
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 8, { align: 'right' });
  }

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

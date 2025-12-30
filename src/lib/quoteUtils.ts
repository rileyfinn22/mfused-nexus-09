import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PriceBreak {
  qty: number;
  unit_price: number;
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
  total: number;
  created_at: string;
}

export function generateQuotePDF(quote: Quote, items: QuoteItem[]): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTE', pageWidth / 2, 25, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(quote.quote_number, pageWidth / 2, 33, { align: 'center' });
  
  // Quote Info
  let yPos = 50;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Quote Details', 14, yPos);
  
  doc.setFont('helvetica', 'normal');
  yPos += 7;
  doc.text(`Date: ${new Date(quote.created_at).toLocaleDateString()}`, 14, yPos);
  yPos += 5;
  if (quote.valid_until) {
    doc.text(`Valid Until: ${new Date(quote.valid_until).toLocaleDateString()}`, 14, yPos);
    yPos += 5;
  }
  doc.text(`Terms: ${quote.terms || 'Net 30'}`, 14, yPos);
  
  // Customer Info
  yPos = 50;
  doc.setFont('helvetica', 'bold');
  doc.text('Customer', pageWidth / 2, yPos);
  
  doc.setFont('helvetica', 'normal');
  yPos += 7;
  doc.text(quote.customer_name, pageWidth / 2, yPos);
  if (quote.customer_email) {
    yPos += 5;
    doc.text(quote.customer_email, pageWidth / 2, yPos);
  }
  if (quote.customer_phone) {
    yPos += 5;
    doc.text(quote.customer_phone, pageWidth / 2, yPos);
  }
  
  // Shipping Address
  if (quote.shipping_street) {
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Ship To', pageWidth / 2, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 7;
    if (quote.shipping_name) {
      doc.text(quote.shipping_name, pageWidth / 2, yPos);
      yPos += 5;
    }
    doc.text(quote.shipping_street, pageWidth / 2, yPos);
    yPos += 5;
    doc.text(`${quote.shipping_city}, ${quote.shipping_state} ${quote.shipping_zip}`, pageWidth / 2, yPos);
  }
  
  // Items Table
  const tableStartY = Math.max(yPos + 15, 100);
  
  // Prepare table data - handle price tiers
  const tableBody: (string | { content: string; colSpan?: number; styles?: any })[][] = [];
  
  items.forEach((item) => {
    const hasPriceBreaks = item.price_breaks && item.price_breaks.length > 0;
    
    if (hasPriceBreaks) {
      // Add item header row
      tableBody.push([
        { content: `${item.name}\n${item.sku}${item.state ? ` (${item.state})` : ''}`, colSpan: 4, styles: { fontStyle: 'bold' } }
      ]);
      
      // Add each price tier
      item.price_breaks.forEach((pb) => {
        tableBody.push([
          `  Tier: ${pb.qty.toLocaleString()} units`,
          formatCurrency(pb.unit_price),
          pb.qty.toLocaleString(),
          formatCurrency(pb.qty * pb.unit_price)
        ]);
      });
    } else {
      // Regular item without tiers
      tableBody.push([
        `${item.name}\n${item.sku}${item.state ? ` (${item.state})` : ''}`,
        formatCurrency(item.unit_price),
        item.quantity.toString(),
        formatCurrency(item.total)
      ]);
    }
  });
  
  autoTable(doc, {
    startY: tableStartY,
    head: [['Item', 'Unit Price', 'Qty', 'Total']],
    body: tableBody,
    theme: 'striped',
    headStyles: { fillColor: [51, 51, 51] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: 'right', cellWidth: 35 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 35 }
    },
    styles: { fontSize: 9 }
  });
  
  // Get final Y position after table
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  
  // Check if any items have price breaks - if so, don't show totals
  const hasAnyPriceBreaks = items.some(item => item.price_breaks && item.price_breaks.length > 0);
  
  if (!hasAnyPriceBreaks) {
    // Totals section - only if no price breaks
    const totalsX = pageWidth - 70;
    let totalsY = finalY;
    
    doc.setFontSize(10);
    doc.text('Subtotal:', totalsX, totalsY);
    doc.text(formatCurrency(quote.subtotal), pageWidth - 14, totalsY, { align: 'right' });
    
    if (quote.shipping_cost > 0) {
      totalsY += 6;
      doc.text('Shipping:', totalsX, totalsY);
      doc.text(formatCurrency(quote.shipping_cost), pageWidth - 14, totalsY, { align: 'right' });
    }
    
    if (quote.tax > 0) {
      totalsY += 6;
      doc.text('Tax:', totalsX, totalsY);
      doc.text(formatCurrency(quote.tax), pageWidth - 14, totalsY, { align: 'right' });
    }
    
    totalsY += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Total:', totalsX, totalsY);
    doc.text(formatCurrency(quote.total), pageWidth - 14, totalsY, { align: 'right' });
  } else {
    // Note about pricing tiers
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('* Pricing shown per tier. Final total depends on quantity selected.', 14, finalY);
  }
  
  // Description/Notes
  if (quote.description) {
    const notesY = hasAnyPriceBreaks ? finalY + 15 : finalY + 30;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes:', 14, notesY);
    doc.setFont('helvetica', 'normal');
    doc.text(quote.description, 14, notesY + 6, { maxWidth: pageWidth - 28 });
  }
  
  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(128);
  doc.text('Thank you for your business!', pageWidth / 2, footerY, { align: 'center' });
  
  // Download
  doc.save(`${quote.quote_number}.pdf`);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

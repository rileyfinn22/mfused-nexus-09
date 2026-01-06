import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { formatCurrency, formatUnitPrice } from "@/lib/utils";

interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  total: number;
  total_paid?: number | null;
  subtotal?: number;
  tax?: number;
  shipping_cost?: number | null;
  notes?: string | null;
  companies?: { name: string } | null;
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

interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export const generateInvoicePDF = async (
  invoice: InvoiceData,
  order: OrderData
): Promise<void> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Colors
  const primaryGreen = [76, 175, 80];
  const darkGray = [51, 51, 51];
  const lightGray = [248, 248, 248];
  const mediumGray = [100, 100, 100];
  
  // ============ HEADER SECTION ============
  // Company info on left, logo on right
  let yPos = 15;
  
  // Company name and address on left
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text('ArmorPak Inc. DBA Vibe Packaging', 14, yPos);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text('1415 S 700 W', 14, yPos + 7);
  doc.text('Salt Lake City, UT 84104', 14, yPos + 12);
  doc.text('www.vibepkg.com', 14, yPos + 17);
  
  // Logo on right side of header
  try {
    const logoResponse = await fetch('/images/vibe-logo.png');
    const logoBlob = await logoResponse.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
    doc.addImage(logoBase64, 'PNG', pageWidth - 54, yPos - 5, 40, 25);
  } catch (error) {
    // Fallback text logo
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('VIBE', pageWidth - 14, yPos + 8, { align: 'right' });
  }
  
  yPos += 28;
  
  // Divider line
  doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth - 14, yPos);
  
  yPos += 12;
  
  // ============ INVOICE TITLE ============
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text('Invoice', 14, yPos);
  
  yPos += 15;
  
  // ============ BILLED TO & INVOICE DETAILS SECTION ============
  const leftColX = 14;
  const rightColX = pageWidth / 2 + 10;
  
  // Billed To section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text('Billed to', leftColX, yPos);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(invoice.companies?.name || order.customer_name, leftColX, yPos + 8);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  
  const billStreet = order.billing_street || order.shipping_street || '';
  const billCity = order.billing_city || order.shipping_city || '';
  const billState = order.billing_state || order.shipping_state || '';
  const billZip = order.billing_zip || order.shipping_zip || '';
  
  let billY = yPos + 14;
  if (billStreet) {
    doc.text(billStreet, leftColX, billY);
    billY += 5;
  }
  if (billCity) {
    doc.text(`${billCity}, ${billState} ${billZip}`, leftColX, billY);
    billY += 5;
  }
  if (order.po_number) {
    doc.setFont('helvetica', 'bold');
    doc.text(`PO: ${order.po_number}`, leftColX, billY);
  }
  
  // Invoice details on right
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  
  const detailsStartY = yPos;
  doc.text('Invoice #:', rightColX, detailsStartY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(invoice.invoice_number, rightColX + 45, detailsStartY);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text('Date:', rightColX, detailsStartY + 7);
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(format(new Date(invoice.invoice_date), 'MMM d, yyyy'), rightColX + 45, detailsStartY + 7);
  
  if (invoice.due_date) {
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Due Date:', rightColX, detailsStartY + 14);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(format(new Date(invoice.due_date), 'MMM d, yyyy'), rightColX + 45, detailsStartY + 14);
  }
  
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text('Order #:', rightColX, detailsStartY + 21);
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(order.order_number, rightColX + 45, detailsStartY + 21);
  
  yPos += 40;
  
  // ============ ITEMS TABLE ============
  const items = order.order_items || [];
  const tableData = items.map((item) => [
    item.sku || '',
    item.name || '',
    (item.quantity || 0).toLocaleString(),
    formatUnitPrice(item.unit_price || 0),
    formatCurrency((item.quantity || 0) * (item.unit_price || 0))
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['SKU', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT']],
    body: tableData,
    theme: 'plain',
    headStyles: { 
      fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]], 
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 4
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 4,
      textColor: [darkGray[0], darkGray[1], darkGray[2]],
      lineWidth: 0
    },
    alternateRowStyles: {
      fillColor: [lightGray[0], lightGray[1], lightGray[2]]
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 70 },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 },
    showHead: 'firstPage',
    tableLineWidth: 0
  });
  
  // Get final Y position after table
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  
  // ============ TOTALS SECTION ============
  const totalsWidth = 85;
  const totalsX = pageWidth - totalsWidth - 14;
  
  const totalPaid = invoice.total_paid || 0;
  const balance = (invoice.total || 0) - totalPaid;
  const hasPayments = totalPaid > 0;
  const hasShipping = (invoice.shipping_cost || 0) > 0;
  
  doc.setFontSize(9);
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  
  let totalsY = finalY + 5;
  
  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal', totalsX, totalsY);
  doc.text(formatCurrency(invoice.subtotal || invoice.total || 0), totalsX + totalsWidth, totalsY, { align: 'right' });
  totalsY += 8;
  
  // Shipping (if applicable)
  if (hasShipping) {
    doc.text('Shipping', totalsX, totalsY);
    doc.text(formatCurrency(invoice.shipping_cost || 0), totalsX + totalsWidth, totalsY, { align: 'right' });
    totalsY += 8;
  }
  
  // Less Deposit / Payments
  if (hasPayments) {
    doc.text('Less Deposit', totalsX, totalsY);
    doc.text(`(${formatCurrency(totalPaid)})`, totalsX + totalsWidth, totalsY, { align: 'right' });
    totalsY += 8;
  }
  
  // Divider line before balance
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(totalsX, totalsY, totalsX + totalsWidth, totalsY);
  totalsY += 6;
  
  // Balance Due - emphasized
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text('BALANCE DUE', totalsX, totalsY);
  doc.text(formatCurrency(hasPayments ? balance : (invoice.total || 0)), totalsX + totalsWidth, totalsY, { align: 'right' });
  
  // ============ TERMS/NOTES SECTION ============
  const termsY = totalsY + 20;
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text('All remaining amounts are due on the agreed upon terms. Thank you for your business!', 14, termsY);
  
  // Additional notes if present
  if (invoice.notes) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text('Notes:', 14, termsY + 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    const notesLines = doc.splitTextToSize(invoice.notes, pageWidth - 28);
    doc.text(notesLines, 14, termsY + 16);
  }
  
  // ============ FOOTER ============
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
  
  // Download the PDF
  doc.save(`Invoice_${invoice.invoice_number}.pdf`);
};

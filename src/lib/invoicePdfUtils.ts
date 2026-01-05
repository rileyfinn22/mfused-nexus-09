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
  const lightGray = [245, 245, 245];
  
  // ============ HEADER SECTION ============
  doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.rect(0, 0, pageWidth, 38, 'F');
  
  // Logo on left side of header
  try {
    const logoResponse = await fetch('/images/vibe-logo.png');
    const logoBlob = await logoResponse.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
    doc.addImage(logoBase64, 'PNG', 14, 6, 0, 26);
  } catch (error) {
    // Fallback text logo
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Vibe Packaging', 14, 24);
  }
  
  // INVOICE title on right side of header
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('INVOICE', pageWidth - 14, 24, { align: 'right' });
  
  let yPos = 52;
  
  // ============ INVOICE INFO & BILL TO SECTION ============
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.roundedRect(14, yPos - 5, 85, 45, 2, 2, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text('INVOICE DETAILS', 18, yPos + 2);
  
  doc.setFontSize(9);
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice #:', 18, yPos + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.invoice_number, 50, yPos + 12);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Date:', 18, yPos + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(format(new Date(invoice.invoice_date), 'MMM d, yyyy'), 50, yPos + 20);
  
  if (invoice.due_date) {
    doc.setFont('helvetica', 'bold');
    doc.text('Due Date:', 18, yPos + 28);
    doc.setFont('helvetica', 'normal');
    doc.text(format(new Date(invoice.due_date), 'MMM d, yyyy'), 50, yPos + 28);
  }
  
  doc.setFont('helvetica', 'bold');
  doc.text('Order #:', 18, yPos + 36);
  doc.setFont('helvetica', 'normal');
  doc.text(order.order_number, 50, yPos + 36);
  
  // Right side - Bill To
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.roundedRect(105, yPos - 5, 90, 45, 2, 2, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text('BILL TO', 109, yPos + 2);
  
  doc.setFontSize(9);
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.companies?.name || order.customer_name, 109, yPos + 12);
  doc.setFont('helvetica', 'normal');
  
  const billStreet = order.billing_street || order.shipping_street || '';
  const billCity = order.billing_city || order.shipping_city || '';
  const billState = order.billing_state || order.shipping_state || '';
  const billZip = order.billing_zip || order.shipping_zip || '';
  
  if (billStreet) doc.text(billStreet, 109, yPos + 20);
  if (billCity) doc.text(`${billCity}, ${billState} ${billZip}`, 109, yPos + 28);
  if (order.po_number) {
    doc.setFont('helvetica', 'bold');
    doc.text('PO #: ', 109, yPos + 36);
    doc.setFont('helvetica', 'normal');
    doc.text(order.po_number, 122, yPos + 36);
  }
  
  yPos += 55;
  
  // ============ ITEMS TABLE ============
  const items = order.order_items || [];
  const tableData = items.map((item) => [
    item.sku || '',
    item.name || '',
    (item.quantity || 0).toString(),
    formatUnitPrice(item.unit_price || 0),
    formatCurrency((item.quantity || 0) * (item.unit_price || 0))
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['SKU', 'Description', 'Qty', 'Unit Price', 'Amount']],
    body: tableData,
    theme: 'plain',
    headStyles: { 
      fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]], 
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 5
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 5,
      textColor: [darkGray[0], darkGray[1], darkGray[2]],
      lineWidth: 0
    },
    alternateRowStyles: {
      fillColor: [235, 235, 235]
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 75 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 },
    showHead: 'firstPage',
    tableLineWidth: 0
  });
  
  // Get final Y position after table
  let finalY = (doc as any).lastAutoTable.finalY + 15;
  
  // ============ TOTALS SECTION ============
  const totalsWidth = 80;
  const totalsX = pageWidth - totalsWidth - 14;
  
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  
  const totalPaid = invoice.total_paid || 0;
  const balance = (invoice.total || 0) - totalPaid;
  const hasPayments = totalPaid > 0;
  
  const totalsHeight = hasPayments ? 50 : 35;
  doc.roundedRect(totalsX, finalY, totalsWidth, totalsHeight, 2, 2, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  
  doc.text('Subtotal:', totalsX + 5, finalY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(formatCurrency(invoice.subtotal || invoice.total || 0), totalsX + totalsWidth - 5, finalY + 10, { align: 'right' });
  
  if ((invoice.shipping_cost || 0) > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('Shipping:', totalsX + 5, finalY + 18);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCurrency(invoice.shipping_cost || 0), totalsX + totalsWidth - 5, finalY + 18, { align: 'right' });
  }
  
  // Total line with green background
  doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.roundedRect(totalsX, finalY + 22, totalsWidth, 12, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL:', totalsX + 5, finalY + 30);
  doc.text(formatCurrency(invoice.total || 0), totalsX + totalsWidth - 5, finalY + 30, { align: 'right' });
  
  if (hasPayments) {
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFont('helvetica', 'normal');
    doc.text('Paid:', totalsX + 5, finalY + 42);
    doc.text(formatCurrency(totalPaid), totalsX + totalsWidth - 5, finalY + 42, { align: 'right' });
    
    doc.setFont('helvetica', 'bold');
    doc.text('Balance:', totalsX + 5, finalY + 50);
    doc.text(formatCurrency(balance), totalsX + totalsWidth - 5, finalY + 50, { align: 'right' });
  }
  
  // ============ NOTES SECTION ============
  if (invoice.notes) {
    const notesY = finalY + totalsHeight + 15;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('NOTES', 14, notesY);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    const notesLines = doc.splitTextToSize(invoice.notes, pageWidth - 28);
    doc.text(notesLines, 14, notesY + 8);
  }
  
  // ============ FOOTER ============
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 15, { align: 'center' });
  doc.text('Vibe Packaging LLC • hello@vibepackaging.com', pageWidth / 2, pageHeight - 10, { align: 'center' });
  
  // Download the PDF
  doc.save(`Invoice_${invoice.invoice_number}.pdf`);
};

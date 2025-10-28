/**
 * Generates a QuickBooks-compliant invoice number (max 21 characters)
 * Format: INV-YYMMDD-SEQ (e.g., INV-251027-001)
 * Max length: 3 + 1 + 6 + 1 + 3 = 14 characters
 */
export function generateInvoiceNumber(shipmentNumber: number = 1): string {
  const now = new Date();
  const year = String(now.getFullYear()).slice(2); // Last 2 digits of year
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const seq = String(shipmentNumber).padStart(3, '0');
  
  return `INV-${year}${month}${day}-${seq}`;
}

/**
 * Truncates an invoice number to 21 characters for QuickBooks compatibility
 */
export function truncateInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.substring(0, 21);
}

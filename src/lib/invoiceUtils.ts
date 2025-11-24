/**
 * Generates a simple sequential invoice number starting from 10700
 * Format: 10700, 10701, 10702, etc.
 */
export function generateInvoiceNumber(sequenceNumber: number): string {
  // Start from 10700 and increment
  const invoiceNum = 10699 + sequenceNumber;
  return String(invoiceNum);
}

/**
 * Truncates an invoice number to 21 characters for QuickBooks compatibility
 */
export function truncateInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.substring(0, 21);
}

/**
 * Generates a simple sequential invoice number starting from 10700
 * Format: 10700, 10701, 10702, etc.
 * This is ONLY used for blanket/full invoices. Partial invoices use the parent number with a suffix.
 */
export function generateInvoiceNumber(sequenceNumber: number): string {
  // Start from 10700 and increment
  const invoiceNum = 10699 + sequenceNumber;
  return String(invoiceNum);
}

/**
 * Generates a partial invoice number based on the parent invoice number
 * Format: {parentInvoiceNumber}-{shipmentNumber}
 * Example: 10707-01, 10707-02, etc.
 */
export function generatePartialInvoiceNumber(parentInvoiceNumber: string, shipmentNumber: number): string {
  // Shipment number starts at 2 (since 1 is the blanket invoice)
  // So we subtract 1 to get the suffix: shipment 2 = -01, shipment 3 = -02
  const suffix = String(shipmentNumber - 1).padStart(2, '0');
  return `${parentInvoiceNumber}-${suffix}`;
}

/**
 * Truncates an invoice number to 21 characters for QuickBooks compatibility
 */
export function truncateInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.substring(0, 21);
}

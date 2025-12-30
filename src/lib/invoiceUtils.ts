/**
 * Generates an invoice number based on the order number
 * For the first invoice on an order, just use the order number
 * For additional shipments, use ORDER_NUMBER-01, ORDER_NUMBER-02, etc.
 */
export function generateInvoiceNumber(orderNumber: string, shipmentNumber: number = 1): string {
  if (shipmentNumber <= 1) {
    return orderNumber;
  }
  // Shipment 2 = -01, Shipment 3 = -02, etc.
  const suffix = String(shipmentNumber - 1).padStart(2, '0');
  return `${orderNumber}-${suffix}`;
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

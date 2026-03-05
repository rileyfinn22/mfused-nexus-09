/**
 * Shared invoice total calculator.
 * Single source of truth for computing subtotal and total for any invoice type.
 *
 * For blanket (full) invoices: subtotal = Σ(shipped_quantity × unit_price)
 * For partial/shipment invoices: subtotal = Σ(allocated_quantity × unit_price)
 *
 * total = subtotal + tax + shipping
 */

export interface InvoiceTotalItem {
  /** The quantity basis: shipped_quantity for blanket, quantity_allocated for partial */
  quantity: number;
  unit_price: number;
}

export interface InvoiceTotalResult {
  subtotal: number;
  total: number;
}

export function calculateInvoiceTotals(
  items: InvoiceTotalItem[],
  tax: number = 0,
  shippingCost: number = 0
): InvoiceTotalResult {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
    0
  );
  const total = subtotal + Number(tax || 0) + Number(shippingCost || 0);
  return { subtotal, total };
}

/**
 * Build InvoiceTotalItem[] from order items for a blanket invoice.
 * Uses shipped_quantity as the quantity basis.
 */
export function blanketTotalItems(orderItems: any[]): InvoiceTotalItem[] {
  return orderItems.map((item) => ({
    quantity: Number(item.shipped_quantity || 0) > 0
      ? Number(item.shipped_quantity)
      : Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
  }));
}

/**
 * Build InvoiceTotalItem[] from allocation-based display items (partial invoices).
 * Uses quantity (which is set to quantity_allocated when loaded) as the basis.
 */
export function partialTotalItems(displayItems: any[]): InvoiceTotalItem[] {
  return displayItems.map((item) => ({
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
  }));
}

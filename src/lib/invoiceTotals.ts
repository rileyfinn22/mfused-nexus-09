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
 *
 * hasChildInvoices = true  → placeholder mode: per-item max(shipped, ordered)
 * hasChildInvoices = false → direct-edit mode:
 *   • any shipped → only shipped items count (unshipped = 0)
 *   • none shipped → ordered quantities (placeholder)
 */
export function blanketTotalItems(
  orderItems: any[],
  hasChildInvoices = false
): InvoiceTotalItem[] {
  const anyShipped = orderItems.some(
    (item) => Number(item.shipped_quantity || 0) > 0
  );

  return orderItems.map((item) => {
    const shipped = Number(item.shipped_quantity || 0);
    const ordered = Number(item.quantity || 0);

    let quantity: number;
    if (hasChildInvoices) {
      // Placeholder: per-item max so total never drops below ordered
      quantity = shipped > 0 ? Math.max(shipped, ordered) : ordered;
    } else if (anyShipped) {
      // Direct-edit: only count items that actually shipped
      quantity = shipped > 0 ? shipped : 0;
    } else {
      // Nothing shipped yet: ordered as placeholder
      quantity = ordered;
    }

    return { quantity, unit_price: Number(item.unit_price || 0) };
  });
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

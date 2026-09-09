/**
 * Shared invoice total calculator.
 *
 * For blanket (full) invoices the DATABASE owns subtotal/total
 * (recalc_blanket_invoices_for_order, fired by every order_items write). What lives here is the
 * same rule, so the number a page previews while editing is the number the trigger will write.
 * Pages must not write a blanket's subtotal/total themselves.
 *
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

const isRecorded = (raw: unknown) => !(raw === null || raw === undefined || raw === '');

/**
 * Build InvoiceTotalItem[] from order items for an OPEN blanket invoice. Mirrors
 * recalc_blanket_invoices_for_order exactly:
 *
 * hasChildInvoices = true  → the blanket is the umbrella the shipments draw down against and
 *                            never shrinks: per-line max(ordered, shipped)
 * hasChildInvoices = false → the blanket IS the invoice:
 *   • a line with a recorded shipped quantity bills what shipped
 *   • a line nobody has recorded yet (null / blank) bills as ordered — it is still the order
 *   • a recorded 0 bills zero once anything on the order has shipped; before that it counts as
 *     "not recorded" too, because new orders are seeded with zeros
 *
 * Finalising is a separate step (only what shipped) and is not previewed here.
 */
export function blanketTotalItems(
  orderItems: any[],
  hasChildInvoices = false
): InvoiceTotalItem[] {
  const anyShipped = orderItems.some(
    (item) => Number(item.shipped_quantity || 0) > 0
  );

  return orderItems.map((item) => {
    const recorded = isRecorded(item.shipped_quantity);
    const shipped = recorded ? Number(item.shipped_quantity) || 0 : 0;
    const ordered = Number(item.quantity || 0);

    let quantity: number;
    if (hasChildInvoices) {
      quantity = Math.max(shipped, ordered);
    } else if (!recorded) {
      quantity = ordered;
    } else if (shipped === 0 && !anyShipped) {
      quantity = ordered;
    } else {
      quantity = shipped;
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

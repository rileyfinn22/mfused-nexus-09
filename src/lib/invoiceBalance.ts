import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderItem } from "./invoicePdfUtils";


/**
 * Draw-down math for blanket invoices and their child shipment invoices.
 *
 * Business rules (Riley, 2026-08-03, deposit timing revised 2026-08-04):
 * - The blanket is the whole receivable; child invoices bill portions AGAINST it,
 *   never in addition to it.
 * - Payments recorded on the blanket itself (deposits/prepayments) are credited
 *   LATE: children bill their goods in full as they ship, and the deposit is only
 *   released once there is nothing left to ship, landing on the LAST shipment and
 *   working backwards. That collects full cash on every shipment and settles the
 *   deposit against the closing invoice.
 * - "Nothing left to ship" is detected automatically — every line shipped at least
 *   what was ordered — so a normally-completed order releases the deposit on its
 *   own. $100 blanket, $30 deposit, $50 first shipment, $60 second (with overs):
 *   the second shipment shows $60 less the $30 deposit = $30 due, and the customer
 *   has paid $110 for $110 of goods. Finalising the blanket also releases it, which
 *   is what covers UNDER-shipments, where the order will never draw down in full
 *   and only a human can say it is finished.
 * - Crediting late also avoids a trap: if the credit chased the earliest child, a
 *   newly created shipment would move it and retroactively raise the balance on an
 *   invoice already sent and part-paid.
 * - A sibling's own payments pay for that sibling's goods; they are never credited
 *   against another child.
 *
 * This module is the single source for that math — the invoice detail page, the
 * invoice list PDF download, and emailed PDFs must all go through it so every
 * surface shows the same balance. QuickBooks sync applies the same proration.
 */

export interface ChildInvoiceLike {
  id: string;
  invoice_number?: string | null;
  total?: number | null;
  total_paid?: number | null;
  shipment_number?: number | null;
  created_at?: string | null;
}

export interface ParentInvoiceLike {
  id: string;
  invoice_number?: string | null;
  invoice_type?: string | null;
  total_paid?: number | null;
  /** Set once the blanket is finalized. Until then the deposit is not released to children. */
  blanket_closed_at?: string | null;
}

export interface ChildCreditResult {
  /** Blanket-level payments credited to THIS child invoice. */
  amount: number;
  /** Display label for the credit line, null when no credit applies. */
  label: string | null;
}

const NO_CREDIT: ChildCreditResult = { amount: 0, label: null };

export interface OrderItemShipState {
  quantity?: number | null;
  shipped_quantity?: number | null;
}

/**
 * True when no line still owes a shipment. Overs count as complete — shipping 60 against 50
 * ordered leaves nothing outstanding on that line.
 *
 * A line sitting at 0/blank shipped is NOT complete: that is either "nobody recorded it yet" or
 * a genuine zero, and we cannot tell which, so the deposit stays put until a human finalises.
 */
export function isOrderFullyShipped(items: OrderItemShipState[] | null | undefined): boolean {
  if (!items || items.length === 0) return false;
  return items.every(
    (i) => Number(i.shipped_quantity || 0) >= Number(i.quantity || 0)
  );
}

export interface ChildCreditOptions {
  /** Every line has shipped what it owed, so the order has drawn down in full. */
  orderFullyShipped?: boolean;
}

const childOrder = (a: ChildInvoiceLike, b: ChildInvoiceLike): number => {
  const shipA = a.shipment_number ?? Number.MAX_SAFE_INTEGER;
  const shipB = b.shipment_number ?? Number.MAX_SAFE_INTEGER;
  if (shipA !== shipB) return shipA - shipB;
  const createdA = a.created_at || "";
  const createdB = b.created_at || "";
  if (createdA !== createdB) return createdA < createdB ? -1 : 1;
  return String(a.invoice_number || "").localeCompare(String(b.invoice_number || ""));
};

/**
 * Release the parent blanket's payments to its children, LAST shipment first: the
 * closing shipment consumes credit up to its own outstanding balance (total − own
 * payments); whatever remains flows back to the shipment before it. Returns the
 * credit that lands on `child`.
 *
 * Nothing is released while shipments are still outstanding — every child bills its
 * goods in full and the deposit stays on the blanket, so no already-sent invoice
 * ever has its balance moved underneath it. The release happens on its own once
 * the order has drawn down in full, or when a human finalises the blanket.
 */
export function computeChildCredit(
  child: ChildInvoiceLike,
  parent: ParentInvoiceLike | null | undefined,
  allChildren: ChildInvoiceLike[],
  opts?: ChildCreditOptions
): ChildCreditResult {
  if (!parent || parent.invoice_type !== "full") return NO_CREDIT;
  if (!parent.blanket_closed_at && !opts?.orderFullyShipped) return NO_CREDIT;
  let remaining = Number(parent.total_paid || 0);
  if (remaining <= 0.005) return NO_CREDIT;

  const ordered = [...allChildren];
  if (!ordered.some((c) => c.id === child.id)) ordered.push(child);
  ordered.sort(childOrder).reverse();

  for (const sibling of ordered) {
    const outstanding = Math.max(
      0,
      Number(sibling.total || 0) - Number(sibling.total_paid || 0)
    );
    const consumed = Math.min(remaining, outstanding);
    if (sibling.id === child.id) {
      const amount = Math.round(consumed * 100) / 100;
      if (amount <= 0.005) return NO_CREDIT;
      return {
        amount,
        label: `Less Deposit Paid (Inv #${parent.invoice_number || ""})`,
      };
    }
    remaining -= consumed;
    if (remaining <= 0.005) return NO_CREDIT;
  }
  return NO_CREDIT;
}

export interface ChildPdfInputs {
  /** Line items billed on THIS invoice (from its allocations); null → caller keeps its fallback. */
  itemsOverride: OrderItem[] | null;
  credit: ChildCreditResult;
}

/**
 * Fetch everything a child-invoice PDF needs to show correct numbers: this
 * invoice's own allocation lines and its prorated blanket-payment credit.
 * Safe to call for any invoice — non-children just get no override / no credit.
 */
export async function fetchChildPdfInputs(
  supabase: SupabaseClient,
  invoice: {
    id: string;
    order_id?: string | null;
    invoice_type?: string | null;
    parent_invoice_id?: string | null;
    invoice_number?: string | null;
    total?: number | null;
    total_paid?: number | null;
    shipment_number?: number | null;
    created_at?: string | null;
  }
): Promise<ChildPdfInputs> {
  const isBlanket =
    invoice.invoice_type === "full" ||
    (!invoice.invoice_type && !invoice.parent_invoice_id);
  if (isBlanket) return { itemsOverride: null, credit: NO_CREDIT };

  const allocationsPromise = supabase
    .from("inventory_allocations")
    .select(
      "quantity_allocated, order_items (id, sku, name, unit_price, line_number)"
    )
    .eq("invoice_id", invoice.id);

  const parentPromise = invoice.parent_invoice_id
    ? supabase
        .from("invoices")
        .select("id, invoice_number, invoice_type, total_paid, blanket_closed_at")
        .eq("id", invoice.parent_invoice_id)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const siblingsPromise = invoice.parent_invoice_id
    ? supabase
        .from("invoices")
        .select("id, invoice_number, total, total_paid, shipment_number, created_at")
        .eq("parent_invoice_id", invoice.parent_invoice_id)
        .is("deleted_at", null)
    : Promise.resolve({ data: [] as ChildInvoiceLike[] });

  // Used to decide whether the order has drawn down in full, which releases the deposit
  // without anyone having to press anything.
  const orderItemsPromise = invoice.order_id
    ? supabase
        .from("order_items")
        .select("quantity, shipped_quantity")
        .eq("order_id", invoice.order_id)
    : Promise.resolve({ data: [] as OrderItemShipState[] });

  const [allocationsRes, parentRes, siblingsRes, orderItemsRes] = await Promise.all([
    allocationsPromise,
    parentPromise,
    siblingsPromise,
    orderItemsPromise,
  ]);

  let itemsOverride: ChildPdfInputs["itemsOverride"] = null;
  const allocations = (allocationsRes.data || []) as any[];
  if (allocations.length > 0) {
    itemsOverride = allocations
      .sort(
        (a, b) =>
          (a.order_items?.line_number ?? 999) - (b.order_items?.line_number ?? 999)
      )
      .map((alloc) => {
        const qty = Number(alloc.quantity_allocated || 0);
        return {
          ...(alloc.order_items || {}),
          quantity: qty,
          shipped_quantity: qty,
          unit_price: Number(alloc.order_items?.unit_price || 0),
        };
      });
  }

  const credit = computeChildCredit(
    invoice,
    (parentRes as any).data,
    ((siblingsRes as any).data || []) as ChildInvoiceLike[],
    {
      orderFullyShipped: isOrderFullyShipped(
        ((orderItemsRes as any).data || []) as OrderItemShipState[]
      ),
    }
  );

  return { itemsOverride, credit };
}

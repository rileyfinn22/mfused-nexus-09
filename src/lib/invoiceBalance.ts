import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderItem } from "./invoicePdfUtils";


/**
 * Draw-down math for blanket invoices and their child shipment invoices.
 *
 * Business rules (Riley, 2026-08-03, deposit timing revised 2026-08-04):
 * - The blanket is the whole receivable; child invoices bill portions AGAINST it,
 *   never in addition to it.
 * - A deposit paid on the blanket is spread across the shipments AT THE RATE IT WAS
 *   PAID AT: a 30% deposit means every shipment bills at 70% of itself. That is the
 *   sentence a customer would use to describe their own arrangement, and no shipment
 *   comes out oddly free or oddly full-price.
 *   $100 blanket, $30 deposit, $50 first shipment, $60 second (with overs):
 *     ship 1  bills 50  credit 15  due 35
 *     ship 2  bills 60  credit 15  due 45   (deposit exhausted)
 *   30 + 35 + 45 = 110 collected for 110 of goods.
 * - Timing is ALL this decides. The deposit is cash already received, so nothing here
 *   withholds anything from anyone — the only question is which shipment invoice
 *   prints the smaller balance. Every scheme collects the value of goods shipped.
 * - An order that ends SHORT leaves a tail: 30% of 80 shipped credits 24 of a 30
 *   deposit. Finalising the blanket releases that remainder onto the CLOSING shipment,
 *   added there rather than re-spread, so an invoice already sent and part-paid never
 *   has its balance moved underneath it.
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
  /** The whole receivable; denominator for the deposit rate. */
  total?: number | null;
  /** Set once the blanket is finalized, which releases any unspread tail of the deposit. */
  blanket_closed_at?: string | null;
}

export interface ChildCreditResult {
  /** Blanket-level payments credited to THIS child invoice. */
  amount: number;
  /** Display label for the credit line, null when no credit applies. */
  label: string | null;
}

const NO_CREDIT: ChildCreditResult = { amount: 0, label: null };

export interface ChildCreditOptions {
  /**
   * The whole expected receivable — the blanket's own total. Used as the denominator for the
   * deposit rate, so a $30 deposit against a $100 blanket bills every shipment at 70%.
   */
  blanketValue?: number;
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
 * Spread the blanket's deposit across its child shipments at the rate it was paid at,
 * and return the slice landing on `child`.
 *
 * A 30% deposit means every shipment bills at 70% of itself. Each child takes
 * `rate × its own value`, in shipment order, capped by what is left of the deposit
 * and by that child's own outstanding balance. Nothing is ever credited twice, and
 * the customer always ends up paying exactly the value of the goods shipped.
 *
 * Note this is only a question of WHICH invoice shows the smaller balance — the
 * deposit is cash already received, so no scheme here withholds anything from anyone.
 *
 * The rate is deposit ÷ the whole expected receivable (the blanket total), so on an
 * order that ships in full the slices add up to exactly the deposit. Overs make the
 * blanket grow, which lowers the rate and keeps the total credited at the deposit.
 * An order that ends SHORT leaves a remainder — 30% of 80 shipped is 24 of a 30
 * deposit — and finalising the blanket releases that tail onto the closing shipment,
 * added there rather than re-spread, so an invoice already sent never moves.
 */
export function computeChildCredit(
  child: ChildInvoiceLike,
  parent: ParentInvoiceLike | null | undefined,
  allChildren: ChildInvoiceLike[],
  opts?: ChildCreditOptions
): ChildCreditResult {
  if (!parent || parent.invoice_type !== "full") return NO_CREDIT;

  const deposit = Number(parent.total_paid || 0);
  if (deposit <= 0.005) return NO_CREDIT;

  const ordered = [...allChildren];
  if (!ordered.some((c) => c.id === child.id)) ordered.push(child);
  ordered.sort(childOrder);

  const childrenValue = ordered.reduce((sum, c) => sum + Math.max(0, Number(c.total || 0)), 0);
  // Rate basis is the whole expected receivable and does NOT change when the blanket is
  // finalised. Re-deriving it from the children at that point would re-spread the deposit and
  // silently restate the credit on shipments already sent; the tail-fill below handles the
  // remainder instead, on the closing shipment only.
  const basis = Math.max(Number(opts?.blanketValue || 0), childrenValue);
  if (basis <= 0.005) return NO_CREDIT;

  const rate = Math.min(1, deposit / basis);
  const outstandingOf = (c: ChildInvoiceLike) =>
    Math.max(0, Number(c.total || 0) - Number(c.total_paid || 0));

  let pool = deposit;
  const credited = new Map<string, number>();
  for (const sibling of ordered) {
    const share = Math.min(rate * Math.max(0, Number(sibling.total || 0)), pool, outstandingOf(sibling));
    const amount = Math.max(0, Math.round(share * 100) / 100);
    credited.set(sibling.id, amount);
    pool -= amount;
    if (pool <= 0.005) break;
  }

  // Short order, human has called it done: the unspread tail settles on the closing shipment
  // rather than being re-spread over invoices that have already gone out.
  if (parent.blanket_closed_at && pool > 0.005) {
    for (let i = ordered.length - 1; i >= 0 && pool > 0.005; i--) {
      const sibling = ordered[i];
      const already = credited.get(sibling.id) || 0;
      const room = Math.max(0, outstandingOf(sibling) - already);
      const extra = Math.min(pool, room);
      if (extra > 0.005) {
        credited.set(sibling.id, Math.round((already + extra) * 100) / 100);
        pool -= extra;
      }
    }
  }

  const amount = credited.get(child.id) || 0;
  if (amount <= 0.005) return NO_CREDIT;
  return {
    amount,
    label: `Less Deposit Paid (Inv #${parent.invoice_number || ""})`,
  };
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
        .select("id, invoice_number, invoice_type, total_paid, total, blanket_closed_at")
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

  const [allocationsRes, parentRes, siblingsRes] = await Promise.all([
    allocationsPromise,
    parentPromise,
    siblingsPromise,
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
    { blanketValue: Number((parentRes as any).data?.total || 0) }
  );

  return { itemsOverride, credit };
}

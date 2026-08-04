/**
 * Deposit-credit math for blanket invoices and their child shipment invoices.
 *
 * THE ONE COPY. The invoice page, the downloaded and emailed PDFs, and the QuickBooks
 * invoice sync all call this. It lived in two places for a while and they drifted, which
 * meant a customer's emailed invoice and the same invoice in QuickBooks could show
 * different balances. Deliberately dependency-free so Deno (edge functions, with the .ts
 * extension) and Vite (the app, without it) can both import this exact file.
 *
 * Business rules (Riley, 2026-08-04):
 * - The blanket is the whole receivable; child invoices bill portions AGAINST it, never in
 *   addition to it.
 * - A deposit paid on the blanket is spread across the shipments AT THE RATE IT WAS PAID
 *   AT: a 30% deposit means every shipment bills at 70% of itself. That is the sentence a
 *   customer would use about their own arrangement, and no shipment comes out oddly free
 *   or oddly full price.
 *     $100 blanket, $30 deposit, two $50 shipments:
 *       ship 1  bills 50  credit 15  due 35
 *       ship 2  bills 50  credit 15  due 35
 *     30 + 35 + 35 = 100 collected for 100 of goods.
 * - Timing is ALL this decides. The deposit is cash already received, so nothing here
 *   withholds anything from anyone — the only question is which shipment invoice prints
 *   the smaller balance. Every scheme collects the value of the goods shipped.
 * - An order that ends SHORT leaves a tail: 30% of 80 shipped credits 24 of a 30 deposit.
 *   Finalising the blanket adds that remainder to the CLOSING shipment, rather than
 *   re-spreading at a fresh rate, so an invoice already sent and part-paid never has its
 *   balance moved underneath it.
 * - A sibling's own payments pay for that sibling's goods; never for another child's.
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

export interface ChildCreditOptions {
  /**
   * The whole expected receivable — the blanket's own total. Denominator for the deposit
   * rate, so a $30 deposit against a $100 blanket bills every shipment at 70%.
   */
  blanketValue?: number;
}

export const NO_CREDIT: ChildCreditResult = { amount: 0, label: null };

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
 * Spread the blanket's deposit across every child at the rate it was paid at, and return
 * the whole allocation keyed by child id. Each child takes `rate × its own value`, in
 * shipment order, capped by what is left of the deposit and by that child's own
 * outstanding balance — so nothing is ever credited twice.
 */
export function allocateDepositCredits(
  parent: ParentInvoiceLike | null | undefined,
  allChildren: ChildInvoiceLike[],
  opts?: ChildCreditOptions
): Record<string, number> {
  const empty: Record<string, number> = {};
  if (!parent || parent.invoice_type !== "full") return empty;

  const deposit = Number(parent.total_paid || 0);
  if (deposit <= 0.005) return empty;

  const ordered = [...allChildren].sort(childOrder);
  const childrenValue = ordered.reduce((sum, c) => sum + Math.max(0, Number(c.total || 0)), 0);

  // Rate basis is the whole expected receivable and does NOT change when the blanket is
  // finalised. Re-deriving it from the children at that point would re-spread the deposit
  // and silently restate the credit on shipments already sent; the tail-fill below handles
  // the remainder instead, on the closing shipment only.
  const basis = Math.max(Number(opts?.blanketValue || 0), childrenValue);
  if (basis <= 0.005) return empty;

  const rate = Math.min(1, deposit / basis);
  const outstandingOf = (c: ChildInvoiceLike) =>
    Math.max(0, Number(c.total || 0) - Number(c.total_paid || 0));

  let pool = deposit;
  const credited: Record<string, number> = {};
  for (const sibling of ordered) {
    const share = Math.min(
      rate * Math.max(0, Number(sibling.total || 0)),
      pool,
      outstandingOf(sibling)
    );
    const amount = Math.max(0, Math.round(share * 100) / 100);
    credited[sibling.id] = amount;
    pool -= amount;
    if (pool <= 0.005) break;
  }

  // Short order, human has called it done: the unspread tail settles on the closing
  // shipment rather than being re-spread over invoices that have already gone out.
  if (parent.blanket_closed_at && pool > 0.005) {
    for (let i = ordered.length - 1; i >= 0 && pool > 0.005; i--) {
      const sibling = ordered[i];
      const already = credited[sibling.id] || 0;
      const extra = Math.min(pool, Math.max(0, outstandingOf(sibling) - already));
      if (extra > 0.005) {
        credited[sibling.id] = Math.round((already + extra) * 100) / 100;
        pool -= extra;
      }
    }
  }

  return credited;
}

/** The deposit slice landing on one specific child, with its display label. */
export function computeChildCredit(
  child: ChildInvoiceLike,
  parent: ParentInvoiceLike | null | undefined,
  allChildren: ChildInvoiceLike[],
  opts?: ChildCreditOptions
): ChildCreditResult {
  const withChild = allChildren.some((c) => c.id === child.id)
    ? allChildren
    : [...allChildren, child];

  const amount = allocateDepositCredits(parent, withChild, opts)[child.id] || 0;
  if (amount <= 0.005) return NO_CREDIT;
  return {
    amount,
    label: `Less Deposit Paid (Inv #${parent?.invoice_number || ""})`,
  };
}

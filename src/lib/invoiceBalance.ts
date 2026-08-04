import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderItem } from "./invoicePdfUtils";


/**
 * Fetching layer for child-invoice billing: this invoice's own allocation lines plus its
 * slice of any deposit paid on the blanket.
 *
 * The deposit rules themselves are documented on the shared module this re-exports.
 * The invoice detail page, the invoice list PDF, emailed PDFs and the QuickBooks sync all
 * run that same code, so every surface shows the customer the same balance.
 */

// The deposit arithmetic itself lives in supabase/functions/_shared/depositCredit.ts so the
// QuickBooks sync runs the exact same code, not a copy of it. Re-exported here so callers
// keep importing from one place.
export type {
  ChildInvoiceLike,
  ParentInvoiceLike,
  ChildCreditResult,
  ChildCreditOptions,
} from "../../supabase/functions/_shared/depositCredit";

export {
  computeChildCredit,
  allocateDepositCredits,
} from "../../supabase/functions/_shared/depositCredit";

import type {
  ChildInvoiceLike,
  ParentInvoiceLike,
  ChildCreditResult,
} from "../../supabase/functions/_shared/depositCredit";
import { computeChildCredit, NO_CREDIT } from "../../supabase/functions/_shared/depositCredit";

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

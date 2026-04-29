import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Toggle button used inside table rows to expand/collapse a details panel.
 */
export function ExpandToggleButton({
  expanded,
  onToggle,
  className = "",
}: {
  expanded: boolean;
  onToggle: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-7 w-7 p-0 ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e);
      }}
      title={expanded ? "Hide details" : "Show details"}
      aria-label={expanded ? "Collapse row" : "Expand row"}
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4" />
      ) : (
        <ChevronRight className="h-4 w-4" />
      )}
    </Button>
  );
}

interface DetailItem {
  label: string;
  value: React.ReactNode;
}

export function ExpandDetailsPanel({
  details,
  items,
  itemColumns,
  emptyItemsLabel = "No line items",
  loading,
  payments,
  paymentsLoading,
  paymentsLabel = "Payments",
  emptyPaymentsLabel = "No payments recorded",
}: {
  details: DetailItem[];
  items?: any[];
  itemColumns?: { key: string; label: string; render?: (row: any) => React.ReactNode; className?: string }[];
  emptyItemsLabel?: string;
  loading?: boolean;
  payments?: any[] | null;
  paymentsLoading?: boolean;
  paymentsLabel?: string;
  emptyPaymentsLabel?: string;
}) {
  return (
    <div className="bg-muted/30 border-t border-border px-6 py-4 space-y-4">
      {details.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
          {details.map((d, i) => (
            <div key={i} className="text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{d.label}</div>
              <div className="font-medium text-foreground break-words">{d.value ?? "—"}</div>
            </div>
          ))}
        </div>
      )}
      {itemColumns && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Line Items</div>
          {loading ? (
            <div className="text-sm text-muted-foreground py-2">Loading items…</div>
          ) : !items || items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">{emptyItemsLabel}</div>
          ) : (
            <div className="rounded-md border border-border bg-background overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {itemColumns.map((c) => (
                      <th
                        key={c.key}
                        className={`text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider ${c.className || ""}`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={row.id || idx} className="border-t border-border">
                      {itemColumns.map((c) => (
                        <td key={c.key} className={`px-3 py-2 align-top ${c.className || ""}`}>
                          {c.render ? c.render(row) : row[c.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {payments !== undefined && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{paymentsLabel}</div>
          {paymentsLoading ? (
            <div className="text-sm text-muted-foreground py-2">Loading payments…</div>
          ) : !payments || payments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">{emptyPaymentsLabel}</div>
          ) : (
            <div className="rounded-md border border-border bg-background overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Method</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, idx) => (
                    <tr key={p.id || idx} className="border-t border-border">
                      <td className="px-3 py-2">{p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "—"}</td>
                      <td className="px-3 py-2 capitalize">{(p.payment_method || "—").toString().replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 font-mono text-xs">{p.reference_number || "—"}</td>
                      <td className="px-3 py-2 text-right font-medium text-success">${Number(p.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lazy-loads invoice line items (via inventory_allocations + order_items fallback)
 * when the row is expanded.
 */
export function useInvoiceItems(invoiceId: string | null, enabled: boolean) {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !invoiceId || items !== null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Try inventory allocations first (shipment invoices)
        const { data: allocs } = await supabase
          .from("inventory_allocations")
          .select("quantity_allocated, order_items(sku, name, unit_price, line_number)")
          .eq("invoice_id", invoiceId);

        let rows: any[] = [];
        if (allocs && allocs.length > 0) {
          rows = allocs
            .map((a: any) => ({
              sku: a.order_items?.sku,
              product_name: a.order_items?.name,
              quantity: a.quantity_allocated,
              unit_price: a.order_items?.unit_price,
              line_number: a.order_items?.line_number ?? 999,
            }))
            .sort((a, b) => a.line_number - b.line_number);
        } else {
          // Fallback: pull order items via the invoice's order
          const { data: inv } = await supabase
            .from("invoices")
            .select("order_id")
            .eq("id", invoiceId)
            .maybeSingle();
          if (inv?.order_id) {
            const { data: oi } = await supabase
              .from("order_items")
              .select("sku, name, quantity, shipped_quantity, unit_price, line_number")
              .eq("order_id", inv.order_id)
              .order("line_number");
            rows = (oi || []).map((o: any) => ({
              sku: o.sku,
              product_name: o.name,
              quantity: o.shipped_quantity || o.quantity,
              unit_price: o.unit_price,
            }));
          }
        }
        if (!cancelled) setItems(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, enabled, items]);

  return { items, loading };
}

/**
 * Lazy-loads vendor PO items when the row is expanded.
 */
export function useVendorPOItems(poId: string | null, enabled: boolean) {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !poId || items !== null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("vendor_po_items")
          .select("sku, product_name, description, quantity, unit_cost, line_number")
          .eq("vendor_po_id", poId)
          .order("line_number", { ascending: true });
        if (!cancelled) setItems(data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poId, enabled, items]);

  return { items, loading };
}

/**
 * Lazy-loads invoice payments when the row is expanded.
 */
export function useInvoicePayments(invoiceId: string | null, enabled: boolean) {
  const [payments, setPayments] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !invoiceId || payments !== null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("payments")
          .select("id, amount, payment_method, reference_number, payment_date")
          .eq("invoice_id", invoiceId)
          .order("payment_date", { ascending: false });
        if (!cancelled) setPayments(data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, enabled, payments]);

  return { payments, loading };
}

/**
 * Lazy-loads vendor PO payments when the row is expanded.
 */
export function useVendorPOPayments(poId: string | null, enabled: boolean) {
  const [payments, setPayments] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !poId || payments !== null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("vendor_po_payments")
          .select("id, amount, payment_method, reference_number, payment_date")
          .eq("vendor_po_id", poId)
          .order("payment_date", { ascending: false });
        if (!cancelled) setPayments(data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poId, enabled, payments]);

  return { payments, loading };
}

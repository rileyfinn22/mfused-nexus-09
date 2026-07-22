import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type DriftRow = {
  invoice_id: string;
  invoice_number: string | null;
  invoice_kind: "blanket" | "child";
  status: string | null;
  stored_subtotal: number;
  expected_subtotal: number;
  drift: number;
};

interface Props {
  enabled: boolean;
}

/**
 * Admin-only banner that surfaces invoices whose stored subtotal has drifted
 * from its true source-of-truth value:
 *   - child invoices  → Σ(inventory_allocations.qty × unit_price)
 *   - open blankets   → Σ(quantity × unit_price)
 *   - closed blankets → Σ(shipped_quantity × unit_price)
 */
export default function InvoiceReconciliationBanner({ enabled }: Props) {
  const [rows, setRows] = useState<DriftRow[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("invoice_subtotal_reconciliation" as any)
        .select("*")
        .limit(25);
      if (error || cancelled) return;
      setRows((data as DriftRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {rows.length} invoice{rows.length === 1 ? "" : "s"} with subtotal drift
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Stored subtotal doesn't match the source of truth (allocations for children,
            ordered/shipped totals for blankets). Open each to reconcile.
          </p>
          <div className="mt-3 space-y-1 max-h-56 overflow-y-auto">
            {rows.map((r) => (
              <Link
                key={r.invoice_id}
                to={`/invoices/${r.invoice_id}`}
                className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-warning/10"
              >
                <span className="font-mono">
                  {r.invoice_number ?? r.invoice_id.slice(0, 8)}
                  <span className="ml-2 text-muted-foreground">({r.invoice_kind})</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    stored ${Number(r.stored_subtotal).toFixed(2)} vs expected $
                    {Number(r.expected_subtotal).toFixed(2)}
                  </span>
                  <span className="font-semibold text-warning">
                    Δ ${Math.abs(Number(r.drift)).toFixed(2)}
                  </span>
                  <ChevronRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

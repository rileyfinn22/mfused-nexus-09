import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Factory } from "lucide-react";
import OrdersSheet, { type SheetPo } from "@/components/vendor/OrdersSheet";

/** Customer-safe production row from customer_production_sheet(). */
interface Row {
  po_id: string;
  cpo: string | null;
  order_number: string | null;
  description: string | null;
  completion_date: string | null;
  delivery_date: string | null;
  notes: string | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  ship_to_name: string | null;
  ship_to_street: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  sheet_completed_at: string | null;
  production_percent: number | null;
  invoice_numbers: string[];
  order_date: string;
}

/** Test rollout of the production sheet for customers (currently Mfused only). */
export default function CustomerProduction() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("customer_production_sheet");
        if (error) throw error;
        setRows((data || []) as Row[]);
      } catch (error: any) {
        console.error("Error loading production sheet:", error);
        toast({ title: "Failed to load production", description: error?.message || "Try again", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            !q ||
            (r.cpo || "").toLowerCase().includes(q) ||
            (r.description || "").toLowerCase().includes(q) ||
            (r.tracking_number || "").toLowerCase().includes(q) ||
            (r.invoice_numbers || []).some((n) => n.toLowerCase().includes(q))
        )
        .sort((a, b) => (b.order_date || "").localeCompare(a.order_date || "")),
    [rows, q]
  );

  const sheetPos: SheetPo[] = filtered.map((r) => ({
    id: r.po_id,
    po_number: r.cpo || "",
    cpo: r.cpo,
    sheet_description: r.description,
    completion_date: r.completion_date,
    delivery_date: r.delivery_date,
    production_status: null,
    vendor_committed_ship_date: null,
    expected_delivery_date: null,
    is_delayed: false,
    delay_reason: null,
    order_date: r.order_date,
    description: null,
    notes: r.notes,
    ship_to_name: r.ship_to_name,
    ship_to_street: r.ship_to_street,
    ship_to_city: r.ship_to_city,
    ship_to_state: r.ship_to_state,
    ship_to_zip: r.ship_to_zip,
    tracking_carrier: r.tracking_carrier,
    tracking_number: r.tracking_number,
    tracking_url: r.tracking_url,
    sheet_completed_at: r.sheet_completed_at,
    invoiceNumbers: r.invoice_numbers || [],
    items: [],
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const openCount = rows.filter((r) => !r.sheet_completed_at).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 border-b border-border pb-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" /> Production
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live production status for your orders — click an invoice for details, progress, and documents.
          </p>
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap sm:mb-1">
          {openCount} in progress · {rows.length - openCount} completed
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PO #, invoice, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </div>

      <OrdersSheet
        pos={sheetPos}
        customerView
        storageKey="customer-production-sheet"
        onOpenPo={(po) => navigate(`/production/po/${po.id}`)}
      />
    </div>
  );
}

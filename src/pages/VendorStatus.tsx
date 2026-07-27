import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Factory } from "lucide-react";
import OrdersSheet, { parseTracking, parseShipTo, parseDateInput, type SheetItem, type SheetPo } from "@/components/vendor/OrdersSheet";

interface Row {
  id: string;
  po_number: string;
  vendor_invoice_number: string | null;
  completion_date: string | null;
  delivery_date: string | null;
  sheet_description: string | null;
  sheet_completed_at: string | null;
  production_status: string | null;
  vendor_committed_ship_date: string | null;
  expected_delivery_date: string | null;
  is_delayed: boolean;
  delay_reason: string | null;
  production_status_updated_at: string | null;
  order_date: string;
  description: string | null;
  notes: string | null;
  ship_to_name: string | null;
  ship_to_street: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  vendors: { name: string | null } | null;
  customer_company: { name: string | null } | null;
  vendor_po_items: SheetItem[] | null;
  orders: { po_number: string | null; description: string | null; companies: { name: string | null } | null; invoices: { id: string; invoice_number: string | null; deleted_at: string | null }[] | null } | null;
}

const ALL = "__all__";

export default function VendorStatus() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string>(ALL);
  const [companyFilter, setCompanyFilter] = useState<string>(ALL);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRows();
  }, []);

  const fetchRows = async () => {
    try {
      // vibe_admin RLS ("Vibe admins can view all vendor POs") returns every PO.
      const { data, error } = await (supabase as any)
        .from("vendor_pos")
        .select(
          `id, po_number, vendor_invoice_number, completion_date, delivery_date, sheet_description, sheet_completed_at, production_status, vendor_committed_ship_date, expected_delivery_date,
           is_delayed, delay_reason, production_status_updated_at, order_date, description, notes,
           ship_to_name, ship_to_street, ship_to_city, ship_to_state, ship_to_zip,
           tracking_carrier, tracking_number, tracking_url,
           vendors ( name ),
           customer_company:companies!vendor_pos_customer_company_id_fkey ( name ),
           vendor_po_items ( id, name, description, quantity, final_quantity, shipped_quantity, is_adjustment ),
           orders ( po_number, description, companies ( name ), invoices ( id, invoice_number, deleted_at ) )`
        )
        .neq("po_type", "expense")
        .order("order_date", { ascending: false });

      if (error) throw error;
      setRows((data || []) as Row[]);
    } catch (error: any) {
      console.error("Error loading vendor status:", error);
      toast({ title: "Error", description: "Failed to load vendor status", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /* ---------- inline-edit persistence (vibe-admin RLS allows direct updates) ---------- */

  const patchRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const savePoFields = async (po: SheetPo, patch: Record<string, any>) => {
    const before = rows.find((r) => r.id === po.id);
    patchRow(po.id, patch as Partial<Row>);
    const { error } = await (supabase as any).from("vendor_pos").update(patch).eq("id", po.id);
    if (error) {
      console.error("Error saving PO:", error);
      if (before) patchRow(po.id, before);
      toast({ title: "Change didn't save", description: error.message || "Unknown error — try again", variant: "destructive" });
    }
  };

  /* ---------- filters ---------- */

  const vendorNames = useMemo(
    () => [...new Set(rows.map((r) => r.vendors?.name?.trim() || "Unknown vendor"))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  // Must match the sheet's Company column exactly, or the filter lists/matches
  // names the column never shows.
  const companyOf = (r: Row) => r.orders?.companies?.name?.trim() || r.customer_company?.name?.trim() || "";
  const companyNames = useMemo(
    () => [...new Set(rows.map(companyOf).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const invoiceNumbers = (r: Row): string[] => {
    const list = (r.orders?.invoices || []).filter((i) => !i.deleted_at && i.invoice_number);
    return [...new Set(list.map((i) => i.invoice_number as string))];
  };

  const scoped = rows
    .filter((r) => vendorFilter === ALL || (r.vendors?.name?.trim() || "Unknown vendor") === vendorFilter)
    .filter((r) => companyFilter === ALL || companyOf(r) === companyFilter);

  const q = search.trim().toLowerCase();
  const filtered = scoped
    .filter(
      (r) =>
        !q ||
        r.po_number.toLowerCase().includes(q) ||
        (r.orders?.po_number || "").toLowerCase().includes(q) ||
        (r.vendors?.name || "").toLowerCase().includes(q) ||
        companyOf(r).toLowerCase().includes(q) ||
        (r.ship_to_name || "").toLowerCase().includes(q) ||
        (r.tracking_number || "").toLowerCase().includes(q) ||
        invoiceNumbers(r).some((n) => n.toLowerCase().includes(q)) ||
        (r.vendor_po_items || []).some((i) => (i.name || "").toLowerCase().includes(q))
    )
    .sort((a, b) => Number(b.is_delayed) - Number(a.is_delayed));

  const sheetPos: SheetPo[] = filtered.map((r) => ({
    ...r,
    cpo: r.orders?.po_number || null,
    orderDescription: r.orders?.description || null,
    vendorName: r.vendors?.name || null,
    // The company the connected order belongs to (customer_company as fallback).
    companyName: r.orders?.companies?.name || r.customer_company?.name || null,
    invoiceNumbers: invoiceNumbers(r),
    items: (r.vendor_po_items || []).filter((i) => !i.is_adjustment),
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Factory className="h-6 w-6 text-primary" /> Vendor Status
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Open orders sheet — click any cell to edit it in place, click a PO # for full details.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PO, invoice, company, item, or tracking…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All vendors</SelectItem>
            {vendorNames.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All companies</SelectItem>
            {companyNames.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Editable sheet */}
      <OrdersSheet
        pos={sheetPos}
        showVendor={vendorFilter === ALL}
        showInvoice
        editable
        storageKey="vendor-status-sheet"
        onOpenPo={(po) => navigate(`/vendor-pos/${po.id}?returnTo=/vendor-status`)}
        onSaveShipDate={(po, text) => {
          // Save exactly what was typed; quietly sync the real date column when it parses.
          const parsed = parseDateInput(text);
          savePoFields(po, {
            completion_date: text.trim() || null,
            ...(parsed && parsed !== "invalid" ? { vendor_committed_ship_date: parsed } : {}),
          });
        }}
        onSaveDeliveryDate={(po, text) => savePoFields(po, { delivery_date: text.trim() || null })}
        onSaveVendorInvoice={(po, value) => savePoFields(po, { vendor_invoice_number: value.trim() || null })}
        onSaveDescription={(po, value) => savePoFields(po, { sheet_description: value.trim() || null })}
        onToggleComplete={(po, completed) =>
          savePoFields(po, { sheet_completed_at: completed ? new Date().toISOString() : null })
        }
        onSaveTracking={(po, text) => {
          const t = parseTracking(text);
          savePoFields(po, {
            tracking_carrier: t.carrier || null,
            tracking_number: t.number || null,
            tracking_url: t.url || null,
          });
        }}
        onSaveNotes={(po, value) => savePoFields(po, { notes: value || null })}
        onSaveShipTo={(po, text) => savePoFields(po, parseShipTo(text))}
      />
    </div>
  );
}

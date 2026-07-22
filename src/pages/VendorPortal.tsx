import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { normalizeVendorPoStatusInput } from "@/lib/vendorPoStatus";
import OrdersSheet, { parseTracking, type SheetItem, type SheetPo } from "@/components/vendor/OrdersSheet";

interface VendorPoRow {
  id: string;
  po_number: string;
  vendor_invoice_number: string | null;
  completion_date: string | null;
  sheet_description: string | null;
  order_date: string;
  expected_delivery_date: string | null;
  vendor_committed_ship_date: string | null;
  production_status: string | null;
  is_delayed: boolean;
  delay_reason: string | null;
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
  vendor_po_items: SheetItem[] | null;
  orders: { po_number: string | null; description: string | null } | null;
}

export default function VendorPortal() {
  const [pos, setPos] = useState<VendorPoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchPOs();
  }, []);

  const fetchPOs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }

      // RLS ("Vendors view own POs" / "Vendors view own PO items") scopes this
      // to the signed-in vendor's POs only.
      const { data, error } = await (supabase as any)
        .from("vendor_pos")
        .select(
          `id, po_number, vendor_invoice_number, completion_date, sheet_description, order_date, expected_delivery_date, vendor_committed_ship_date,
           production_status, is_delayed, delay_reason, description, notes,
           ship_to_name, ship_to_street, ship_to_city, ship_to_state, ship_to_zip,
           tracking_carrier, tracking_number, tracking_url,
           vendor_po_items ( id, name, description, quantity, final_quantity, shipped_quantity, is_adjustment ),
           orders ( po_number, description )`
        )
        .order("order_date", { ascending: false });

      if (error) throw error;
      setPos((data || []) as VendorPoRow[]);
    } catch (error: any) {
      console.error("Error loading vendor POs:", error);
      toast({ title: "Error", description: "Failed to load your purchase orders", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /* ---------- inline-edit persistence (SECURITY DEFINER RPCs check PO ownership) ---------- */

  const patchRow = (id: string, patch: Partial<VendorPoRow>) =>
    setPos((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const rpc = async (fn: string, args: Record<string, any>): Promise<boolean> => {
    const { data, error } = await (supabase as any).rpc(fn, args);
    if (error || data?.success === false) {
      console.error(`Error in ${fn}:`, error || data?.error);
      toast({
        title: "Change didn't save",
        description: error?.message || data?.error || "Unknown error — try again",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const saveStatus = async (po: SheetPo, text: string) => {
    const status = normalizeVendorPoStatusInput(text);
    if (!status) return;
    const before = pos.find((r) => r.id === po.id);
    patchRow(po.id, { production_status: status });
    const ok = await rpc("vendor_update_po_status", {
      p_po_id: po.id,
      p_status: status,
      p_committed_ship_date: null,
      p_is_delayed: po.is_delayed,
      p_delay_reason: po.delay_reason,
      p_note: null,
    });
    if (!ok && before) patchRow(po.id, before);
  };

  const saveCompletionDate = async (po: SheetPo, text: string) => {
    const before = pos.find((r) => r.id === po.id);
    patchRow(po.id, { completion_date: text.trim() || null });
    // The RPC stores the raw text and syncs the real date column when it parses.
    const ok = await rpc("vendor_update_po_details", {
      p_po_id: po.id,
      p_tracking_carrier: null,
      p_tracking_number: null,
      p_tracking_url: null,
      p_notes: null,
      p_completion_date: text.trim() === "" ? "" : text,
      p_vendor_invoice_number: null,
    });
    if (!ok && before) patchRow(po.id, before);
  };

  const saveVendorInvoice = async (po: SheetPo, value: string) => {
    const before = pos.find((r) => r.id === po.id);
    patchRow(po.id, { vendor_invoice_number: value.trim() || null });
    const ok = await rpc("vendor_update_po_details", {
      p_po_id: po.id,
      p_tracking_carrier: null,
      p_tracking_number: null,
      p_tracking_url: null,
      p_notes: null,
      p_completion_date: null,
      p_vendor_invoice_number: value.trim() === "" ? "" : value,
    });
    if (!ok && before) patchRow(po.id, before);
  };

  const saveTracking = async (po: SheetPo, text: string) => {
    const t = parseTracking(text);
    const before = pos.find((r) => r.id === po.id);
    patchRow(po.id, {
      tracking_carrier: t.carrier || null,
      tracking_number: t.number || null,
      tracking_url: t.url || null,
    });
    const ok = await rpc("vendor_update_po_details", {
      p_po_id: po.id,
      p_tracking_carrier: t.carrier || "",
      p_tracking_number: t.number || "",
      p_tracking_url: t.url || "",
      p_notes: null,
    });
    if (!ok && before) patchRow(po.id, before);
  };

  const saveNotes = async (po: SheetPo, value: string) => {
    const before = pos.find((r) => r.id === po.id);
    patchRow(po.id, { notes: value || null });
    const ok = await rpc("vendor_update_po_details", {
      p_po_id: po.id,
      p_tracking_carrier: null,
      p_tracking_number: null,
      p_tracking_url: null,
      p_notes: value, // "" clears
    });
    if (!ok && before) patchRow(po.id, before);
  };

  /* ---------- display ---------- */

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      pos
        .filter(
          (p) =>
            !q ||
            p.po_number.toLowerCase().includes(q) ||
            (p.description || "").toLowerCase().includes(q) ||
            (p.ship_to_name || "").toLowerCase().includes(q) ||
            (p.vendor_po_items || []).some((i) => (i.name || "").toLowerCase().includes(q))
        )
        // Open work first (delayed at the very top), shipped at the bottom.
        .sort((a, b) => {
          const aShipped = a.production_status === "shipped" ? 1 : 0;
          const bShipped = b.production_status === "shipped" ? 1 : 0;
          if (aShipped !== bShipped) return aShipped - bShipped;
          return Number(b.is_delayed) - Number(a.is_delayed);
        }),
    [pos, q]
  );

  const sheetPos: SheetPo[] = filtered.map((r) => ({
    ...r,
    cpo: r.orders?.po_number || null,
    // Vendors usually can't read the linked order (RLS) — fall back to the PO text
    // so their description cell isn't blank.
    orderDescription: r.orders?.description || r.description || null,
    companyName: r.ship_to_name,
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
        <h1 className="text-2xl font-semibold">My Purchase Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update your orders right in the sheet — status, ship date, tracking, and notes.
          Click a PO # for full details.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by PO #, item, or ship-to…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <OrdersSheet
        pos={sheetPos}
        editable
        storageKey="vendor-portal-sheet"
        onOpenPo={(po) => navigate(`/vendor-portal/${po.id}`)}
        onSaveStatus={saveStatus}
        onSaveShipDate={saveCompletionDate}
        onSaveTracking={saveTracking}
        onSaveNotes={saveNotes}
        onSaveVendorInvoice={saveVendorInvoice}
      />
    </div>
  );
}

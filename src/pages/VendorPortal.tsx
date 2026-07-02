import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Package, ChevronRight, CalendarClock, AlertCircle, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  VENDOR_PO_STATUSES,
  getVendorPoStatusMeta,
  type VendorPoStatus,
} from "@/lib/vendorPoStatus";
import { cn } from "@/lib/utils";

interface VendorPoRow {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery_date: string | null;
  vendor_committed_ship_date: string | null;
  production_status: VendorPoStatus | null;
  is_delayed: boolean;
  delay_reason: string | null;
  description: string | null;
  ship_to_name: string | null;
  total: number;
}

const parseLocalDate = (s: string | null): Date | null => {
  if (!s) return null;
  const parts = s.split("T")[0].split("-");
  if (parts.length === 3) return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  try { return parseISO(s); } catch { return null; }
};

const fmtDate = (s: string | null): string => {
  const d = parseLocalDate(s);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
};

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

      // RLS ("Vendors view own POs") scopes this to the signed-in vendor's POs only.
      const { data, error } = await (supabase as any)
        .from("vendor_pos")
        .select(
          "id, po_number, order_date, expected_delivery_date, vendor_committed_ship_date, production_status, is_delayed, delay_reason, description, ship_to_name, total"
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

  const q = search.trim().toLowerCase();
  const filtered = pos.filter(
    (p) =>
      !q ||
      p.po_number.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.ship_to_name || "").toLowerCase().includes(q)
  );

  // Surface still-open work first (anything not shipped), delayed at the very top.
  const open = filtered
    .filter((p) => p.production_status !== "shipped")
    .sort((a, b) => Number(b.is_delayed) - Number(a.is_delayed));
  const shipped = filtered.filter((p) => p.production_status === "shipped");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const POCard = ({ po }: { po: VendorPoRow }) => {
    const meta = getVendorPoStatusMeta(po.production_status);
    return (
      <div
        className="group border rounded-xl p-4 bg-card hover:shadow-md transition-all cursor-pointer"
        onClick={() => navigate(`/vendor-portal/${po.id}`)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-mono font-bold text-lg truncate">{po.po_number}</span>
            </div>
            {po.description && (
              <p className="text-sm text-muted-foreground leading-snug line-clamp-2">{po.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={meta.badgeClass}>{meta.label}</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>

        {po.is_delayed && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Delayed{po.delay_reason ? `: ${po.delay_reason}` : ""}</span>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium text-foreground">Your ship date:</span>
            <span className="truncate">{fmtDate(po.vendor_committed_ship_date)}</span>
          </div>
          {po.ship_to_name && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{po.ship_to_name}</span>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Ordered {fmtDate(po.order_date)}</span>
          {po.expected_delivery_date && <span>Requested by {fmtDate(po.expected_delivery_date)}</span>}
        </div>
      </div>
    );
  };

  const Section = ({ title, list, empty }: { title: string; list: VendorPoRow[]; empty: string }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="secondary">{list.length}</Badge>
      </div>
      {list.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((po) => (
            <POCard key={po.id} po={po} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-semibold">My Purchase Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View your POs and keep each one's production status up to date.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by PO #, description, or ship-to…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="space-y-8">
        <Section title="Open" list={open} empty="No open purchase orders" />
        <Section title="Shipped" list={shipped} empty="Nothing shipped yet" />
      </div>
    </div>
  );
}

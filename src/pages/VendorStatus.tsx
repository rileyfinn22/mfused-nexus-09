import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, AlertCircle, Factory, ChevronRight } from "lucide-react";
import { parseISO } from "date-fns";
import {
  VENDOR_PO_STATUSES,
  getVendorPoStatusMeta,
  type VendorPoStatus,
} from "@/lib/vendorPoStatus";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  po_number: string;
  production_status: VendorPoStatus | null;
  vendor_committed_ship_date: string | null;
  expected_delivery_date: string | null;
  is_delayed: boolean;
  delay_reason: string | null;
  production_status_updated_at: string | null;
  order_date: string;
  ship_to_name: string | null;
  vendors: { name: string | null } | null;
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

export default function VendorStatus() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "delayed" | VendorPoStatus>("all");
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
          "id, po_number, production_status, vendor_committed_ship_date, expected_delivery_date, is_delayed, delay_reason, production_status_updated_at, order_date, ship_to_name, vendors ( name )"
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

  const counts = useMemo(() => {
    const c: Record<string, number> = { delayed: 0 };
    VENDOR_PO_STATUSES.forEach((s) => (c[s.value] = 0));
    rows.forEach((r) => {
      c[r.production_status || "not_started"] = (c[r.production_status || "not_started"] || 0) + 1;
      if (r.is_delayed) c.delayed += 1;
    });
    return c;
  }, [rows]);

  const q = search.trim().toLowerCase();
  const filtered = rows
    .filter((r) => {
      if (statusFilter === "delayed") return r.is_delayed;
      if (statusFilter !== "all") return (r.production_status || "not_started") === statusFilter;
      return true;
    })
    .filter(
      (r) =>
        !q ||
        r.po_number.toLowerCase().includes(q) ||
        (r.vendors?.name || "").toLowerCase().includes(q) ||
        (r.ship_to_name || "").toLowerCase().includes(q)
    )
    .sort((a, b) => Number(b.is_delayed) - Number(a.is_delayed));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const Chip = ({ label, value, count, tone }: { label: string; value: typeof statusFilter; count: number; tone?: string }) => (
    <button
      onClick={() => setStatusFilter(statusFilter === value ? "all" : value)}
      className={cn(
        "px-3 py-2 rounded-lg border text-left transition-colors",
        statusFilter === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
      )}
    >
      <div className={cn("text-lg font-semibold", tone)}>{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Factory className="h-6 w-6 text-primary" /> Vendor Status
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vendor-reported production status across all POs. Click a PO to open it.
        </p>
      </div>

      {/* Summary chips (also act as filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {VENDOR_PO_STATUSES.map((s) => (
          <Chip key={s.value} label={s.label} value={s.value} count={counts[s.value] || 0} />
        ))}
        <Chip label="Delayed" value="delayed" count={counts.delayed} tone="text-destructive" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search PO #, vendor, or ship-to…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="delayed">Delayed only</SelectItem>
            {VENDOR_PO_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Committed ship</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No POs match your filters
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const meta = getVendorPoStatusMeta(r.production_status);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/vendor-pos/${r.id}`)}>
                    <TableCell className="font-mono font-medium">{r.po_number}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{r.vendors?.name || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge className={meta.badgeClass}>{meta.label}</Badge>
                        {r.is_delayed && (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive" title={r.delay_reason || "Delayed"}>
                            <AlertCircle className="h-3.5 w-3.5" /> Delayed
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(r.vendor_committed_ship_date)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(r.expected_delivery_date)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.production_status_updated_at
                        ? new Date(r.production_status_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : "—"}
                    </TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

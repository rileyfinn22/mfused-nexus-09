import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2,
  Search,
  AlertCircle,
  Factory,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Package,
} from "lucide-react";
import { parseISO } from "date-fns";
import {
  VENDOR_PO_STATUSES,
  getVendorPoStatusMeta,
  type VendorPoStatus,
} from "@/lib/vendorPoStatus";
import { cn } from "@/lib/utils";

interface PoItem {
  id: string;
  name: string | null;
  description: string | null;
  quantity: number | null;
  final_quantity: number | null;
  shipped_quantity: number | null;
  is_adjustment: boolean | null;
  item_type: string | null;
}

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
  description: string | null;
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
  vendor_po_items: PoItem[] | null;
  orders: { invoices: { id: string; invoice_number: string | null; deleted_at: string | null }[] | null } | null;
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

const fmtQty = (n: number | null | undefined): string =>
  n == null ? "—" : n.toLocaleString("en-US");

/** Product line items only — skip adjustments/fees so the list reads like the order sheet. */
const productItems = (r: Row): PoItem[] =>
  (r.vendor_po_items || []).filter((i) => !i.is_adjustment);

const invoiceNumbers = (r: Row): string[] => {
  const list = (r.orders?.invoices || []).filter((i) => !i.deleted_at && i.invoice_number);
  return [...new Set(list.map((i) => i.invoice_number as string))];
};

const companyName = (r: Row): string =>
  r.customer_company?.name || r.ship_to_name || "—";

const shipToAddress = (r: Row): string => {
  const line = [r.ship_to_street, r.ship_to_city, [r.ship_to_state, r.ship_to_zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return line;
};

export default function VendorStatus() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "delayed" | VendorPoStatus>("all");
  const [vendorFilter, setVendorFilter] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
          `id, po_number, production_status, vendor_committed_ship_date, expected_delivery_date,
           is_delayed, delay_reason, production_status_updated_at, order_date, description,
           ship_to_name, ship_to_street, ship_to_city, ship_to_state, ship_to_zip,
           tracking_carrier, tracking_number, tracking_url,
           vendors ( name ),
           customer_company:companies!vendor_pos_customer_company_id_fkey ( name ),
           vendor_po_items ( id, name, description, quantity, final_quantity, shipped_quantity, is_adjustment, item_type ),
           orders ( invoices ( id, invoice_number, deleted_at ) )`
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

  const toggleVendor = (name: string) => {
    setVendorFilter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Vendor chips: every vendor with POs, biggest first (like the spreadsheet's vendor tabs).
  const vendorCounts = useMemo(() => {
    const c = new Map<string, number>();
    rows.forEach((r) => {
      const name = r.vendors?.name?.trim() || "Unknown vendor";
      c.set(name, (c.get(name) || 0) + 1);
    });
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const vendorRows = useMemo(
    () =>
      vendorFilter.size === 0
        ? rows
        : rows.filter((r) => vendorFilter.has(r.vendors?.name?.trim() || "Unknown vendor")),
    [rows, vendorFilter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { delayed: 0 };
    VENDOR_PO_STATUSES.forEach((s) => (c[s.value] = 0));
    vendorRows.forEach((r) => {
      c[r.production_status || "not_started"] = (c[r.production_status || "not_started"] || 0) + 1;
      if (r.is_delayed) c.delayed += 1;
    });
    return c;
  }, [vendorRows]);

  const q = search.trim().toLowerCase();
  const filtered = vendorRows
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
        companyName(r).toLowerCase().includes(q) ||
        (r.tracking_number || "").toLowerCase().includes(q) ||
        invoiceNumbers(r).some((n) => n.toLowerCase().includes(q)) ||
        productItems(r).some((i) => (i.name || "").toLowerCase().includes(q))
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
          Open orders by vendor — invoice, PO, company, items, status, tracking, and ship-to. Click a row to see its items.
        </p>
      </div>

      {/* Vendor toggles (multi-select, like flipping between spreadsheet tabs) */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setVendorFilter(new Set())}
          className={cn(
            "px-2.5 py-1 rounded-full border text-xs font-medium transition-colors",
            vendorFilter.size === 0
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted/50"
          )}
        >
          All vendors ({rows.length})
        </button>
        {vendorCounts.map(([name, count]) => (
          <button
            key={name}
            onClick={() => toggleVendor(name)}
            className={cn(
              "px-2.5 py-1 rounded-full border text-xs font-medium transition-colors max-w-[220px] truncate",
              vendorFilter.has(name)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/50"
            )}
            title={name}
          >
            {name} ({count})
          </button>
        ))}
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
          <Input
            placeholder="Search PO, invoice, company, item, or tracking…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
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
              <TableHead className="w-8"></TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>PO #</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tracking</TableHead>
              <TableHead>Ship to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No POs match your filters
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const meta = getVendorPoStatusMeta(r.production_status);
                const items = productItems(r);
                const invoices = invoiceNumbers(r);
                const isOpen = expanded.has(r.id);
                const address = shipToAddress(r);
                return (
                  <Fragment key={r.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggleExpanded(r.id)}>
                      <TableCell className="pr-0">
                        {isOpen
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="font-mono text-sm max-w-[140px] truncate" title={invoices.join(", ")}>
                        {invoices.length > 0 ? invoices.join(", ") : "—"}
                      </TableCell>
                      <TableCell className="font-mono font-medium whitespace-nowrap">
                        <button
                          className="hover:underline text-primary"
                          onClick={(e) => { e.stopPropagation(); navigate(`/vendor-pos/${r.id}`); }}
                          title="Open PO"
                        >
                          {r.po_number}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate" title={companyName(r)}>
                        {companyName(r)}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        {items.length === 0 ? (
                          <span className="text-muted-foreground text-sm">{r.description || "—"}</span>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-sm" title={items.map((i) => i.name).join(", ")}>
                              {items[0].name}
                            </span>
                            {items.length > 1 && (
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                +{items.length - 1} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
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
                      <TableCell className="text-sm max-w-[180px]">
                        {r.tracking_number ? (
                          r.tracking_url ? (
                            <a
                              href={r.tracking_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline font-mono truncate max-w-full"
                              onClick={(e) => e.stopPropagation()}
                              title={`${r.tracking_carrier || ""} ${r.tracking_number}`}
                            >
                              <span className="truncate">{r.tracking_carrier ? `${r.tracking_carrier}: ` : ""}{r.tracking_number}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="font-mono truncate block" title={`${r.tracking_carrier || ""} ${r.tracking_number}`}>
                              {r.tracking_carrier ? `${r.tracking_carrier}: ` : ""}{r.tracking_number}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                        <div className="truncate" title={`${r.ship_to_name || ""}${address ? ` — ${address}` : ""}`}>
                          {r.ship_to_name || address || "—"}
                        </div>
                        {r.ship_to_name && address && (
                          <div className="truncate text-xs" title={address}>{address}</div>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell colSpan={7} className="py-3">
                          <div className="space-y-3">
                            {/* Line items, spreadsheet-style: item | ordered | final */}
                            {items.length > 0 ? (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground text-left">
                                    <th className="font-medium pb-1">Item</th>
                                    <th className="font-medium pb-1 text-right w-24">Ordered</th>
                                    <th className="font-medium pb-1 text-right w-24">Final</th>
                                    <th className="font-medium pb-1 text-right w-24">Shipped</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((i) => (
                                    <tr key={i.id} className="border-t border-border/50">
                                      <td className="py-1 pr-4">
                                        <div className="flex items-center gap-2">
                                          <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                          <span>{i.name || i.description || "—"}</span>
                                        </div>
                                      </td>
                                      <td className="py-1 text-right font-mono">{fmtQty(i.quantity)}</td>
                                      <td className="py-1 text-right font-mono">{fmtQty(i.final_quantity)}</td>
                                      <td className="py-1 text-right font-mono">{fmtQty(i.shipped_quantity)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-sm text-muted-foreground">No line items on this PO.</p>
                            )}
                            {/* PO-level details */}
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                              <span>Vendor: <span className="text-foreground">{r.vendors?.name || "—"}</span></span>
                              <span>Ordered: <span className="text-foreground">{fmtDate(r.order_date)}</span></span>
                              <span>Committed ship: <span className="text-foreground">{fmtDate(r.vendor_committed_ship_date)}</span></span>
                              <span>Requested by: <span className="text-foreground">{fmtDate(r.expected_delivery_date)}</span></span>
                              <span>
                                Status updated:{" "}
                                <span className="text-foreground">
                                  {r.production_status_updated_at
                                    ? new Date(r.production_status_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                    : "—"}
                                </span>
                              </span>
                            </div>
                            {r.is_delayed && r.delay_reason && (
                              <p className="text-xs text-destructive flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5" /> {r.delay_reason}
                              </p>
                            )}
                            {r.description && (
                              <p className="text-xs text-muted-foreground">{r.description}</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

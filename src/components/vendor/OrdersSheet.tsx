import { Fragment, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check, ExternalLink } from "lucide-react";
import { parseISO } from "date-fns";
import { matchVendorPoStatus } from "@/lib/vendorPoStatus";
import { cn } from "@/lib/utils";

export interface SheetItem {
  id: string;
  name: string | null;
  description: string | null;
  quantity: number | null;
  final_quantity: number | null;
  shipped_quantity: number | null;
  is_adjustment: boolean | null;
}

export interface SheetPo {
  id: string;
  po_number: string;
  cpo?: string | null;
  /** Order description as it appears on the invoice — the grey preset for the Description cell. */
  orderDescription?: string | null;
  /** Sheet-only description override (vendor_pos.sheet_description). */
  sheet_description?: string | null;
  /** Set = row is marked complete: green, sunk to the Completed section. */
  sheet_completed_at?: string | null;
  vendor_invoice_number?: string | null;
  completion_date?: string | null;
  production_status: string | null;
  vendor_committed_ship_date: string | null;
  expected_delivery_date: string | null;
  is_delayed: boolean;
  delay_reason: string | null;
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
  vendorName?: string | null;
  companyName?: string | null;
  invoiceNumbers?: string[];
  items: SheetItem[];
}

export interface OrdersSheetProps {
  pos: SheetPo[];
  /** Show the vendor column (admin view). */
  showVendor?: boolean;
  /** Show the Vibe invoice column (numbers only; the vendor portal supplies them via an ownership-checked RPC). */
  showInvoice?: boolean;
  /** Company column — redundant on the vendor portal where it duplicates ship-to. */
  showCompany?: boolean;
  editable?: boolean;
  /** localStorage key prefix for persisted column widths. */
  storageKey?: string;
  onOpenPo?: (po: SheetPo) => void;
  /** Free-text status, exactly as typed (pages may normalize to canonical values). */
  onSaveStatus?: (po: SheetPo, status: string) => void;
  /** Free-written completion date text, saved exactly as typed. */
  onSaveShipDate?: (po: SheetPo, cellText: string) => void;
  onSaveVendorInvoice?: (po: SheetPo, value: string) => void;
  onSaveDescription?: (po: SheetPo, value: string) => void;
  onToggleComplete?: (po: SheetPo, completed: boolean) => void;
  /** Raw cell text like "UPS: 1Z999…" — parsed into carrier/number upstream via parseTracking. */
  onSaveTracking?: (po: SheetPo, cellText: string) => void;
  onSaveNotes?: (po: SheetPo, value: string) => void;
  /** Multiline ship-to text — parse with parseShipTo upstream. Absent = read-only column. */
  onSaveShipTo?: (po: SheetPo, cellText: string) => void;
}

/* ---------- helpers ---------- */

const parseLocalDate = (s: string | null): Date | null => {
  if (!s) return null;
  const parts = s.split("T")[0].split("-");
  if (parts.length === 3) return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  try { return parseISO(s); } catch { return null; }
};

const fmtDate = (s: string | null): string => {
  const d = parseLocalDate(s);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
};

const isoDate = (s: string | null): string => (s ? s.split("T")[0] : "");

/** Free-written date text → ISO date, null when empty, "invalid" when unreadable.
    Accepts "8/15", "8/15/26", "8-15-2026", "2026-08-15", "Aug 15", "August 15 2026". */
export const parseDateInput = (text: string): string | null | "invalid" => {
  const t = text.trim();
  if (!t) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const build = (y: number, m: number, d: number): string | "invalid" => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return "invalid";
    return `${y}-${pad(m)}-${pad(d)}`;
  };

  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);

  const mdy = t.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (mdy) {
    const year = mdy[3] ? (mdy[3].length === 2 ? 2000 + +mdy[3] : +mdy[3]) : new Date().getFullYear();
    return build(year, +mdy[1], +mdy[2]);
  }

  const parsed = new Date(t);
  if (!Number.isNaN(parsed.getTime())) {
    // "Aug 15" (no year) parses to an ancient year — assume the current one.
    const year = parsed.getFullYear() < 2000 ? new Date().getFullYear() : parsed.getFullYear();
    return build(year, parsed.getMonth() + 1, parsed.getDate());
  }

  return "invalid";
};

export const shipToAddress = (po: SheetPo): string =>
  [po.ship_to_street, po.ship_to_city, [po.ship_to_state, po.ship_to_zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

/** Ship-to as editable multiline text: name / street / "City, ST 12345". */
export const shipToText = (po: SheetPo): string => {
  const cityLine = [po.ship_to_city, [po.ship_to_state, po.ship_to_zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [po.ship_to_name, po.ship_to_street, cityLine].filter(Boolean).join("\n");
};

/** Inverse of shipToText: line 1 = name, line 2 = street, line 3 = "City, ST 12345". */
export const parseShipTo = (text: string): {
  ship_to_name: string | null;
  ship_to_street: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
} => {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const [name = "", street = "", cityLine = ""] = lines;
  let city = "", state = "", zip = "";
  if (cityLine) {
    const commaIdx = cityLine.lastIndexOf(",");
    if (commaIdx >= 0) {
      city = cityLine.slice(0, commaIdx).trim();
      const rest = cityLine.slice(commaIdx + 1).trim().split(/\s+/);
      state = rest[0] || "";
      zip = rest[1] || "";
    } else {
      city = cityLine;
    }
  }
  return {
    ship_to_name: name || null,
    ship_to_street: street || null,
    ship_to_city: city || null,
    ship_to_state: state || null,
    ship_to_zip: zip || null,
  };
};

/** "UPS: 1Z999AA…" → { carrier: "UPS", number: "1Z999AA…" }; no colon → number only. */
export const parseTracking = (text: string): { carrier: string; number: string; url: string } => {
  const trimmed = text.trim().replace(/\n+/g, " ");
  let carrier = "";
  let number = trimmed;
  const idx = trimmed.search(/[:：]/);
  if (idx > 0) {
    carrier = trimmed.slice(0, idx).trim();
    number = trimmed.slice(idx + 1).trim();
  }
  return { carrier, number, url: trackingUrl(carrier, number) };
};

/** Best-effort tracking link for the common carriers on the order sheet. */
export const trackingUrl = (carrier: string, number: string): string => {
  if (!number) return "";
  const c = carrier.toLowerCase();
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`;
  if (c.includes("dhl")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(number)}`;
  if (c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(number)}`;
  return "";
};

const trackingText = (po: SheetPo): string =>
  po.tracking_number ? `${po.tracking_carrier ? `${po.tracking_carrier}: ` : ""}${po.tracking_number}` : "";

/* ---------- column model ---------- */

interface ColDef {
  id: string;
  label: string;
  width: number;
  minWidth: number;
}

const buildCols = (showVendor: boolean, showInvoice: boolean, showCompany: boolean): ColDef[] => [
  { id: "done", label: "", width: 34, minWidth: 30 },
  ...(showVendor ? [{ id: "vendor", label: "Vendor", width: 120, minWidth: 70 }] : []),
  { id: "vendorInvoice", label: "Vendor Invoice", width: 100, minWidth: 60 },
  ...(showInvoice ? [{ id: "invoice", label: "Vibe Invoice", width: 90, minWidth: 50 }] : []),
  { id: "po", label: "PO #", width: 70, minWidth: 50 },
  { id: "cpo", label: "CPO", width: 90, minWidth: 60 },
  { id: "item", label: "Description", width: 240, minWidth: 120 },
  { id: "status", label: "Status", width: 130, minWidth: 80 },
  { id: "shipDate", label: "Completion date", width: 120, minWidth: 80 },
  { id: "notes", label: "Notes", width: 190, minWidth: 90 },
  { id: "tracking", label: "Tracking", width: 160, minWidth: 90 },
  { id: "shipTo", label: "Ship to", width: 180, minWidth: 100 },
  ...(showCompany ? [{ id: "company", label: "Company", width: 130, minWidth: 80 }] : []),
];

/* ---------- free-write cell (Excel-style) ----------
   Click anywhere in the cell to type. Enter inserts a new line (the row
   grows), blur or Tab commits, Esc cancels. */

interface SheetCellProps {
  value: string;
  display?: React.ReactNode;
  placeholder?: string;
  editable: boolean;
  className?: string;
  mono?: boolean;
  onSave: (value: string) => void;
}

function SheetCell({ value, display, placeholder, editable, className, mono, onSave }: SheetCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${ta.scrollHeight}px`;
  };

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => {
        taRef.current?.focus();
        taRef.current?.select();
        autosize();
      });
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (editing) {
    return (
      <textarea
        ref={taRef}
        value={draft}
        rows={1}
        onChange={(e) => { setDraft(e.target.value); autosize(); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          if (e.key === "Tab") commit(); // blur handles focus move
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full resize-none overflow-hidden bg-background text-xs leading-5 px-1 py-0.5",
          "border-0 outline-none ring-2 ring-primary rounded-none",
          mono && "font-mono",
          className
        )}
      />
    );
  }

  return (
    <div
      onClick={editable ? (e) => { e.stopPropagation(); setEditing(true); } : undefined}
      className={cn(
        "min-h-[1.5rem] h-full px-1 py-0.5 text-xs leading-5 whitespace-pre-wrap break-words",
        mono && "font-mono",
        editable && "cursor-text hover:bg-primary/5",
        !value && !display && "text-muted-foreground/40",
        className
      )}
    >
      {display ?? (value || (editable ? placeholder || "" : ""))}
    </div>
  );
}

/* ---------- the sheet ---------- */

export default function OrdersSheet({
  pos,
  showVendor = false,
  showInvoice = false,
  showCompany = true,
  editable = false,
  storageKey = "orders-sheet",
  onOpenPo,
  onSaveStatus,
  onSaveShipDate,
  onSaveTracking,
  onSaveNotes,
  onSaveShipTo,
  onSaveVendorInvoice,
  onSaveDescription,
  onToggleComplete,
}: OrdersSheetProps) {
  const cols = buildCols(showVendor, showInvoice, showCompany);
  const widthsKey = `${storageKey}:colWidths`;

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(widthsKey) || "{}");
      return Object.fromEntries(cols.map((c) => [c.id, Number(saved[c.id]) || c.width]));
    } catch {
      return Object.fromEntries(cols.map((c) => [c.id, c.width]));
    }
  });
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});

  const dragRef = useRef<{ kind: "col" | "row"; id: string; start: number; startSize: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      if (d.kind === "col") {
        const col = cols.find((c) => c.id === d.id);
        const next = Math.max(col?.minWidth ?? 50, d.startSize + (e.clientX - d.start));
        setWidths((prev) => ({ ...prev, [d.id]: next }));
      } else {
        const next = Math.max(24, d.startSize + (e.clientY - d.start));
        setRowHeights((prev) => ({ ...prev, [d.id]: next }));
      }
    };
    const onUp = () => {
      if (dragRef.current?.kind === "col") {
        setWidths((prev) => {
          try { localStorage.setItem(widthsKey, JSON.stringify(prev)); } catch {}
          return prev;
        });
      }
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [cols, widthsKey]);

  const startDrag = (kind: "col" | "row", id: string, e: React.MouseEvent, startSize: number) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind, id, start: kind === "col" ? e.clientX : e.clientY, startSize };
    document.body.style.cursor = kind === "col" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };

  const tableWidth = cols.reduce((sum, c) => sum + (widths[c.id] || c.width), 0);

  // Completed rows sink to the bottom under a divider, open work stays on top.
  const openRows = pos.filter((p) => !p.sheet_completed_at);
  const completedRows = pos.filter((p) => p.sheet_completed_at);
  const orderedRows = [...openRows, ...completedRows];

  // Sticky so the header stays visible while the sheet scrolls (solid bg — rows pass under it).
  const th = "sticky top-0 z-20 relative px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-r border-border last:border-r-0 bg-muted select-none";
  const td = "relative p-0 align-top border-b border-r border-border/60 last:border-r-0";

  return (
    <div className="border border-border rounded-lg overflow-auto max-h-[calc(100vh-230px)]">
      <table className="text-xs border-collapse table-fixed" style={{ width: tableWidth }}>
        <colgroup>
          {cols.map((c) => (
            <col key={c.id} style={{ width: widths[c.id] || c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.id} className={th}>
                {c.label}
                {/* Excel-style column edge: drag to resize */}
                <div
                  className="absolute top-0 right-0 h-full w-[5px] cursor-col-resize hover:bg-primary/40 -mr-[2.5px] z-10"
                  onMouseDown={(e) => startDrag("col", c.id, e, widths[c.id] || c.width)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pos.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="text-center text-muted-foreground py-10">
                No purchase orders match your filters
              </td>
            </tr>
          )}
          {orderedRows.map((po, rowIdx) => {
            const isCompleted = !!po.sheet_completed_at;
            const isFirstCompleted = isCompleted && rowIdx === openRows.length;
            const statusMeta = matchVendorPoStatus(po.production_status || "");
            // "Not started" reads as empty on a sheet — no badge, blank cell.
            const showStatusBadge = statusMeta && statusMeta.value !== "not_started";
            const statusEmpty = !po.production_status || statusMeta?.value === "not_started";
            const url = po.tracking_url || trackingUrl(po.tracking_carrier || "", po.tracking_number || "");

            const cell = (id: string): React.ReactNode => {
              switch (id) {
                case "done":
                  return (
                    <button
                      className="w-full flex items-center justify-center py-1.5 group"
                      onClick={() => onToggleComplete?.(po, !isCompleted)}
                      disabled={!editable || !onToggleComplete}
                      title={isCompleted ? "Move back to open" : "Mark complete"}
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5",
                          isCompleted
                            ? "text-success"
                            : "text-muted-foreground/25 group-hover:text-muted-foreground"
                        )}
                      />
                    </button>
                  );
                case "vendorInvoice":
                  return (
                    <SheetCell
                      value={po.vendor_invoice_number || ""}
                      editable={editable && !!onSaveVendorInvoice}
                      mono
                      onSave={(v) => onSaveVendorInvoice?.(po, v)}
                    />
                  );
                case "vendor":
                  return <div className="px-1 py-0.5 whitespace-pre-wrap break-words">{po.vendorName || "—"}</div>;
                case "invoice":
                  return (
                    <div className="px-1 py-0.5 font-mono whitespace-pre-wrap break-words">
                      {(po.invoiceNumbers || []).join("\n") || "—"}
                    </div>
                  );
                case "po":
                  return onOpenPo ? (
                    <button
                      className="px-1 py-0.5 font-mono font-medium text-primary hover:underline"
                      onClick={() => onOpenPo(po)}
                      title="Open PO details"
                    >
                      {po.po_number}
                    </button>
                  ) : (
                    <span className="px-1 py-0.5 font-mono font-medium">{po.po_number}</span>
                  );
                case "cpo":
                  return (
                    <div className="px-1 py-0.5 font-mono truncate" title={po.cpo || ""}>
                      {po.cpo || "—"}
                    </div>
                  );
                case "company":
                  return (
                    <div className="px-1 py-0.5 truncate" title={po.companyName || po.ship_to_name || ""}>
                      {po.companyName || po.ship_to_name || "—"}
                    </div>
                  );
                case "item":
                  // Sheet override wins; the linked order/invoice description shows
                  // as a light-grey preset until someone types over it. The PO's own
                  // description field (auto-generated text) never surfaces here.
                  return (
                    <SheetCell
                      value={po.sheet_description || ""}
                      placeholder={po.orderDescription || ""}
                      editable={editable && !!onSaveDescription}
                      onSave={(v) => onSaveDescription?.(po, v)}
                    />
                  );
                case "status":
                  return (
                    <div className="flex items-start gap-1">
                      <div className="flex-1 min-w-0">
                        <SheetCell
                          value={statusEmpty ? "" : (statusMeta ? statusMeta.label : po.production_status || "")}
                          display={
                            showStatusBadge ? (
                              <Badge className={cn("text-[11px] whitespace-nowrap", statusMeta.badgeClass)}>
                                {statusMeta.label}
                              </Badge>
                            ) : undefined
                          }
                          editable={editable && !!onSaveStatus}
                          onSave={(v) => onSaveStatus?.(po, v)}
                        />
                      </div>
                      {po.is_delayed && (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-1" aria-label={po.delay_reason || "Delayed"} />
                      )}
                    </div>
                  );
                case "shipDate":
                  return (
                    <SheetCell
                      value={po.completion_date || fmtDate(po.vendor_committed_ship_date)}
                      editable={editable && !!onSaveShipDate}
                      onSave={(v) => onSaveShipDate?.(po, v)}
                    />
                  );
                case "tracking":
                  return (
                    <div className="flex items-start gap-1">
                      <div className="flex-1 min-w-0">
                        <SheetCell
                          value={trackingText(po)}
                          editable={editable && !!onSaveTracking}
                          placeholder="UPS: 1Z…"
                          mono
                          onSave={(v) => onSaveTracking?.(po, v)}
                        />
                      </div>
                      {url && po.tracking_number && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary mt-1 mr-0.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          title="Track shipment"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  );
                case "notes":
                  return (
                    <SheetCell
                      value={po.notes || ""}
                      editable={editable && !!onSaveNotes}
                      placeholder="add note"
                      onSave={(v) => onSaveNotes?.(po, v)}
                    />
                  );
                case "shipTo":
                  return (
                    <SheetCell
                      value={shipToText(po)}
                      editable={editable && !!onSaveShipTo}
                      className="text-muted-foreground"
                      onSave={(v) => onSaveShipTo?.(po, v)}
                    />
                  );
                default:
                  return null;
              }
            };

            return (
              <Fragment key={po.id}>
                {isFirstCompleted && (
                  <tr>
                    <td
                      colSpan={cols.length}
                      className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-success bg-success/10 border-y border-border"
                    >
                      Completed
                    </td>
                  </tr>
                )}
                <tr
                  className={cn(isCompleted ? "bg-success/10 hover:bg-success/15" : "hover:bg-muted/20")}
                  style={{ height: rowHeights[po.id] }}
                >
                  {cols.map((c, idx) => (
                    <td key={c.id} className={td}>
                      {cell(c.id)}
                      {/* Excel-style row edge (first column): drag to resize row height */}
                      {idx === 0 && (
                        <div
                          className="absolute bottom-0 left-0 w-full h-[5px] cursor-row-resize hover:bg-primary/40 -mb-[2.5px] z-10"
                          onMouseDown={(e) =>
                            startDrag("row", po.id, e, rowHeights[po.id] || (e.currentTarget.closest("tr")?.getBoundingClientRect().height ?? 28))
                          }
                        />
                      )}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

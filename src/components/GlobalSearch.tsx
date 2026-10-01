import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, FileText, ClipboardList, Building2, Package, Factory, Calculator, DollarSign, Zap, LayoutGrid, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { highlightParts, matchesQuery, tokenize } from "@/lib/plainSearch";
import { formatCurrency, formatDocDate, cn } from "@/lib/utils";
import { StatusDot } from "@/components/StatusDot";

type Row = { kind: string; id: string; title: string; subtitle: string; status: string | null; amount: number | null; doc_date: string | null; link_id: string };
type Item = { key: string; group: string; title: string; subtitle?: string; status?: string | null; amount?: number | null; date?: string | null; icon: any; to: string };

const KIND: Record<string, { label: string; icon: any; to: (id: string) => string }> = {
  invoice: { label: "Invoices", icon: FileText, to: (id) => `/invoices/${id}` },
  order: { label: "Orders", icon: ClipboardList, to: (id) => `/orders/${id}` },
  payment: { label: "Payments", icon: DollarSign, to: (id) => `/invoices/${id}` },
  customer: { label: "Companies", icon: Building2, to: (id) => `/customers/${id}` },
  product: { label: "Products & SKUs", icon: Package, to: (id) => `/products/edit/${id}` },
  vendor_po: { label: "Vendor POs", icon: Factory, to: (id) => `/vendor-pos/${id}` },
  quote: { label: "Quotes", icon: Calculator, to: (id) => `/quotes/${id}` },
};

const APPS = [
  ["Dashboard", "/dashboard", "home overview"], ["Projects", "/projects", ""], ["Orders", "/orders", "sales orders"],
  ["Production", "/production", "pipeline stages"], ["Quotes", "/quotes", "estimates leads"], ["Pull & Ship Orders", "/pull-ship-orders", "pull ship"],
  ["Vendors", "/vendors", "suppliers"], ["Vendor PO / Bills", "/vendor-pos", "purchase orders bills ap"], ["Vendor Status", "/vendor-status", ""],
  ["Invoices", "/invoices", "billing ar receivables"], ["Deleted invoices", "/invoices/deleted", "trash"], ["Companies", "/customers", "customers clients"],
  ["Products", "/products", "items skus templates"], ["Inventory", "/inventory", "stock"], ["Artwork", "/artwork", "proofs art files"],
  ["Reports", "/reports", "statements aging"], ["Message Hub", "/chat", "chat messages"], ["Financing", "/financing", "weiyi finance"],
  ["Shipment Orders", "/forwarder/orders", "forwarder freight"], ["Settings", "/settings", "quickbooks qbo connect users"],
] as const;
const ACTIONS = [
  ["Create order", "/orders/create", "new order"], ["Create quote", "/quotes/create", "new quote lead estimate"],
  ["Create pull & ship", "/pull-ship", "new pull ship"], ["Add company", "/customers", "new customer"],
  ["Add product", "/products", "new item sku"], ["Record vendor bill", "/vendor-pos", "vendor credit check bill"],
  ["Upload artwork", "/artwork", "add proof"], ["Connect QuickBooks", "/settings", "qbo sync"],
] as const;
const HELP = [
  ["How blanket & child invoices work", "/invoices", "blanket child shipment draw down deposit"],
  ["Recording a payment", "/invoices", "payment record paid"],
  ["Sending an invoice email", "/invoices", "email send invoice notice"],
  ["Repaying financed POs", "/financing", "repayment finance deposit"],
] as const;

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqRef = useRef(0);

  // Cmd/Ctrl+K focuses the bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    const onClick = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  useEffect(() => {
    if (tokenize(q).length === 0) { setRows([]); setLoading(false); return; }
    const id = ++reqRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("global_search" as any, { q, per_kind: 6 });
      if (id !== reqRef.current) return;
      if (error) console.error("global search", error);
      setRows((data as Row[]) || []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo<Item[]>(() => {
    if (!tokenize(q).length) return [];
    const recs: Item[] = rows.map((r) => ({
      key: `${r.kind}:${r.id}`, group: KIND[r.kind]?.label ?? r.kind, title: r.title, subtitle: r.subtitle,
      status: r.status, amount: r.amount, date: r.doc_date, icon: KIND[r.kind]?.icon ?? FileText, to: KIND[r.kind]?.to(r.link_id) ?? "/",
    }));
    const stat = (list: readonly (readonly [string, string, string])[], group: string, icon: any) =>
      list.filter(([t, , k]) => matchesQuery(`${t} ${k}`, q)).map(([t, to]) => ({ key: `${group}:${t}`, group, title: t, icon, to }));
    return [
      ...recs,
      ...stat(ACTIONS, "Quick actions", Zap),
      ...stat(APPS, "Apps & pages", LayoutGrid),
      ...stat(HELP, "Help topics", HelpCircle),
    ];
  }, [rows, q]);

  useEffect(() => setActive(0), [items.length, q]);

  const go = (item?: Item) => {
    if (!item) return;
    setOpen(false); setQ("");
    navigate(item.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); active === items.length ? seeAll() : go(items[active]); }
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  };

  const seeAll = () => {
    // Most searches are for documents; the Invoices page runs the same plain-language match.
    setOpen(false);
    navigate(`/invoices?q=${encodeURIComponent(q)}`);
  };

  const Hl = ({ text }: { text: string }) => (
    <>{highlightParts(text, q).map((p, i) => p.hit ? <mark key={i} className="bg-primary/25 text-foreground rounded-sm px-0.5">{p.text}</mark> : <span key={i}>{p.text}</span>)}</>
  );

  let idx = -1;
  const groups = items.reduce<Record<string, Item[]>>((acc, it) => ((acc[it.group] ||= []).push(it), acc), {});

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search invoices, orders, SKUs, amounts, dates…  (Ctrl K)"
        className="h-9 w-full rounded-md border border-input bg-muted/40 pl-9 pr-8 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring"
        aria-label="Search everything"
        role="combobox"
        aria-expanded={open}
      />
      {q && (
        <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Clear search">
          <X className="h-4 w-4" />
        </button>
      )}

      {open && tokenize(q).length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-popover text-popover-foreground shadow-lg overflow-hidden" role="listbox">
          <div className="max-h-[70vh] overflow-y-auto py-1">
            {items.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{loading ? "Searching…" : "No matches. Try fewer words or part of a number."}</p>
            )}
            {Object.entries(groups).map(([group, list]) => (
              <div key={group}>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</div>
                {list.map((it) => {
                  idx++;
                  const i = idx;
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(it)}
                      className={cn("w-full flex items-center gap-3 px-3 py-2 text-left", active === i ? "bg-accent" : "hover:bg-accent/60")}
                      role="option"
                      aria-selected={active === i}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate"><Hl text={it.title} /></p>
                        {(it.subtitle || it.date) && (
                          <p className="text-xs text-muted-foreground truncate">
                            {it.subtitle && <Hl text={it.subtitle} />}{it.subtitle && it.date ? " · " : ""}{it.date ? formatDocDate(it.date) : ""}
                          </p>
                        )}
                      </div>
                      {it.status && <StatusDot status={it.status} />}
                      {it.amount != null && <span className="text-sm tabular-nums shrink-0"><Hl text={formatCurrency(Number(it.amount))} /></span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <button
            type="button"
            onMouseEnter={() => setActive(items.length)}
            onClick={seeAll}
            className={cn("w-full border-t px-3 py-2 text-left text-sm text-primary", active === items.length ? "bg-accent" : "hover:bg-accent/60")}
          >
            See all invoice results for “{q}”
          </button>
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toVendorPoOption, vendorPoLabel, type VendorPoOption } from "@/lib/vendorPo";

interface ShippingVendorPoSelectProps {
  value: string | null;
  onChange: (poId: string | null) => void;
  /** Vendor POs already attached to this invoice's order; listed first without searching. */
  orderPos: VendorPoOption[];
  /** When set, the list ends with "Create shipping PO" which hands off to the caller. */
  onCreate?: () => void;
  className?: string;
}

/**
 * Picks the vendor PO the shipping charge was bought on. Internal to vibe admins: the order's
 * own POs are listed up front, and typing searches every vendor PO in the system by number or
 * vendor (freight is often on an expense PO that is not attached to the order).
 *
 * Relies on the vibe_admin SELECT policy on vendor_pos; customers never render this control.
 */
export function ShippingVendorPoSelect({ value, onChange, orderPos, onCreate, className }: ShippingVendorPoSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<VendorPoOption[]>([]);
  const [selected, setSelected] = useState<VendorPoOption | null>(null);

  // Keep a label for the current value even when it is not among the order's POs.
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const known = orderPos.find((p) => p.id === value) ?? results.find((p) => p.id === value);
    if (known) {
      setSelected(known);
      return;
    }
    let cancelled = false;
    supabase
      .from("vendor_pos")
      .select("id, po_number, po_type, vendors(name)")
      .eq("id", value)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setSelected(toVendorPoOption(data));
      });
    return () => {
      cancelled = true;
    };
    // results intentionally excluded: a fresh search must not re-resolve the label
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, orderPos]);

  // Search all vendor POs as the admin types (debounced).
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      // Match on PO number, or on vendor name via the vendor ids (PostgREST cannot OR across
      // an embedded table, so the vendor half is resolved first).
      const pattern = `%${q.replace(/[%_]/g, "")}%`;
      const { data: vendorRows } = await supabase.from("vendors").select("id").ilike("name", pattern).limit(20);
      const vendorIds = (vendorRows || []).map((v) => v.id);
      const filter = vendorIds.length
        ? `po_number.ilike.${pattern},vendor_id.in.(${vendorIds.join(",")})`
        : `po_number.ilike.${pattern}`;
      const { data } = await supabase
        .from("vendor_pos")
        .select("id, po_number, po_type, vendors(name)")
        .or(filter)
        .order("created_at", { ascending: false })
        .limit(15);
      if (cancelled) return;
      setResults((data || []).map(toVendorPoOption));
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const q = query.trim().toLowerCase();
  const orderMatches = useMemo(
    () =>
      q
        ? orderPos.filter((p) => p.po_number.toLowerCase().includes(q) || (p.vendor_name || "").toLowerCase().includes(q))
        : orderPos,
    [orderPos, q]
  );
  const orderIds = new Set(orderPos.map((p) => p.id));
  const otherMatches = results.filter((p) => !orderIds.has(p.id));

  const pick = (po: VendorPoOption | null) => {
    onChange(po?.id ?? null);
    setSelected(po);
    setOpen(false);
    setQuery("");
  };

  const row = (po: VendorPoOption) => (
    <CommandItem key={po.id} value={po.id} onSelect={() => pick(po)}>
      <Check className={cn("mr-2 h-4 w-4 shrink-0", value === po.id ? "opacity-100" : "opacity-0")} />
      <span className="font-mono text-xs">{po.po_number}</span>
      {po.vendor_name && <span className="ml-2 truncate text-xs text-muted-foreground">{po.vendor_name}</span>}
      {po.po_type === "expense" && <span className="ml-auto pl-2 text-[10px] uppercase text-muted-foreground">expense</span>}
    </CommandItem>
  );

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-7 flex-1 justify-between px-2 text-xs font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? vendorPoLabel(selected) : "Link vendor PO…"}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <Command shouldFilter={false}>
            <CommandInput placeholder="PO number or vendor" value={query} onValueChange={setQuery} />
            <CommandList>
              {orderMatches.length > 0 && <CommandGroup heading="On this order">{orderMatches.map(row)}</CommandGroup>}
              {otherMatches.length > 0 && <CommandGroup heading="All vendor POs">{otherMatches.map(row)}</CommandGroup>}
              {searching && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching
                </div>
              )}
              {!searching && orderMatches.length === 0 && otherMatches.length === 0 && (
                <CommandEmpty>{q.length < 2 ? "Type to search all vendor POs" : "No vendor PO found"}</CommandEmpty>
              )}
              {onCreate && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__create__"
                      onSelect={() => {
                        setOpen(false);
                        setQuery("");
                        onCreate();
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create shipping PO (next number)
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => pick(null)} title="Unlink PO">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export default ShippingVendorPoSelect;

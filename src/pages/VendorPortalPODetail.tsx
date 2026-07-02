import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft, CalendarClock, MapPin, Package, History, Save } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  VENDOR_PO_STATUSES,
  getVendorPoStatusMeta,
  type VendorPoStatus,
} from "@/lib/vendorPoStatus";

interface PoItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_cost: number;
  total: number;
}

interface HistoryRow {
  id: string;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  is_delayed: boolean | null;
  created_at: string;
}

interface PoDetail {
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
  ship_to_street: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  total: number;
}

const parseLocalDate = (s: string | null): Date | undefined => {
  if (!s) return undefined;
  const parts = s.split("T")[0].split("-");
  if (parts.length === 3) return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  try { return parseISO(s); } catch { return undefined; }
};
const fmtDate = (s: string | null): string => {
  const d = parseLocalDate(s);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
};
const fmtMoney = (n: number) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function VendorPortalPODetail() {
  const { poId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [po, setPo] = useState<PoDetail | null>(null);
  const [items, setItems] = useState<PoItem[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable form state
  const [status, setStatus] = useState<VendorPoStatus>("not_started");
  const [shipDate, setShipDate] = useState<Date | undefined>(undefined);
  const [isDelayed, setIsDelayed] = useState(false);
  const [delayReason, setDelayReason] = useState("");
  const [note, setNote] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    if (poId) load(poId);
  }, [poId]);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const { data: poData, error: poErr } = await (supabase as any)
        .from("vendor_pos")
        .select(
          "id, po_number, order_date, expected_delivery_date, vendor_committed_ship_date, production_status, is_delayed, delay_reason, description, ship_to_name, ship_to_street, ship_to_city, ship_to_state, ship_to_zip, total"
        )
        .eq("id", id)
        .maybeSingle();

      if (poErr) throw poErr;
      if (!poData) {
        toast({ title: "Not found", description: "This PO isn't available.", variant: "destructive" });
        navigate("/vendor-portal");
        return;
      }

      setPo(poData as PoDetail);
      setStatus((poData.production_status as VendorPoStatus) || "not_started");
      setShipDate(parseLocalDate(poData.vendor_committed_ship_date));
      setIsDelayed(!!poData.is_delayed);
      setDelayReason(poData.delay_reason || "");

      const [{ data: itemData }, { data: histData }] = await Promise.all([
        (supabase as any)
          .from("vendor_po_items")
          .select("id, sku, name, description, quantity, unit_cost, total")
          .eq("vendor_po_id", id),
        (supabase as any)
          .from("vendor_po_status_history")
          .select("id, previous_status, new_status, note, is_delayed, created_at")
          .eq("vendor_po_id", id)
          .order("created_at", { ascending: false }),
      ]);

      setItems((itemData || []) as PoItem[]);
      setHistory((histData || []) as HistoryRow[]);
    } catch (error: any) {
      console.error("Error loading PO:", error);
      toast({ title: "Error", description: "Failed to load this PO", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!po) return;
    if (isDelayed && !delayReason.trim()) {
      toast({ title: "Reason needed", description: "Add a reason when marking a PO delayed.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("vendor_update_po_status", {
        p_po_id: po.id,
        p_status: status,
        p_committed_ship_date: shipDate ? format(shipDate, "yyyy-MM-dd") : null,
        p_is_delayed: isDelayed,
        p_delay_reason: isDelayed ? delayReason.trim() : null,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Update failed");

      toast({ title: "Saved", description: "Production status updated." });
      setNote("");
      await load(po.id);
    } catch (error: any) {
      console.error("Error saving status:", error);
      toast({ title: "Error", description: error.message || "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!po) return null;

  const meta = getVendorPoStatusMeta(po.production_status);
  const shipTo = [po.ship_to_street, po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(", ");

  return (
    <div className="space-y-6 max-w-4xl">
      <button
        onClick={() => navigate("/vendor-portal")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to my POs
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold font-mono">{po.po_number}</h1>
            <Badge className={meta.badgeClass}>{meta.label}</Badge>
          </div>
          {po.description && <p className="text-sm text-muted-foreground mt-1">{po.description}</p>}
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div>Ordered {fmtDate(po.order_date)}</div>
          {po.expected_delivery_date && <div>Requested by {fmtDate(po.expected_delivery_date)}</div>}
        </div>
      </div>

      {/* Update panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update production status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as VendorPoStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENDOR_PO_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Your committed ship date</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarClock className="h-4 w-4 mr-2" />
                    {shipDate ? format(shipDate, "MMM d, yyyy") : "Select a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={shipDate}
                    onSelect={(d) => { setShipDate(d); setDatePickerOpen(false); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                  {shipDate && (
                    <div className="p-2 border-t">
                      <Button variant="ghost" size="sm" className="w-full text-xs"
                        onClick={() => { setShipDate(undefined); setDatePickerOpen(false); }}>
                        Clear
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm">Flag as delayed</Label>
              <p className="text-xs text-muted-foreground">Let the team know this PO is behind schedule.</p>
            </div>
            <Switch checked={isDelayed} onCheckedChange={setIsDelayed} />
          </div>

          {isDelayed && (
            <div className="space-y-2">
              <Label>Delay reason</Label>
              <Textarea value={delayReason} onChange={(e) => setDelayReason(e.target.value)}
                placeholder="What's causing the delay?" rows={2} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Add an update for the team — recorded in the history below." rows={2} />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Saving…" : "Save update"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {shipTo && (
            <div className="flex items-start gap-1.5 text-sm text-muted-foreground mb-4">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{po.ship_to_name ? `${po.ship_to_name} — ` : ""}{shipTo}</span>
            </div>
          )}
          <div className="divide-y divide-border">
            {items.map((it) => (
              <div key={it.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{it.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{it.sku}</p>
                  {it.description && <p className="text-xs text-muted-foreground mt-0.5">{it.description}</p>}
                </div>
                <div className="text-right text-sm shrink-0">
                  <div className="font-medium">Qty {it.quantity}</div>
                  <div className="text-xs text-muted-foreground">{fmtMoney(it.unit_cost)} ea · {fmtMoney(it.total)}</div>
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="py-3 text-sm text-muted-foreground">No line items on this PO.</p>}
          </div>
          <Separator className="my-3" />
          <div className="flex justify-end text-sm font-semibold">Total {fmtMoney(po.total)}</div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Status history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No updates yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{getVendorPoStatusMeta(h.new_status).label}</span>
                      {h.previous_status && (
                        <span className="text-xs text-muted-foreground">
                          from {getVendorPoStatusMeta(h.previous_status).label}
                        </span>
                      )}
                      {h.is_delayed && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Delayed</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    {h.note && <p className="text-muted-foreground mt-0.5">{h.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

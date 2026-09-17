import { useCallback, useEffect, useState } from "react";
import { Anchor, Check, Circle, Loader2, Plane, Ship, Truck, Trash2, FileCheck, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getTrackingUrl } from "@/lib/trackingUtils";
import { cn } from "@/lib/utils";

/**
 * Shipment tracking for one vendor PO, stored as shipment_legs rows keyed by vendor_po_id.
 *
 * Two shapes:
 *   parcel  one leg   (international, label "parcel")  carrier + tracking number + status
 *   ocean   three legs
 *           1 international, label "ocean"  vessel / voyage, line, ETD, ETA,  pending | in_transit | arrived_at_port
 *           2 customs                       pending | customs_hold | cleared (+ cleared date)
 *           3 domestic                      truck carrier + PRO number,       pending | in_transit | delivered
 *
 * Vibe admin edits here (RLS: vibe_admin ALL on shipment_legs); the customer's production
 * Details page renders the same component read-only (RLS: company members SELECT their own).
 */

interface Leg {
  id: string;
  leg_number: number;
  leg_type: string;
  label: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  vessel_voyage: string | null;
  etd: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  status: string;
}

interface PoShipmentTrackingProps {
  poId: string;
  /** The customer company that owns the PO (vendor_pos.company_id). */
  companyId: string;
  orderId?: string | null;
  editable: boolean;
  /** Fired after a save so the page can refresh anything derived (e.g. the sheet's tracking cell). */
  onChanged?: () => void;
}

type Mode = "none" | "parcel" | "ocean";

const PARCEL_CARRIERS = [
  { value: "ups", label: "UPS" },
  { value: "dhl", label: "DHL" },
  { value: "fedex", label: "FedEx" },
  { value: "usps", label: "USPS" },
  { value: "other", label: "Other" },
];

const VESSEL_STATUSES = [
  { value: "pending", label: "Not sailed yet" },
  { value: "in_transit", label: "On the water" },
  { value: "arrived_at_port", label: "Arrived at port" },
];
const CUSTOMS_STATUSES = [
  { value: "pending", label: "Not started" },
  { value: "customs_hold", label: "In customs" },
  { value: "cleared", label: "Cleared customs" },
];
const TRUCK_STATUSES = [
  { value: "pending", label: "Not picked up" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
];
const PARCEL_STATUSES = [
  { value: "pending", label: "Label created" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
];

const labelFor = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fromDateInput = (d: string) => (d ? `${d}T12:00:00.000Z` : null);
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
const carrierName = (v: string | null) => PARCEL_CARRIERS.find((c) => c.value === v)?.label ?? v ?? "";

const modeOf = (legs: Leg[]): Mode => {
  if (legs.length === 0) return "none";
  if (legs.some((l) => l.label === "ocean" || l.leg_type === "customs")) return "ocean";
  return "parcel";
};

export function PoShipmentTracking({ poId, companyId, orderId, editable, onChanged }: PoShipmentTrackingProps) {
  const { toast } = useToast();
  const [legs, setLegs] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftMode, setDraftMode] = useState<Mode | null>(null);

  // Parcel draft
  const [pCarrier, setPCarrier] = useState("ups");
  const [pTracking, setPTracking] = useState("");
  const [pStatus, setPStatus] = useState("in_transit");

  // Ocean draft
  const [vessel, setVessel] = useState("");
  const [line, setLine] = useState("");
  const [etd, setEtd] = useState("");
  const [eta, setEta] = useState("");
  const [vesselStatus, setVesselStatus] = useState("pending");
  const [customsStatus, setCustomsStatus] = useState("pending");
  const [clearedDate, setClearedDate] = useState("");
  const [truckCarrier, setTruckCarrier] = useState("");
  const [pro, setPro] = useState("");
  const [truckStatus, setTruckStatus] = useState("pending");
  const [deliveredDate, setDeliveredDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("shipment_legs")
        .select(
          "id, leg_number, leg_type, label, carrier, tracking_number, tracking_url, vessel_voyage, etd, estimated_arrival, actual_arrival, status"
        )
        .eq("vendor_po_id", poId)
        .order("leg_number");
      if (error) throw error;
      const rows = (data || []) as Leg[];
      setLegs(rows);

      // Seed the drafts from what is stored.
      const parcel = rows.find((l) => l.label === "parcel");
      if (parcel) {
        setPCarrier(parcel.carrier || "other");
        setPTracking(parcel.tracking_number || "");
        setPStatus(parcel.status || "in_transit");
      }
      const v = rows.find((l) => l.label === "ocean");
      const c = rows.find((l) => l.leg_type === "customs");
      const t = rows.find((l) => l.leg_type === "domestic");
      if (v) {
        setVessel(v.vessel_voyage || "");
        setLine(v.carrier || "");
        setEtd(toDateInput(v.etd));
        setEta(toDateInput(v.estimated_arrival));
        setVesselStatus(v.status || "pending");
      }
      if (c) {
        setCustomsStatus(c.status || "pending");
        setClearedDate(toDateInput(c.actual_arrival));
      }
      if (t) {
        setTruckCarrier(t.carrier || "");
        setPro(t.tracking_number || "");
        setTruckStatus(t.status || "pending");
        setDeliveredDate(toDateInput(t.actual_arrival));
      }
    } catch (error) {
      console.error("Error loading shipment legs:", error);
      setLegs([]);
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    load();
  }, [load]);

  const mode: Mode = draftMode ?? modeOf(legs);

  const base = () => ({ company_id: companyId, order_id: orderId ?? null, vendor_po_id: poId });

  /** Insert or update one leg identified by leg_number. */
  const upsertLeg = async (legNumber: number, values: Partial<Leg> & { leg_type: string }) => {
    const existing = legs.find((l) => l.leg_number === legNumber);
    if (existing) {
      const { error } = await supabase.from("shipment_legs").update(values).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("shipment_legs").insert({ ...base(), leg_number: legNumber, ...values });
      if (error) throw error;
    }
  };

  /** Keep the production sheet's single Tracking cell in step with the last-mile leg. */
  const syncPoTracking = async (carrier: string | null, tracking: string | null) => {
    const url = carrier && tracking ? getTrackingUrl(carrier, tracking) : null;
    await supabase
      .from("vendor_pos")
      .update({ tracking_carrier: carrier || null, tracking_number: tracking || null, tracking_url: url })
      .eq("id", poId);
  };

  const saveParcel = async () => {
    if (!pTracking.trim()) {
      toast({ title: "Tracking number required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const tracking = pTracking.trim();
      await upsertLeg(1, {
        leg_type: "international",
        label: "parcel",
        carrier: pCarrier,
        tracking_number: tracking,
        tracking_url: getTrackingUrl(pCarrier, tracking),
        status: pStatus,
        actual_arrival: pStatus === "delivered" ? new Date().toISOString() : null,
      });
      await syncPoTracking(carrierName(pCarrier), tracking);
      toast({ title: "Tracking saved" });
      setDraftMode(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast({ title: "Could not save tracking", description: (error as { message?: string })?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveOcean = async () => {
    setSaving(true);
    try {
      await upsertLeg(1, {
        leg_type: "international",
        label: "ocean",
        vessel_voyage: vessel.trim() || null,
        carrier: line.trim() || null,
        etd: fromDateInput(etd),
        estimated_arrival: fromDateInput(eta),
        status: vesselStatus,
        actual_arrival: vesselStatus === "arrived_at_port" ? fromDateInput(eta) ?? new Date().toISOString() : null,
      });
      await upsertLeg(2, {
        leg_type: "customs",
        label: "customs",
        status: customsStatus,
        actual_arrival: customsStatus === "cleared" ? fromDateInput(clearedDate) ?? new Date().toISOString() : null,
      });
      const proNumber = pro.trim() || null;
      const truck = truckCarrier.trim() || null;
      await upsertLeg(3, {
        leg_type: "domestic",
        label: "truck",
        carrier: truck,
        tracking_number: proNumber,
        tracking_url: truck && proNumber ? getTrackingUrl(truck, proNumber) : null,
        status: truckStatus,
        actual_arrival: truckStatus === "delivered" ? fromDateInput(deliveredDate) ?? new Date().toISOString() : null,
      });
      if (proNumber) await syncPoTracking(truck, proNumber);
      toast({ title: "Shipment updated" });
      setDraftMode(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast({ title: "Could not save shipment", description: (error as { message?: string })?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const removeAll = async () => {
    if (legs.length === 0) {
      setDraftMode(null);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("shipment_legs").delete().eq("vendor_po_id", poId);
      if (error) throw error;
      await syncPoTracking(null, null);
      setDraftMode(null);
      setPTracking("");
      setVessel("");
      setLine("");
      setEtd("");
      setEta("");
      setVesselStatus("pending");
      setCustomsStatus("pending");
      setClearedDate("");
      setTruckCarrier("");
      setPro("");
      setTruckStatus("pending");
      setDeliveredDate("");
      await load();
      onChanged?.();
    } catch (error) {
      toast({ title: "Could not remove tracking", description: (error as { message?: string })?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ---------- read-only rendering ----------

  const parcelLeg = legs.find((l) => l.label === "parcel");
  const vesselLeg = legs.find((l) => l.label === "ocean");
  const customsLeg = legs.find((l) => l.leg_type === "customs");
  const truckLeg = legs.find((l) => l.leg_type === "domestic");

  type StepState = "done" | "active" | "upcoming";
  const stepIcon = (state: StepState) =>
    state === "done" ? (
      <span className="h-6 w-6 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
        <Check className="h-3.5 w-3.5" />
      </span>
    ) : state === "active" ? (
      <span className="h-6 w-6 rounded-full bg-info/15 text-info flex items-center justify-center shrink-0">
        <Circle className="h-3 w-3 fill-current" />
      </span>
    ) : (
      <span className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <Circle className="h-3 w-3" />
      </span>
    );

  const step = (state: StepState, icon: React.ReactNode, title: string, detail: React.ReactNode, statusText: string | null) => (
    <div className={cn("flex items-start gap-3", state === "upcoming" && "opacity-60")}>
      {stepIcon(state)}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            {icon}
            {title}
          </span>
          {statusText && (
            <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-normal">
              {statusText}
            </Badge>
          )}
        </div>
        {detail && <div className="text-sm text-muted-foreground mt-0.5">{detail}</div>}
      </div>
    </div>
  );

  const trackingLink = (leg: Leg | undefined) =>
    leg?.tracking_number ? (
      leg.tracking_url ? (
        <a href={leg.tracking_url} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline inline-flex items-center gap-1">
          {leg.tracking_number}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="font-mono text-foreground">{leg.tracking_number}</span>
      )
    ) : null;

  const readOnlyView = () => {
    if (mode === "none") {
      return <p className="text-sm text-muted-foreground">No shipment tracking yet.</p>;
    }
    if (mode === "parcel") {
      const done = parcelLeg?.status === "delivered";
      return step(
        done ? "done" : "active",
        <Plane className="h-4 w-4 text-muted-foreground" />,
        carrierName(parcelLeg?.carrier ?? null) || "Parcel",
        trackingLink(parcelLeg),
        parcelLeg ? labelFor(PARCEL_STATUSES, parcelLeg.status) : null
      );
    }
    const vesselState: StepState =
      vesselLeg?.status === "arrived_at_port" ? "done" : vesselLeg?.status === "in_transit" ? "active" : vesselLeg?.vessel_voyage ? "active" : "upcoming";
    const customsState: StepState =
      customsLeg?.status === "cleared" ? "done" : customsLeg?.status === "customs_hold" ? "active" : "upcoming";
    const truckState: StepState =
      truckLeg?.status === "delivered" ? "done" : truckLeg?.status === "in_transit" || truckLeg?.tracking_number ? "active" : "upcoming";
    return (
      <div className="space-y-4">
        {step(
          vesselState,
          <Ship className="h-4 w-4 text-muted-foreground" />,
          "Ocean freight",
          <>
            {vesselLeg?.vessel_voyage && (
              <div>
                Vessel <span className="font-mono text-foreground">{vesselLeg.vessel_voyage}</span>
                {vesselLeg.carrier ? ` · ${vesselLeg.carrier}` : ""}
              </div>
            )}
            {(vesselLeg?.etd || vesselLeg?.estimated_arrival) && (
              <div>
                {vesselLeg.etd ? `Sailed ${fmtDate(vesselLeg.etd)}` : ""}
                {vesselLeg.etd && vesselLeg.estimated_arrival ? " · " : ""}
                {vesselLeg.estimated_arrival
                  ? `${vesselLeg.status === "arrived_at_port" ? "Arrived" : "ETA"} ${fmtDate(vesselLeg.estimated_arrival)}`
                  : ""}
              </div>
            )}
          </>,
          vesselLeg ? labelFor(VESSEL_STATUSES, vesselLeg.status) : null
        )}
        {step(
          customsState,
          <Anchor className="h-4 w-4 text-muted-foreground" />,
          "Customs",
          customsLeg?.status === "cleared" && customsLeg.actual_arrival ? `Cleared ${fmtDate(customsLeg.actual_arrival)}` : null,
          customsLeg ? labelFor(CUSTOMS_STATUSES, customsLeg.status) : null
        )}
        {step(
          truckState,
          <Truck className="h-4 w-4 text-muted-foreground" />,
          "Truck delivery",
          <>
            {truckLeg?.carrier && <span>{truckLeg.carrier} </span>}
            {truckLeg?.tracking_number && (
              <span>
                PRO {trackingLink(truckLeg)}
              </span>
            )}
            {truckLeg?.status === "delivered" && truckLeg.actual_arrival && <div>Delivered {fmtDate(truckLeg.actual_arrival)}</div>}
          </>,
          truckLeg ? labelFor(TRUCK_STATUSES, truckLeg.status) : null
        )}
      </div>
    );
  };

  // ---------- admin editing ----------

  const statusSelect = (value: string, onChange: (v: string) => void, opts: { value: string; label: string }[]) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const editView = () => {
    if (mode === "none") {
      return (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" type="button" onClick={() => setDraftMode("parcel")}>
            <Plane className="h-4 w-4 mr-2" />
            Air / parcel (UPS, DHL...)
          </Button>
          <Button variant="outline" type="button" onClick={() => setDraftMode("ocean")}>
            <Ship className="h-4 w-4 mr-2" />
            Ocean freight
          </Button>
        </div>
      );
    }

    if (mode === "parcel") {
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr_11rem]">
            <div className="space-y-1.5">
              <Label>Carrier</Label>
              {statusSelect(pCarrier, setPCarrier, PARCEL_CARRIERS)}
            </div>
            <div className="space-y-1.5">
              <Label>Tracking number</Label>
              <Input value={pTracking} onChange={(e) => setPTracking(e.target.value)} placeholder="1Z..." className="h-9 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              {statusSelect(pStatus, setPStatus, PARCEL_STATUSES)}
            </div>
          </div>
          {footer(saveParcel)}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <section className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Ship className="h-4 w-4 text-muted-foreground" /> 1. Ocean freight
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_9rem_9rem_11rem]">
            <div className="space-y-1.5">
              <Label>Vessel / voyage</Label>
              <Input value={vessel} onChange={(e) => setVessel(e.target.value)} placeholder="e.g. MSC ANNA 034N" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>Shipping line (optional)</Label>
              <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="e.g. Matson" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>Sailed (ETD)</Label>
              <Input type="date" value={etd} onChange={(e) => setEtd(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>ETA port</Label>
              <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              {statusSelect(vesselStatus, setVesselStatus, VESSEL_STATUSES)}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Anchor className="h-4 w-4 text-muted-foreground" /> 2. Customs
          </h4>
          <div className="grid gap-3 sm:grid-cols-[11rem_9rem]">
            <div className="space-y-1.5">
              <Label>Status</Label>
              {statusSelect(customsStatus, setCustomsStatus, CUSTOMS_STATUSES)}
            </div>
            {customsStatus === "cleared" && (
              <div className="space-y-1.5">
                <Label>Cleared on</Label>
                <Input type="date" value={clearedDate} onChange={(e) => setClearedDate(e.target.value)} className="h-9" />
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" /> 3. Truck delivery
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_11rem_9rem]">
            <div className="space-y-1.5">
              <Label>Carrier</Label>
              <Input value={truckCarrier} onChange={(e) => setTruckCarrier(e.target.value)} placeholder="e.g. XPO, Arc Best" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>PRO number</Label>
              <Input value={pro} onChange={(e) => setPro(e.target.value)} placeholder="PRO #" className="h-9 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              {statusSelect(truckStatus, setTruckStatus, TRUCK_STATUSES)}
            </div>
            {truckStatus === "delivered" && (
              <div className="space-y-1.5">
                <Label>Delivered on</Label>
                <Input type="date" value={deliveredDate} onChange={(e) => setDeliveredDate(e.target.value)} className="h-9" />
              </div>
            )}
          </div>
        </section>

        {footer(saveOcean)}
      </div>
    );
  };

  const footer = (onSave: () => void) => (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <Button
        variant="ghost"
        size="sm"
        type="button"
        className="text-muted-foreground hover:text-destructive"
        onClick={removeAll}
        disabled={saving}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        {legs.length > 0 ? "Remove tracking" : "Cancel"}
      </Button>
      <Button type="button" onClick={onSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck className="h-4 w-4 mr-2" />}
        Save
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" />
          Shipment tracking
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </div>
        ) : editable ? (
          editView()
        ) : (
          readOnlyView()
        )}
      </CardContent>
    </Card>
  );
}

export default PoShipmentTracking;

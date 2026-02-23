import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, AlertCircle, CheckCircle2, Ship, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

interface ShipmentLeg {
  leg_id: string;
  order_id: string;
  order_number: string;
  leg_number: number;
  leg_type: string;
  label: string | null;
  origin: string | null;
  destination: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  status: string;
  notes: string | null;
  shipped_date: string | null;
}

interface EditedFields {
  carrier?: string;
  tracking_number?: string;
  estimated_arrival?: string;
  notes?: string;
  origin?: string;
  destination?: string;
  leg_type?: string;
  status?: string;
}

interface NewLeg {
  id: string; // temp client ID
  order_id: string;
  order_number: string;
  leg_type: string;
  origin: string;
  destination: string;
  carrier: string;
  tracking_number: string;
  estimated_arrival: string;
  notes: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_transit: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  delivered: "bg-green-500/15 text-green-400 border-green-500/30",
  customs_hold: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  cleared: "bg-green-500/15 text-green-400 border-green-500/30",
};

const LEG_TYPES = ["international", "customs", "domestic"];
const STATUSES = ["pending", "in_transit", "delivered", "customs_hold", "cleared"];

export default function ShipmentUpdate() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [legs, setLegs] = useState<ShipmentLeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditedFields>>({});
  const [newLegs, setNewLegs] = useState<NewLeg[]>([]);

  // Get unique orders for the "Add Leg" dropdown
  const uniqueOrders = legs.reduce<{ order_id: string; order_number: string }[]>((acc, leg) => {
    if (!acc.find((o) => o.order_id === leg.order_id)) {
      acc.push({ order_id: leg.order_id, order_number: leg.order_number });
    }
    return acc;
  }, []);

  const fetchLegs = useCallback(async () => {
    if (!token) {
      setError("No token provided");
      setLoading(false);
      return;
    }
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_shipment_legs_by_token" as any,
        { p_token: token }
      );
      if (rpcError) throw rpcError;
      if (!data || (data as any[]).length === 0) {
        setError("This link is invalid or has expired.");
        setLegs([]);
      } else {
        setLegs(data as unknown as ShipmentLeg[]);
        setError(null);
      }
    } catch (err: any) {
      console.error("Error fetching shipment legs:", err);
      setError("Failed to load shipment data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchLegs();
  }, [fetchLegs]);

  const updateField = (legId: string, field: keyof EditedFields, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [legId]: { ...prev[legId], [field]: value },
    }));
  };

  const addNewLeg = (orderId: string) => {
    const order = uniqueOrders.find((o) => o.order_id === orderId);
    if (!order) return;
    setNewLegs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        order_id: orderId,
        order_number: order.order_number,
        leg_type: "domestic",
        origin: "",
        destination: "",
        carrier: "",
        tracking_number: "",
        estimated_arrival: "",
        notes: "",
      },
    ]);
  };

  const updateNewLeg = (id: string, field: keyof Omit<NewLeg, "id" | "order_id" | "order_number">, value: string) => {
    setNewLegs((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const removeNewLeg = (id: string) => {
    setNewLegs((prev) => prev.filter((l) => l.id !== id));
  };

  const modifiedCount = Object.keys(edits).length + newLegs.length;

  const handleSave = async () => {
    if (!token || modifiedCount === 0) return;
    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    // Save edits to existing legs
    for (const [legId, fields] of Object.entries(edits)) {
      try {
        const params: any = { p_token: token, p_leg_id: legId };
        if (fields.carrier !== undefined) params.p_carrier = fields.carrier;
        if (fields.tracking_number !== undefined) params.p_tracking_number = fields.tracking_number;
        if (fields.estimated_arrival !== undefined)
          params.p_estimated_arrival = fields.estimated_arrival || null;
        if (fields.notes !== undefined) params.p_notes = fields.notes;
        if (fields.origin !== undefined) params.p_origin = fields.origin;
        if (fields.destination !== undefined) params.p_destination = fields.destination;
        if (fields.leg_type !== undefined) params.p_leg_type = fields.leg_type;
        if (fields.status !== undefined) params.p_status = fields.status;

        const { data, error: rpcError } = await supabase.rpc(
          "update_shipment_leg_public" as any,
          params
        );
        if (rpcError) throw rpcError;
        const result = data as any;
        if (result?.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    // Save new legs
    for (const leg of newLegs) {
      try {
        const params: any = {
          p_token: token,
          p_order_id: leg.order_id,
          p_leg_type: leg.leg_type,
        };
        if (leg.origin) params.p_origin = leg.origin;
        if (leg.leg_type === "customs") {
          params.p_destination = leg.origin; // customs: destination = origin
        } else if (leg.destination) {
          params.p_destination = leg.destination;
        }
        if (leg.carrier) params.p_carrier = leg.carrier;
        if (leg.tracking_number) params.p_tracking_number = leg.tracking_number;
        if (leg.estimated_arrival) params.p_estimated_arrival = leg.estimated_arrival;
        if (leg.notes) params.p_notes = leg.notes;

        const { data, error: rpcError } = await supabase.rpc(
          "add_shipment_leg_public" as any,
          params
        );
        if (rpcError) throw rpcError;
        const result = data as any;
        if (result?.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast({ title: "Saved", description: `${successCount} update(s) saved successfully.` });
      setEdits({});
      setNewLegs([]);
      fetchLegs();
    }
    if (errorCount > 0) {
      toast({ title: "Error", description: `${errorCount} update(s) failed.`, variant: "destructive" });
    }
    setSaving(false);
  };

  const getValue = (leg: ShipmentLeg, field: keyof EditedFields): string => {
    const edited = edits[leg.leg_id];
    if (edited && edited[field] !== undefined) return edited[field]!;
    return (leg[field] as string) || "";
  };

  const formatEta = (leg: ShipmentLeg): string => {
    const edited = edits[leg.leg_id];
    if (edited?.estimated_arrival !== undefined) return edited.estimated_arrival;
    if (!leg.estimated_arrival) return "";
    return leg.estimated_arrival.split("T")[0];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Toaster />
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">Link Unavailable</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <img src="/images/vibe-logo.png" alt="VibePKG" className="h-8 w-auto" />
            <div>
              <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Ship className="h-5 w-5" />
                Shipment Update
              </h1>
              <p className="text-xs text-muted-foreground">
                Add legs, update carrier, tracking, and ETA information below
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {uniqueOrders.length > 0 && (
              <Select onValueChange={(val) => addNewLeg(val)}>
                <SelectTrigger className="h-9 w-auto min-w-[160px] text-xs">
                  <div className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    <SelectValue placeholder="Add Leg to Order..." />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {uniqueOrders.map((o) => (
                    <SelectItem key={o.order_id} value={o.order_id}>
                      {o.order_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {modifiedCount > 0 && (
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save {modifiedCount} Change{modifiedCount > 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Table */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-border bg-muted">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Order #</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Leg</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Type</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Origin</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Destination</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Carrier</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Tracking #</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">ETA</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Notes</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Existing legs */}
              {legs.map((leg) => {
                const isEdited = !!edits[leg.leg_id];
                return (
                  <tr
                    key={leg.leg_id}
                    className={`border-b border-border transition-colors ${isEdited ? "bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">{leg.order_number}</td>
                    <td className="px-3 py-2 text-center">{leg.leg_number}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={getValue(leg, "leg_type") || leg.leg_type}
                        onValueChange={(val) => updateField(leg.leg_id, "leg_type", val)}
                      >
                        <SelectTrigger className="h-8 text-xs min-w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEG_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={getValue(leg, "origin")}
                        onChange={(e) => updateField(leg.leg_id, "origin", e.target.value)}
                        placeholder="Origin"
                        className="h-8 text-xs min-w-[120px]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={getValue(leg, "destination")}
                        onChange={(e) => updateField(leg.leg_id, "destination", e.target.value)}
                        placeholder="Destination"
                        className="h-8 text-xs min-w-[120px]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={getValue(leg, "carrier")}
                        onChange={(e) => updateField(leg.leg_id, "carrier", e.target.value)}
                        placeholder="e.g. UPS, FedEx"
                        className="h-8 text-xs min-w-[120px]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={getValue(leg, "tracking_number")}
                        onChange={(e) => updateField(leg.leg_id, "tracking_number", e.target.value)}
                        placeholder="Tracking/PRO #"
                        className="h-8 text-xs min-w-[140px]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        value={formatEta(leg)}
                        onChange={(e) => updateField(leg.leg_id, "estimated_arrival", e.target.value)}
                        className="h-8 text-xs min-w-[130px]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Textarea
                        value={getValue(leg, "notes")}
                        onChange={(e) => updateField(leg.leg_id, "notes", e.target.value)}
                        placeholder="Notes..."
                        className="min-h-[32px] h-8 text-xs min-w-[150px] resize-none"
                        rows={1}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={getValue(leg, "status") || leg.status}
                        onValueChange={(val) => updateField(leg.leg_id, "status", val)}
                      >
                        <SelectTrigger className={`h-8 text-xs min-w-[120px] ${statusColors[getValue(leg, "status") || leg.status] || ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}

              {/* New legs */}
              {newLegs.map((leg) => (
                <tr key={leg.id} className="border-b border-border bg-green-500/5">
                  <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30">NEW</Badge>
                      {leg.order_number}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                  <td className="px-3 py-2">
                    <Select value={leg.leg_type} onValueChange={(val) => updateNewLeg(leg.id, "leg_type", val)}>
                      <SelectTrigger className="h-8 text-xs min-w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEG_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input value={leg.origin} onChange={(e) => updateNewLeg(leg.id, "origin", e.target.value)} placeholder={leg.leg_type === "customs" ? "Location (e.g. Los Angeles)" : "Origin"} className="h-8 text-xs min-w-[120px]" />
                  </td>
                  <td className="px-3 py-2">
                    {leg.leg_type === "customs" ? (
                      <span className="text-xs text-muted-foreground italic px-1">Same as origin</span>
                    ) : (
                      <Input value={leg.destination} onChange={(e) => updateNewLeg(leg.id, "destination", e.target.value)} placeholder="Destination" className="h-8 text-xs min-w-[120px]" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input value={leg.carrier} onChange={(e) => updateNewLeg(leg.id, "carrier", e.target.value)} placeholder="e.g. UPS, FedEx" className="h-8 text-xs min-w-[120px]" />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={leg.tracking_number} onChange={(e) => updateNewLeg(leg.id, "tracking_number", e.target.value)} placeholder="Tracking/PRO #" className="h-8 text-xs min-w-[140px]" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="date" value={leg.estimated_arrival} onChange={(e) => updateNewLeg(leg.id, "estimated_arrival", e.target.value)} className="h-8 text-xs min-w-[130px]" />
                  </td>
                  <td className="px-3 py-2">
                    <Textarea value={leg.notes} onChange={(e) => updateNewLeg(leg.id, "notes", e.target.value)} placeholder="Notes..." className="min-h-[32px] h-8 text-xs min-w-[150px] resize-none" rows={1} />
                  </td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeNewLeg(leg.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom save bar for mobile */}
        {modifiedCount > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 sm:hidden">
            <Button onClick={handleSave} disabled={saving} size="lg" className="shadow-lg rounded-full px-6">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Save {modifiedCount} Change{modifiedCount > 1 ? "s" : ""}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, AlertCircle, CheckCircle2, Ship } from "lucide-react";
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
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_transit: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  delivered: "bg-green-500/15 text-green-400 border-green-500/30",
  customs_hold: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  cleared: "bg-green-500/15 text-green-400 border-green-500/30",
};

export default function ShipmentUpdate() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [legs, setLegs] = useState<ShipmentLeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditedFields>>({});

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

  const modifiedCount = Object.keys(edits).length;

  const handleSave = async () => {
    if (!token || modifiedCount === 0) return;
    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const [legId, fields] of Object.entries(edits)) {
      try {
        const params: any = { p_token: token, p_leg_id: legId };
        if (fields.carrier !== undefined) params.p_carrier = fields.carrier;
        if (fields.tracking_number !== undefined) params.p_tracking_number = fields.tracking_number;
        if (fields.estimated_arrival !== undefined)
          params.p_estimated_arrival = fields.estimated_arrival || null;
        if (fields.notes !== undefined) params.p_notes = fields.notes;

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

    if (successCount > 0) {
      toast({ title: "Saved", description: `${successCount} leg(s) updated successfully.` });
      setEdits({});
      fetchLegs();
    }
    if (errorCount > 0) {
      toast({ title: "Error", description: `${errorCount} leg(s) failed to update.`, variant: "destructive" });
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
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/vibe-logo.png" alt="VibePKG" className="h-8 w-auto" />
            <div>
              <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Ship className="h-5 w-5" />
                Shipment Update
              </h1>
              <p className="text-xs text-muted-foreground">
                Update carrier, tracking, and ETA information below
              </p>
            </div>
          </div>
          {modifiedCount > 0 && (
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save {modifiedCount} Change{modifiedCount > 1 ? "s" : ""}
            </Button>
          )}
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
              {legs.map((leg) => {
                const isEdited = !!edits[leg.leg_id];
                return (
                  <tr
                    key={leg.leg_id}
                    className={`border-b border-border transition-colors ${isEdited ? "bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">{leg.order_number}</td>
                    <td className="px-3 py-2 text-center">{leg.leg_number}</td>
                    <td className="px-3 py-2 whitespace-nowrap capitalize">{leg.leg_type}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{leg.origin || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{leg.destination || "—"}</td>
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
                      <Badge variant="outline" className={`text-xs whitespace-nowrap ${statusColors[leg.status] || ""}`}>
                        {leg.status.replace("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
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

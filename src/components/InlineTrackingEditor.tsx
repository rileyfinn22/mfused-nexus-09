import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, ExternalLink, Edit, Save, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getTrackingUrl, CARRIERS } from "@/lib/trackingUtils";

interface InlineTrackingEditorProps {
  vendorPoId: string;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  onUpdated?: () => void;
  compact?: boolean;
}

const isCustomCarrier = (val: string) => val !== "" && !CARRIERS.some((c) => c.value === val);

export function InlineTrackingEditor({
  vendorPoId,
  trackingCarrier,
  trackingNumber,
  onUpdated,
  compact = false,
}: InlineTrackingEditorProps) {
  const [editing, setEditing] = useState(false);
  const [carrier, setCarrier] = useState(trackingCarrier || "");
  const [customCarrier, setCustomCarrier] = useState(isCustomCarrier(trackingCarrier || "") ? trackingCarrier || "" : "");
  const [useCustom, setUseCustom] = useState(isCustomCarrier(trackingCarrier || ""));
  const [number, setNumber] = useState(trackingNumber || "");
  const [saving, setSaving] = useState(false);
  const [savedCarrier, setSavedCarrier] = useState(trackingCarrier);
  const [savedNumber, setSavedNumber] = useState(trackingNumber);

  const effectiveCarrier = useCustom ? customCarrier : carrier;

  const handleSave = async () => {
    setSaving(true);
    const trackingUrl = number ? getTrackingUrl(effectiveCarrier, number) : null;
    const { error } = await supabase
      .from("vendor_pos")
      .update({
        tracking_carrier: effectiveCarrier || null,
        tracking_number: number || null,
        tracking_url: trackingUrl || null,
      } as any)
      .eq("id", vendorPoId);

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Failed to save tracking", variant: "destructive" });
      return;
    }
    setSavedCarrier(effectiveCarrier || null);
    setSavedNumber(number || null);
    toast({ title: "Tracking Updated" });
    setEditing(false);
  };

  const handleCancel = () => {
    const sc = savedCarrier || "";
    const isCust = isCustomCarrier(sc);
    setCarrier(isCust ? "" : sc);
    setCustomCarrier(isCust ? sc : "");
    setUseCustom(isCust);
    setNumber(savedNumber || "");
    setEditing(false);
  };

  const handleCarrierSelect = (val: string) => {
    if (val === "__custom__") {
      setUseCustom(true);
      setCarrier("");
    } else {
      setUseCustom(false);
      setCarrier(val);
    }
  };

  if (editing) {
    return (
      <div className={`flex items-center gap-2 ${compact ? "" : "mt-2"}`} onClick={(e) => e.stopPropagation()}>
        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {useCustom ? (
          <div className="flex items-center gap-1">
            <Input
              placeholder="Carrier name"
              value={customCarrier}
              onChange={(e) => setCustomCarrier(e.target.value)}
              className="h-7 text-xs w-[120px]"
              autoFocus
            />
            <Button size="sm" variant="ghost" className="h-7 px-1 text-xs text-muted-foreground" onClick={() => { setUseCustom(false); setCustomCarrier(""); }}>
              ← list
            </Button>
          </div>
        ) : (
          <Select value={carrier} onValueChange={handleCarrierSelect}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue placeholder="Carrier" />
            </SelectTrigger>
            <SelectContent>
              {CARRIERS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
              <SelectItem value="__custom__" className="text-muted-foreground italic">
                Type manually…
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        <Input
          placeholder="Tracking #"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="h-7 text-xs w-[200px] font-mono"
        />
        <Button size="sm" variant="default" className="h-7 px-2" onClick={handleSave} disabled={saving}>
          <Save className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleCancel}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  if (savedNumber) {
    const url = getTrackingUrl(savedCarrier || "", savedNumber);
    const carrierLabel = CARRIERS.find((c) => c.value === savedCarrier)?.label || savedCarrier;
    return (
      <div className={`flex items-center gap-2 ${compact ? "" : "mt-2"}`}>
        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {carrierLabel && (
          <Badge variant="outline" className="text-xs py-0 h-5">
            {carrierLabel}
          </Badge>
        )}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
          >
            {savedNumber}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs font-mono">{savedNumber}</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Edit className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "mt-2"}`}>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs text-muted-foreground hover:text-foreground px-2 gap-1"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <Package className="h-3 w-3" />
        + Add Tracking
      </Button>
    </div>
  );
}

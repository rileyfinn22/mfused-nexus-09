import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { CARRIERS, LEG_TYPE_LABELS, getTrackingUrl } from "@/lib/trackingUtils";

interface AddShipmentLegDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (leg: LegFormData) => Promise<void>;
  nextLegNumber: number;
}

export interface LegFormData {
  leg_type: string;
  label: string;
  carrier: string;
  tracking_number: string;
  origin: string;
  destination: string;
  shipped_date: string;
  estimated_arrival: string;
  notes: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  international: 'International Freight',
  customs: 'Customs Clearance',
  domestic: 'Domestic Delivery',
};

export function AddShipmentLegDialog({ open, onOpenChange, onSubmit, nextLegNumber }: AddShipmentLegDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<LegFormData>({
    leg_type: 'international',
    label: DEFAULT_LABELS['international'],
    carrier: '',
    tracking_number: '',
    origin: '',
    destination: '',
    shipped_date: '',
    estimated_arrival: '',
    notes: '',
  });

  const handleTypeChange = (type: string) => {
    setForm(prev => ({
      ...prev,
      leg_type: type,
      label: DEFAULT_LABELS[type] || '',
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit(form);
      // Reset
      setForm({
        leg_type: 'international',
        label: DEFAULT_LABELS['international'],
        carrier: '',
        tracking_number: '',
        origin: '',
        destination: '',
        shipped_date: '',
        estimated_arrival: '',
        notes: '',
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Shipping Leg #{nextLegNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Leg Type</Label>
            <Select value={form.leg_type} onValueChange={handleTypeChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="international">International Freight</SelectItem>
                <SelectItem value="customs">Customs Clearance</SelectItem>
                <SelectItem value="domestic">Domestic Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Label</Label>
            <Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="e.g. China to US Port" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Origin</Label>
              <Input value={form.origin} onChange={e => setForm(p => ({ ...p, origin: e.target.value }))} placeholder="Shanghai, China" />
            </div>
            <div>
              <Label>Destination</Label>
              <Input value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))} placeholder="Los Angeles, CA" />
            </div>
          </div>

          {form.leg_type !== 'customs' && (
            <>
              <div>
                <Label>Carrier</Label>
                <Select value={form.carrier} onValueChange={val => setForm(p => ({ ...p, carrier: val }))}>
                  <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
                  <SelectContent>
                    {CARRIERS.map(c => (
                      <SelectItem key={c.value} value={c.label}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tracking Number</Label>
                <Input value={form.tracking_number} onChange={e => setForm(p => ({ ...p, tracking_number: e.target.value }))} placeholder="Enter tracking number" />
                {form.carrier && form.tracking_number && (
                  <p className="text-xs text-muted-foreground mt-1">
                    URL: <a href={getTrackingUrl(form.carrier, form.tracking_number)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Preview tracking link
                    </a>
                  </p>
                )}
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{form.leg_type === 'customs' ? 'Submitted Date' : 'Shipped Date'}</Label>
              <Input type="date" value={form.shipped_date} onChange={e => setForm(p => ({ ...p, shipped_date: e.target.value }))} />
            </div>
            <div>
              <Label>Estimated Arrival</Label>
              <Input type="date" value={form.estimated_arrival} onChange={e => setForm(p => ({ ...p, estimated_arrival: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Leg
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

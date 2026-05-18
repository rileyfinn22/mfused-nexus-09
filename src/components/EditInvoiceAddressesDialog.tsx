import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  order: any;
  onSaved: (updated: any) => void;
}

const FIELDS = ["name", "street", "city", "state", "zip"] as const;

export function EditInvoiceAddressesDialog({ open, onOpenChange, invoice, order, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [ship, setShip] = useState<Record<string, string>>({});
  const [bill, setBill] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !invoice) return;
    setShip({
      name: invoice.shipping_name ?? order?.shipping_name ?? "",
      street: invoice.shipping_street ?? order?.shipping_street ?? "",
      city: invoice.shipping_city ?? order?.shipping_city ?? "",
      state: invoice.shipping_state ?? order?.shipping_state ?? "",
      zip: invoice.shipping_zip ?? order?.shipping_zip ?? "",
    });
    setBill({
      name: invoice.billing_name ?? order?.billing_name ?? "",
      street: invoice.billing_street ?? order?.billing_street ?? "",
      city: invoice.billing_city ?? order?.billing_city ?? "",
      state: invoice.billing_state ?? order?.billing_state ?? "",
      zip: invoice.billing_zip ?? order?.billing_zip ?? "",
    });
  }, [open, invoice, order]);

  const handleSave = async () => {
    try {
      setLoading(true);
      const payload: any = {
        shipping_name: ship.name || null,
        shipping_street: ship.street || null,
        shipping_city: ship.city || null,
        shipping_state: ship.state || null,
        shipping_zip: ship.zip || null,
        billing_name: bill.name || null,
        billing_street: bill.street || null,
        billing_city: bill.city || null,
        billing_state: bill.state || null,
        billing_zip: bill.zip || null,
      };
      const { error } = await supabase.from("invoices").update(payload).eq("id", invoice.id);
      if (error) throw error;
      onSaved({ ...invoice, ...payload });
      toast({ title: "Addresses updated" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyFromShip = () => setBill({ ...ship });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Invoice Addresses</DialogTitle>
          <DialogDescription>
            These override the order's addresses for this invoice only.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Ship To</h3>
            {FIELDS.map((f) => (
              <div key={`s-${f}`} className="space-y-1">
                <Label className="capitalize">{f}</Label>
                <Input
                  value={ship[f] || ""}
                  onChange={(e) => setShip((p) => ({ ...p, [f]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Bill To</h3>
              <Button variant="ghost" size="sm" onClick={copyFromShip} type="button">
                Same as Ship To
              </Button>
            </div>
            {FIELDS.map((f) => (
              <div key={`b-${f}`} className="space-y-1">
                <Label className="capitalize">{f}</Label>
                <Input
                  value={bill[f] || ""}
                  onChange={(e) => setBill((p) => ({ ...p, [f]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

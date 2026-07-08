import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  order: any;
  onSaved: (updated: any) => void;
}

const FIELDS = ["name", "street", "city", "state", "zip"] as const;

type AddressRow = {
  id: string;
  address_type: string;
  customer_name: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

export function EditInvoiceAddressesDialog({ open, onOpenChange, invoice, order, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [ship, setShip] = useState<Record<string, string>>({});
  const [bill, setBill] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<AddressRow[]>([]);
  const [savingShip, setSavingShip] = useState(false);
  const [savingBill, setSavingBill] = useState(false);

  const companyId = invoice?.company_id ?? order?.company_id;

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

  const loadSaved = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("customer_addresses")
      .select("id, address_type, customer_name, name, street, city, state, zip")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setSaved((data as AddressRow[]) ?? []);
  };

  useEffect(() => {
    if (open) loadSaved();
  }, [open, companyId]);

  const applyAddress = (target: "ship" | "bill", id: string) => {
    const row = saved.find((s) => s.id === id);
    if (!row) return;
    const next = { name: row.name, street: row.street, city: row.city, state: row.state, zip: row.zip };
    if (target === "ship") setShip(next);
    else setBill(next);
  };

  const saveAddress = async (target: "ship" | "bill") => {
    if (!companyId) {
      toast({ title: "Missing company", description: "Cannot save address without a company.", variant: "destructive" });
      return;
    }
    const src = target === "ship" ? ship : bill;
    if (!src.name || !src.street || !src.city || !src.state || !src.zip) {
      toast({ title: "Incomplete address", description: "Fill name, street, city, state, and zip first.", variant: "destructive" });
      return;
    }
    const setBusy = target === "ship" ? setSavingShip : setSavingBill;
    setBusy(true);
    try {
      const { error } = await supabase.from("customer_addresses").insert({
        company_id: companyId,
        customer_name: src.name,
        address_type: target === "ship" ? "shipping" : "billing",
        name: src.name,
        street: src.street,
        city: src.city,
        state: src.state,
        zip: src.zip,
      });
      if (error) throw error;
      toast({ title: "Address saved", description: "Available for future invoices." });
      await loadSaved();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

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

      // Also propagate to the parent order so future invoices/documents match.
      const orderId = invoice.order_id ?? order?.id;
      if (orderId) {
        const { error: orderErr } = await supabase.from("orders").update(payload).eq("id", orderId);
        if (orderErr) console.error("Failed to sync addresses to order:", orderErr);
      }

      onSaved({ ...invoice, ...payload });
      toast({ title: "Addresses updated", description: "Invoice and order addresses are now in sync." });
      onOpenChange(false);

    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyFromShip = () => setBill({ ...ship });

  const shipOptions = saved.filter((s) => s.address_type === "shipping");
  const billOptions = saved.filter((s) => s.address_type === "billing");

  const renderPanel = (
    target: "ship" | "bill",
    title: string,
    state: Record<string, string>,
    setState: (s: Record<string, string>) => void,
    options: AddressRow[],
    busy: boolean,
    extraHeader?: React.ReactNode,
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {extraHeader}
      </div>
      <div className="flex items-center gap-2">
        <Select onValueChange={(v) => applyAddress(target, v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={options.length ? "Load saved address…" : "No saved addresses yet"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name} — {o.city}, {o.state}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => saveAddress(target)}
          disabled={busy}
          title="Save this address for reuse"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {FIELDS.map((f) => (
        <div key={`${target}-${f}`} className="space-y-1">
          <Label className="capitalize">{f}</Label>
          <Input
            value={state[f] || ""}
            onChange={(e) => setState({ ...state, [f]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Invoice Addresses</DialogTitle>
          <DialogDescription>
            These override the order's addresses for this invoice only. Load a saved address or save the current one for reuse.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          {renderPanel("ship", "Ship To", ship, setShip, shipOptions, savingShip)}
          {renderPanel(
            "bill",
            "Bill To",
            bill,
            setBill,
            billOptions,
            savingBill,
            <Button variant="ghost" size="sm" onClick={copyFromShip} type="button">
              Same as Ship To
            </Button>,
          )}
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

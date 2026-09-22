import { useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { nextVendorPoNumber } from "@/lib/vendorPoNumber";
import type { VendorPoOption } from "@/lib/vendorPo";

interface CreateShippingPoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Invoice the freight is billed on; the PO attaches to its order and company. */
  invoice: { id: string; invoice_number: string; order_id: string | null; company_id: string | null };
  /** Shipping amount currently on the invoice, offered as the default vendor cost. */
  defaultCost: number;
  onCreated: (po: VendorPoOption) => void;
}

interface Vendor {
  id: string;
  name: string;
}

/**
 * Mints a vendor PO for the freight behind an invoice's shipping line: next number in the
 * running sequence, one SHIPPING line, po_type "expense" so it stays off the production
 * sheets and out of the customer's view. Vibe admin only.
 */
export function CreateShippingPoDialog({ open, onOpenChange, invoice, defaultCost, onCreated }: CreateShippingPoDialogProps) {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [cost, setCost] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setVendorId("");
    setCost(defaultCost > 0 ? defaultCost.toFixed(2) : "");
    setDescription(`Shipping for Invoice ${invoice.invoice_number}`);
    setLoadingVendors(true);
    supabase
      .from("vendors")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        setVendors(data || []);
        setLoadingVendors(false);
      });
  }, [open, defaultCost, invoice.invoice_number]);

  const create = async () => {
    if (!vendorId) {
      toast({ title: "Pick the carrier / vendor", variant: "destructive" });
      return;
    }
    const amount = Math.round(Number(cost || 0) * 100) / 100;
    if (!(amount > 0)) {
      toast({ title: "Enter the shipping cost", variant: "destructive" });
      return;
    }
    if (!invoice.company_id) {
      toast({ title: "Invoice has no company", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const poNumber = await nextVendorPoNumber();
      const { data: po, error: poErr } = await supabase
        .from("vendor_pos")
        .insert({
          po_number: poNumber,
          vendor_id: vendorId,
          company_id: invoice.company_id,
          customer_company_id: invoice.company_id,
          order_id: invoice.order_id,
          po_type: "expense",
          expense_category: "Shipping",
          show_on_customer_sheet: false,
          description: description.trim() || `Shipping for Invoice ${invoice.invoice_number}`,
          order_date: new Date().toISOString(),
          total: amount,
          status: "created",
        })
        .select("id, po_number, po_type")
        .single();
      if (poErr) throw poErr;

      const { error: itemErr } = await supabase.from("vendor_po_items").insert({
        vendor_po_id: po.id,
        order_item_id: null,
        sku: "SHIPPING",
        item_type: "shipping",
        name: "Shipping",
        description: description.trim() || `Shipping for Invoice ${invoice.invoice_number}`,
        quantity: 1,
        unit_cost: amount,
        total: amount,
        shipped_quantity: null,
      });
      if (itemErr) throw itemErr;

      toast({ title: `Vendor PO ${po.po_number} created` });
      onCreated({
        id: po.id,
        po_number: po.po_number,
        vendor_name: vendors.find((v) => v.id === vendorId)?.name ?? null,
        po_type: po.po_type,
      });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Could not create PO", description: (error as { message?: string })?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            New shipping PO
          </DialogTitle>
          <DialogDescription>
            Takes the next PO number, adds one Shipping line, and links it to this invoice's shipping charge. Internal only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Carrier / vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId} disabled={loadingVendors}>
              <SelectTrigger>
                <SelectValue placeholder={loadingVendors ? "Loading vendors…" : "Select vendor"} />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Shipping cost (what the vendor charges)</Label>
            <Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Line description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={create} disabled={saving || loadingVendors}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateShippingPoDialog;

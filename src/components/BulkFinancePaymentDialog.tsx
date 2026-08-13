import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { calculateFinanceFee, formatUSD } from "@/lib/financeUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Open financed invoices (active, status open) available for repayment. */
  invoices: any[];
}

export function BulkFinancePaymentDialog({ open, onOpenChange, onSuccess, invoices }: Props) {
  const [total, setTotal] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("wire");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  /** What to do with money left over / short after allocating. */
  const [overageToDeposit, setOverageToDeposit] = useState(true);
  const [shortfallFromDeposit, setShortfallFromDeposit] = useState(true);


  // Payoff (principal + fee) per financed PO, oldest first.
  const rows = useMemo(() => {
    return [...invoices]
      .filter((i) => i.status === "open")
      .sort((a, b) => String(a.financed_date).localeCompare(String(b.financed_date)))
      .map((i) => {
        const fee = calculateFinanceFee(i.financed_amount, i.financed_date, i.paid_back_amount, i.paid_back_date);
        const payoff = Math.max(0, i.financed_amount + fee.feeAmount - (i.paid_back_amount || 0));
        return { ...i, payoff };
      })
      .filter((i) => i.payoff > 0.005);
  }, [invoices]);

  useEffect(() => {
    if (open) {
      setSelected({});
      setAllocations({});
      setTotal("");
      setNotes("");
      setReferenceNumber("");
    }
  }, [open]);

  // Auto-allocate the total across the SELECTED POs, oldest first.
  const autoAllocate = (totalStr: string, sel: Record<string, boolean>) => {
    let pool = parseFloat(totalStr || "0") || 0;
    const next: Record<string, string> = {};
    for (const r of rows) {
      if (!sel[r.id]) continue;
      const amt = Math.min(pool, r.payoff);
      next[r.id] = amt > 0 ? amt.toFixed(2) : "";
      pool = Math.max(0, pool - amt);
    }
    setAllocations(next);
  };

  const toggle = (id: string, checked: boolean) => {
    const sel = { ...selected, [id]: checked };
    if (!checked) delete sel[id];
    setSelected(sel);
    autoAllocate(total, sel);
  };

  const selectAll = () => {
    const sel: Record<string, boolean> = {};
    rows.forEach((r) => (sel[r.id] = true));
    setSelected(sel);
    autoAllocate(total, sel);
  };

  const selectedIds = rows.filter((r) => selected[r.id]).map((r) => r.id);
  const allocated = selectedIds.reduce((s, id) => s + (parseFloat(allocations[id] || "0") || 0), 0);
  const totalNum = parseFloat(total || "0") || 0;
  const remaining = totalNum - allocated;

  const handleSubmit = async () => {
    if (selectedIds.length === 0 || allocated <= 0) return;
    if (remaining < -0.005) {
      toast({ title: "Over-allocated", description: "Allocations exceed the payment total.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const batchId = crypto.randomUUID();

    const payload = selectedIds
      .map((id) => ({
        financed_invoice_id: id,
        amount: parseFloat(allocations[id] || "0") || 0,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference_number: referenceNumber || null,
        notes: notes || null,
        created_by: user?.id || null,
        payment_batch_id: batchId,
        batch_reference: referenceNumber || null,
        source: paymentMethod === "deposit" ? "deposit" : "payment",
      }))
      .filter((r) => r.amount > 0.005);

    const { error } = await supabase.from("finance_repayments").insert(payload);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bulk payment recorded", description: `${payload.length} financed PO(s) updated.` });
      onSuccess();
      onOpenChange(false);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Bulk Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Total Paid (USD)</Label>
              <Input
                type="number"
                step="0.01"
                value={total}
                placeholder="0.00"
                onChange={(e) => { setTotal(e.target.value); autoAllocate(e.target.value, selected); }}
              />
            </div>
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wire">Wire Transfer</SelectItem>
                  <SelectItem value="deposit">Pull from Deposit</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference #</Label>
              <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Wire ref, check #" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Select financed POs to pay</Label>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={selectAll}>Select all</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSelected({}); setAllocations({}); }}>Clear</Button>
            </div>
          </div>

          <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
            {rows.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No open financed POs.</p>
            )}
            {rows.map((r) => {
              const vpo = r.vendor_pos as any;
              const isSel = !!selected[r.id];
              return (
                <div key={r.id} className="flex items-center gap-3 p-2 text-sm">
                  <Checkbox checked={isSel} onCheckedChange={(c) => toggle(r.id, !!c)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs">
                      {vpo?.po_number ? `PO #${vpo.po_number}` : r.invoice_number || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.description || vpo?.description || ""}
                    </div>
                  </div>
                  <div className="text-xs text-right whitespace-nowrap text-muted-foreground w-28">
                    Payoff {formatUSD(r.payoff)}
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    disabled={!isSel}
                    className="h-8 w-28"
                    value={allocations[r.id] || ""}
                    placeholder="0.00"
                    onChange={(e) => setAllocations((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Allocated: <span className="font-semibold text-foreground">{formatUSD(allocated)}</span></span>
            <span className={remaining < -0.005 ? "text-destructive font-semibold" : "text-muted-foreground"}>
              Unallocated: <span className="font-semibold">{formatUSD(remaining)}</span>
            </span>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button onClick={handleSubmit} disabled={loading || selectedIds.length === 0 || allocated <= 0} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Payment{selectedIds.length > 0 ? ` (${selectedIds.length} PO${selectedIds.length > 1 ? "s" : ""})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

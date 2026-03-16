import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddFinancedInvoiceDialog({ open, onOpenChange, onSuccess }: Props) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [financedAmount, setFinancedAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("7.2");
  const [financedDate, setFinancedDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    if (open) fetchInvoices();
  }, [open]);

  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, total, orders(order_number, customer_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    setInvoices(data || []);
    setLoadingInvoices(false);
  };

  const handleSubmit = async () => {
    if (!selectedInvoiceId || !financedAmount) return;
    setLoading(true);
    const amt = parseFloat(financedAmount);
    const rate = parseFloat(exchangeRate);

    const { error } = await supabase.from("financed_invoices").insert({
      invoice_id: selectedInvoiceId,
      financed_amount: amt,
      financed_amount_rmb: amt * rate,
      exchange_rate: rate,
      financed_date: financedDate,
      notes: notes || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Invoice added to financing" });
      onSuccess();
      onOpenChange(false);
      setSelectedInvoiceId("");
      setFinancedAmount("");
      setNotes("");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Invoice to Financing</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Invoice</Label>
            <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingInvoices ? "Loading..." : "Select invoice"} />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoice_number} — {(inv.orders as any)?.customer_name || "N/A"} (${inv.total?.toFixed(2)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Financed Amount (USD)</Label>
            <Input type="number" step="0.01" value={financedAmount} onChange={(e) => setFinancedAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Exchange Rate (USD → RMB)</Label>
            <Input type="number" step="0.0001" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
          </div>
          <div>
            <Label>RMB Amount</Label>
            <Input disabled value={financedAmount && exchangeRate ? (parseFloat(financedAmount) * parseFloat(exchangeRate)).toFixed(2) : ""} />
          </div>
          <div>
            <Label>Financed Date</Label>
            <Input type="date" value={financedDate} onChange={(e) => setFinancedDate(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !selectedInvoiceId || !financedAmount} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add to Financing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

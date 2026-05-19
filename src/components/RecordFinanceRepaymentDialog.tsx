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
import { calculateFinanceFee, formatUSD } from "@/lib/financeUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  invoice: { id: string; financed_amount: number; paid_back_amount: number; financed_date?: string; paid_back_date?: string | null; invoice_number?: string } | null;
}

export function RecordFinanceRepaymentDialog({ open, onOpenChange, onSuccess, invoice }: Props) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("wire");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const principalBalance = invoice ? invoice.financed_amount - invoice.paid_back_amount : 0;
  const fee = invoice && invoice.financed_date
    ? calculateFinanceFee(invoice.financed_amount, invoice.financed_date, invoice.paid_back_amount, invoice.paid_back_date)
    : null;
  const payoffBalance = fee ? principalBalance + fee.feeAmount : principalBalance;

  // Preload amount with full payoff (principal + fee) when dialog opens
  useEffect(() => {
    if (open && invoice) {
      setAmount(payoffBalance > 0 ? payoffBalance.toFixed(2) : "");
    }
  }, [open, invoice?.id]);

  if (!invoice) return null;

  const balance = payoffBalance;


  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    // Insert into repayment ledger — trigger auto-updates financed_invoices
    const { error } = await supabase.from("finance_repayments").insert({
      financed_invoice_id: invoice.id,
      amount: amt,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      reference_number: referenceNumber || null,
      notes: notes || null,
      created_by: user?.id || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Repayment recorded" });
      onSuccess();
      onOpenChange(false);
      setAmount("");
      setNotes("");
      setReferenceNumber("");
      setPaymentMethod("wire");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Repayment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Balance: <span className="font-semibold text-foreground">{formatUSD(balance)}</span>
          </p>
          <div>
            <Label>Payment Amount (USD)</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Payment Date</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div>
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wire">Wire Transfer</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="ach">ACH</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reference #</Label>
            <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Check #, wire ref, etc." />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !amount} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

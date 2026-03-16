import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { formatUSD } from "@/lib/financeUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  invoice: { id: string; financed_amount: number; paid_back_amount: number; invoice_number?: string } | null;
}

export function RecordFinanceRepaymentDialog({ open, onOpenChange, onSuccess, invoice }: Props) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  if (!invoice) return null;

  const balance = invoice.financed_amount - invoice.paid_back_amount;

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);

    const newPaidBack = invoice.paid_back_amount + amt;
    const fullyPaid = newPaidBack >= invoice.financed_amount;

    const { error } = await supabase
      .from("financed_invoices")
      .update({
        paid_back_amount: newPaidBack,
        status: fullyPaid ? "paid" : "open",
        paid_back_date: fullyPaid ? new Date().toISOString() : null,
        notes: notes ? `${invoice.invoice_number || ""} repayment: ${notes}` : undefined,
      })
      .eq("id", invoice.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Repayment recorded" });
      onSuccess();
      onOpenChange(false);
      setAmount("");
      setNotes("");
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

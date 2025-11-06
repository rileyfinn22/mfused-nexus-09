import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  onSuccess: () => void;
}

export function RecordPaymentDialog({ open, onOpenChange, invoice, onSuccess }: RecordPaymentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("check");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const paymentAmount = parseFloat(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        toast({
          title: "Invalid Amount",
          description: "Please enter a valid payment amount",
          variant: "destructive"
        });
        return;
      }

      const remainingBalance = invoice.total - (invoice.total_paid || 0);
      if (paymentAmount > remainingBalance) {
        toast({
          title: "Amount Too Large",
          description: `Payment amount cannot exceed remaining balance of $${remainingBalance.toFixed(2)}`,
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('payments')
        .insert({
          company_id: invoice.company_id,
          invoice_id: invoice.id,
          amount: paymentAmount,
          payment_method: paymentMethod,
          reference_number: referenceNumber || null,
          payment_date: paymentDate,
          notes: notes || null,
          created_by: user.id
        });

      if (error) throw error;

      toast({
        title: "Payment Recorded",
        description: `Payment of $${paymentAmount.toFixed(2)} recorded successfully`
      });

      onSuccess();
      onOpenChange(false);
      
      // Reset form
      setAmount("");
      setReferenceNumber("");
      setNotes("");
      setPaymentMethod("check");
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!invoice) return null;

  const remainingBalance = invoice.total - (invoice.total_paid || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment - {invoice.invoice_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice Summary */}
          <div className="bg-secondary/20 p-3 rounded-lg space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice Total:</span>
              <span className="font-medium">${invoice.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Paid:</span>
              <span className="font-medium">${(invoice.total_paid || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t">
              <span className="font-semibold">Remaining Balance:</span>
              <span className="font-bold text-primary">${remainingBalance.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Date */}
          <div className="space-y-2">
            <Label htmlFor="payment-date">Payment Date</Label>
            <Input
              id="payment-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Payment Amount *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={remainingBalance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max: $${remainingBalance.toFixed(2)}`}
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="payment-method">Payment Method *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="wire">Wire Transfer</SelectItem>
                <SelectItem value="ach">ACH</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label htmlFor="reference">Reference Number (Check #, Transaction ID, etc.)</Label>
            <Input
              id="reference"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Optional"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional payment notes"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading || !amount}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

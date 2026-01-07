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

interface RecordVendorPOPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorPO: any;
  onSuccess: () => void;
}

export function RecordVendorPOPaymentDialog({ open, onOpenChange, vendorPO, onSuccess }: RecordVendorPOPaymentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("wire");
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

      const poTotal = vendorPO.final_total ?? vendorPO.total;
      const remainingBalance = poTotal - (vendorPO.total_paid || 0);
      if (paymentAmount > remainingBalance) {
        toast({
          title: "Amount Too Large",
          description: `Payment amount cannot exceed remaining balance of $${remainingBalance.toFixed(2)}`,
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('vendor_po_payments')
        .insert({
          company_id: vendorPO.company_id,
          vendor_po_id: vendorPO.id,
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
      setPaymentMethod("wire");
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

  if (!vendorPO) return null;

  const poTotal = vendorPO.final_total ?? vendorPO.total;
  const remainingBalance = poTotal - (vendorPO.total_paid || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment - {vendorPO.po_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* PO Summary */}
          <div className="bg-secondary/20 p-3 rounded-lg space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">PO Total:</span>
              <span className="font-medium">${poTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Paid:</span>
              <span className="font-medium">${(vendorPO.total_paid || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t">
              <span className="font-semibold">Amount Owed:</span>
              <span className="font-bold text-destructive">${remainingBalance.toFixed(2)}</span>
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
                <SelectItem value="wire">Wire Transfer</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="ach">ACH</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label htmlFor="reference">Reference Number (Transaction ID, Check #, etc.)</Label>
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

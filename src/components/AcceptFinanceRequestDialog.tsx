import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { formatUSD } from "@/lib/financeUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  invoice: any;
}

export function AcceptFinanceRequestDialog({ open, onOpenChange, onSuccess, invoice }: Props) {
  const [financedAmount, setFinancedAmount] = useState("");
  const [rmbAmount, setRmbAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("7.2");
  const [financedDate, setFinancedDate] = useState(new Date().toISOString().split("T")[0]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [sendNotification, setSendNotification] = useState(false);
  const [loading, setLoading] = useState(false);

  // Pre-fill when invoice changes
  const handleOpen = () => {
    if (invoice) {
      setFinancedAmount(String(invoice.financed_amount || ""));
      setRmbAmount(String(invoice.financed_amount_rmb || ""));
      setExchangeRate(String(invoice.exchange_rate || "7.2"));
      setInvoiceNumber(invoice.invoice_number || "");
      setNotes(invoice.notes || "");
    }
  };

  const handleSubmit = async () => {
    if (!financedAmount) return;
    setLoading(true);

    const amt = parseFloat(financedAmount);
    const rate = parseFloat(exchangeRate);

    const { error } = await supabase
      .from("financed_invoices")
      .update({
        finance_status: "active",
        financed_amount: amt,
        financed_amount_rmb: amt * rate,
        exchange_rate: rate,
        financed_date: financedDate,
        invoice_number: invoiceNumber || null,
        notes: notes || null,
      })
      .eq("id", invoice.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Auto-record vendor PO payment if linked to a vendor PO
    if (invoice.vendor_po_id) {
      // Get vendor PO company_id
      const { data: vpo } = await supabase
        .from("vendor_pos")
        .select("company_id")
        .eq("id", invoice.vendor_po_id)
        .maybeSingle();

      if (vpo?.company_id) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("vendor_po_payments").insert({
          vendor_po_id: invoice.vendor_po_id,
          company_id: vpo.company_id,
          amount: amt,
          payment_method: "financing",
          payment_date: financedDate,
          notes: `Paid via PO financing${notes ? ` - ${notes}` : ""}`,
          created_by: user?.id || null,
        });
      }
    }

    // Optionally notify vibe admins
    if (sendNotification) {
      try {
        const vendorPO = invoice.vendor_pos as any;
        await supabase.functions.invoke("send-finance-notification", {
          body: {
            type: "request_accepted",
            poNumber: vendorPO?.po_number || "",
            amount: amt,
            financedDate,
          },
        });
      } catch (e) {
        console.error("Notification failed:", e);
      }
    }

    toast({ title: "Request accepted & moved to Active" });
    onSuccess();
    onOpenChange(false);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) handleOpen(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Accept & Process Request</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Confirm the financing details. The request will move to <strong>Active</strong> and aging/fees will start from the financed date.
        </p>
        <div className="space-y-4">
          <div>
            <Label>Financed Amount (USD)</Label>
            <Input
              type="number"
              step="0.01"
              value={financedAmount}
              onChange={(e) => {
                const usd = e.target.value;
                setFinancedAmount(usd);
                if (usd && exchangeRate) setRmbAmount((parseFloat(usd) * parseFloat(exchangeRate)).toFixed(2));
                else setRmbAmount("");
              }}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Exchange Rate (USD → RMB)</Label>
            <Input
              type="number"
              step="0.0001"
              value={exchangeRate}
              onChange={(e) => {
                const rate = e.target.value;
                setExchangeRate(rate);
                if (financedAmount && rate) setRmbAmount((parseFloat(financedAmount) * parseFloat(rate)).toFixed(2));
              }}
            />
          </div>
          <div>
            <Label>RMB Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={rmbAmount}
              onChange={(e) => {
                const rmb = e.target.value;
                setRmbAmount(rmb);
                if (rmb && exchangeRate) setFinancedAmount((parseFloat(rmb) / parseFloat(exchangeRate)).toFixed(2));
                else setFinancedAmount("");
              }}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Financed Date (when paid)</Label>
            <Input type="date" value={financedDate} onChange={(e) => setFinancedDate(e.target.value)} />
          </div>
          <div>
            <Label>Invoice Number</Label>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Your invoice #"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !financedAmount} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept & Activate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

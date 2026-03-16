import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, X, FileText } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddFinancedPaymentDialog({ open, onOpenChange, onSuccess }: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [financedAmount, setFinancedAmount] = useState("");
  const [rmbAmount, setRmbAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("7.2");
  const [financedDate, setFinancedDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!invoiceNumber.trim() || !financedAmount) return;
    setLoading(true);

    const amt = parseFloat(financedAmount);
    const rate = parseFloat(exchangeRate);

    // Insert financed invoice record
    const { data: record, error } = await supabase.from("financed_invoices").insert({
      invoice_number: invoiceNumber.trim(),
      financed_amount: amt,
      financed_amount_rmb: amt * rate,
      exchange_rate: rate,
      financed_date: financedDate,
      notes: notes || null,
      created_by_role: "finance",
    }).select("id").single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Upload attachments if any
    if (record && files.length > 0) {
      for (const file of files) {
        const filePath = `finance/${record.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("po-documents")
          .upload(filePath, file);

        if (!uploadError) {
          await supabase.from("financed_invoice_documents").insert({
            financed_invoice_id: record.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type || null,
          });
        }
      }
    }

    toast({ title: "Invoice payment added" });
    onSuccess();
    onOpenChange(false);
    // Reset
    setInvoiceNumber("");
    setFinancedAmount("");
    setRmbAmount("");
    setNotes("");
    setFiles([]);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Invoice Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Invoice Number</Label>
            <Input
              placeholder="Enter invoice number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>

          <div>
            <Label>Amount (USD)</Label>
            <Input type="number" step="0.01" value={financedAmount} onChange={(e) => {
              const usd = e.target.value;
              setFinancedAmount(usd);
              if (usd && exchangeRate) setRmbAmount((parseFloat(usd) * parseFloat(exchangeRate)).toFixed(2));
              else setRmbAmount("");
            }} placeholder="0.00" />
          </div>

          <div>
            <Label>Exchange Rate (USD → RMB)</Label>
            <Input type="number" step="0.0001" value={exchangeRate} onChange={(e) => {
              const rate = e.target.value;
              setExchangeRate(rate);
              if (financedAmount && rate) setRmbAmount((parseFloat(financedAmount) * parseFloat(rate)).toFixed(2));
            }} />
          </div>

          <div>
            <Label>RMB Amount</Label>
            <Input type="number" step="0.01" value={rmbAmount} onChange={(e) => {
              const rmb = e.target.value;
              setRmbAmount(rmb);
              if (rmb && exchangeRate) setFinancedAmount((parseFloat(rmb) / parseFloat(exchangeRate)).toFixed(2));
              else setFinancedAmount("");
            }} placeholder="0.00" />
          </div>

          <div>
            <Label>Date</Label>
            <Input type="date" value={financedDate} onChange={(e) => setFinancedDate(e.target.value)} />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes..." />
          </div>

          {/* File attachments */}
          <div>
            <Label>Attachments</Label>
            <div className="mt-1">
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                <span>Upload files</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)}KB</span>
                    <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button onClick={handleSubmit} disabled={loading || !invoiceNumber.trim() || !financedAmount} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Invoice Payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

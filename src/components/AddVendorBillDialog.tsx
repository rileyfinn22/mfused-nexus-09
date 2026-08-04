import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, FileText, Sparkles, X } from "lucide-react";
import * as XLSX from "xlsx";

interface AddVendorBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorPO: any;
  bill?: any | null;
  onSaved: () => void;
}

const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

const isSpreadsheet = (name: string) =>
  SPREADSHEET_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));

export function AddVendorBillDialog({ open, onOpenChange, vendorPO, bill, onSaved }: AddVendorBillDialogProps) {
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [freight, setFreight] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [readConfidence, setReadConfidence] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setReadConfidence(null);
    setDocumentPath(bill?.document_path ?? null);
    setDocumentName(bill?.document_name ?? null);
    setInvoiceNumber(bill?.invoice_number ?? "");
    setBillDate(bill?.bill_date ?? "");
    setDueDate(bill?.due_date ?? "");
    setSubtotal(bill?.subtotal != null ? String(bill.subtotal) : "");
    setFreight(bill?.freight != null ? String(bill.freight) : "");
    setTotal(bill?.total != null ? String(bill.total) : "");
    setNotes(bill?.notes ?? "");
  }, [open, bill]);

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  // The total is what we owe. Subtotal + freight is offered as a convenience, but if the vendor's
  // invoice states a grand total that does not equal the parts, the stated total wins.
  const partsSum = Math.round((num(subtotal) + num(freight)) * 100) / 100;
  const totalValue = Math.round(num(total) * 100) / 100;
  const partsDisagree = total !== "" && (subtotal !== "" || freight !== "") && partsSum !== totalValue;

  const uploadDocument = async (selected: File): Promise<{ path: string; name: string }> => {
    const safeName = selected.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `vendor-bills/${vendorPO.id}/${Date.now()}_${safeName}`;

    const { error } = await supabase.storage
      .from('po-documents')
      .upload(path, selected, { upsert: false });

    if (error) throw error;
    return { path, name: selected.name };
  };

  const handleFileChosen = async (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    setReadConfidence(null);
    try {
      setUploading(true);
      const uploaded = await uploadDocument(selected);
      setDocumentPath(uploaded.path);
      setDocumentName(uploaded.name);
      toast({ title: "Attached", description: uploaded.name });
    } catch (error: any) {
      setFile(null);
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Spreadsheets are flattened here rather than server-side -- xlsx is already bundled, and it
  // keeps a whole class of file format handling out of the edge function.
  const spreadsheetToText = async (selected: File): Promise<string> => {
    const buffer = await selected.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    return workbook.SheetNames
      .map(sheetName => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        return `--- ${sheetName} ---\n${csv}`;
      })
      .join('\n\n');
  };

  const handleRead = async () => {
    if (!documentPath && !file) {
      toast({ title: "Attach the invoice first", variant: "destructive" });
      return;
    }
    try {
      setReading(true);
      const payload: Record<string, any> = { filename: documentName || file?.name };

      if (file && isSpreadsheet(file.name)) {
        payload.textContent = await spreadsheetToText(file);
      } else {
        payload.documentPath = documentPath;
      }

      const { data, error } = await supabase.functions.invoke('parse-vendor-bill', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const read = data.bill || {};
      if (read.invoice_number) setInvoiceNumber(read.invoice_number);
      if (read.bill_date) setBillDate(read.bill_date);
      if (read.due_date) setDueDate(read.due_date);
      if (read.subtotal != null) setSubtotal(String(read.subtotal));
      if (read.freight != null) setFreight(String(read.freight));
      if (read.total != null) setTotal(String(read.total));
      if (read.notes) setNotes(read.notes);
      setReadConfidence(data.confidence || 'low');

      toast({
        title: "Invoice read",
        description: "Check every figure against the document before saving.",
      });
    } catch (error: any) {
      toast({
        title: "Could not read that file",
        description: `${error.message} You can still type the figures in.`,
        variant: "destructive",
      });
    } finally {
      setReading(false);
    }
  };

  const handleSave = async () => {
    if (total === "" || totalValue <= 0) {
      toast({ title: "Enter the bill total", description: "That is the amount we owe the vendor.", variant: "destructive" });
      return;
    }
    try {
      setSaving(true);
      const { data: userData } = await supabase.auth.getUser();

      const payload: any = {
        vendor_po_id: vendorPO.id,
        company_id: vendorPO.company_id ?? null,
        invoice_number: invoiceNumber.trim() || null,
        bill_date: billDate || null,
        due_date: dueDate || null,
        subtotal: subtotal === "" ? Math.round((totalValue - num(freight)) * 100) / 100 : num(subtotal),
        freight: num(freight),
        total: totalValue,
        document_path: documentPath,
        document_name: documentName,
        notes: notes.trim() || null,
      };

      if (bill?.id) {
        const { error } = await supabase.from('vendor_bills' as any).update(payload).eq('id', bill.id);
        if (error) throw error;
      } else {
        payload.created_by = userData?.user?.id ?? null;
        const { error } = await supabase.from('vendor_bills' as any).insert(payload);
        if (error) throw error;
      }

      toast({
        title: bill?.id ? "Bill updated" : "Bill attached",
        description: "This PO now bills at the vendor's invoice amount.",
      });
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!vendorPO) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {bill?.id ? 'Edit' : 'Attach'} Vendor Bill — {vendorPO.po_number}
          </DialogTitle>
          <DialogDescription>
            The vendor's own invoice. Once attached, this drives what we owe, what we pay and
            project profit — the PO itself stays as originally ordered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Document */}
          <div className="rounded-lg border border-dashed p-4">
            {documentName ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{documentName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={handleRead} disabled={reading || uploading}>
                    {reading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Read invoice
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { setFile(null); setDocumentPath(null); setDocumentName(null); setReadConfidence(null); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 py-4 text-center">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Attach their invoice</span>
                <span className="text-xs text-muted-foreground">PDF, Excel or CSV — optional, you can just type the total</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.xlsx,.xls,.csv,image/*"
                  onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
                />
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              </label>
            )}
          </div>

          {readConfidence && (
            <p className={`text-xs ${readConfidence === 'high' ? 'text-muted-foreground' : 'text-orange-600'}`}>
              {readConfidence === 'high'
                ? 'Figures read from the document — confirm them against the invoice before saving.'
                : `Read with ${readConfidence} confidence — check every figure carefully.`}
            </p>
          )}

          {/* Figures */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-number">Their invoice #</Label>
              <Input id="invoice-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-date">Invoice date</Label>
              <Input id="bill-date" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due-date">Due date</Label>
              <Input id="due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="freight">Freight</Label>
              <Input id="freight" type="number" step="0.01" min="0" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subtotal">Goods subtotal</Label>
              <Input id="subtotal" type="number" step="0.01" min="0" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total" className="font-semibold">Bill total *</Label>
              <Input
                id="total"
                type="number"
                step="0.01"
                min="0"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0.00"
                className="font-semibold"
              />
            </div>
          </div>

          {partsDisagree && (
            <p className="text-xs text-muted-foreground">
              Subtotal + freight is ${partsSum.toFixed(2)}, but the bill total says ${totalValue.toFixed(2)}.
              The total is what we will owe — leave it as the invoice states it.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="bill-notes">Notes</Label>
            <Textarea id="bill-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">PO as ordered</span>
              <span>${Number(vendorPO.total || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>This bill</span>
              <span>${totalValue.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bill?.id ? 'Save Bill' : 'Attach Bill'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

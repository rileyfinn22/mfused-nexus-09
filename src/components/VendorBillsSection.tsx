import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AddVendorBillDialog } from "@/components/AddVendorBillDialog";
import { openStorageObjectInNewTab } from "@/lib/storageUrl";
import { downloadVendorBillPdf } from "@/lib/vendorBillPdf";
import { Plus, FileText, Receipt, Pencil, Trash2, Download, FileDown } from "lucide-react";

interface VendorBillsSectionProps {
  vendorPO: any;
  vendorName?: string | null;
  onChanged: () => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);

export function VendorBillsSection({ vendorPO, vendorName, onChanged }: VendorBillsSectionProps) {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const fetchBills = useCallback(async () => {
    if (!vendorPO?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_bills' as any)
      .select('*')
      .eq('vendor_po_id', vendorPO.id)
      .order('bill_date', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Error loading vendor bills:', error);
    }
    setBills((data as any[]) || []);
    setLoading(false);
  }, [vendorPO?.id]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  // The references that let someone match a bill up: the Vibe invoice(s) the PO was raised
  // against, and the customer's own PO number.
  const [refs, setRefs] = useState<{ invoiceNumbers: string[]; customerPO: string | null }>({
    invoiceNumbers: [], customerPO: null,
  });

  useEffect(() => {
    if (!vendorPO?.order_id) { setRefs({ invoiceNumbers: [], customerPO: null }); return; }
    let cancelled = false;
    (async () => {
      const [{ data: invoices }, { data: order }] = await Promise.all([
        supabase.from('invoices').select('invoice_number, customer_po_number')
          .eq('order_id', vendorPO.order_id).is('deleted_at', null)
          .order('invoice_number', { ascending: true }),
        supabase.from('orders').select('po_number').eq('id', vendorPO.order_id).maybeSingle(),
      ]);
      if (cancelled) return;
      setRefs({
        invoiceNumbers: (invoices || []).map((i: any) => i.invoice_number).filter(Boolean),
        customerPO: order?.po_number
          || (invoices || []).map((i: any) => i.customer_po_number).find(Boolean)
          || null,
      });
    })();
    return () => { cancelled = true; };
  }, [vendorPO?.order_id]);

  const downloadBill = (bill: any) => {
    downloadVendorBillPdf({
      poNumber: vendorPO?.po_number,
      vendorName: vendorName ?? null,
      invoiceNumber: bill.invoice_number,
      billDate: bill.bill_date,
      dueDate: bill.due_date,
      subtotal: Number(bill.subtotal || 0),
      freight: Number(bill.freight || 0),
      total: Number(bill.total || 0),
      currency: bill.currency,
      status: bill.status,
      source: bill.source,
      vibeInvoiceNumbers: refs.invoiceNumbers,
      customerPO: refs.customerPO,
      documentName: bill.document_name,
      notes: bill.notes,
    });
  };

  const handleSaved = () => {
    setEditing(null);
    fetchBills();
    onChanged();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('vendor_bills' as any).delete().eq('id', deleting.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    // Removing the last bill hands the PO back to its line-item basis.
    toast({ title: "Bill removed" });
    setDeleting(null);
    fetchBills();
    onChanged();
  };

  // A draft is an unconfirmed read of a vendor upload. vendor_po_recalc ignores it, so the
  // figures here must ignore it too or the card would disagree with the PO.
  const drafts = bills.filter((b) => b.status === 'draft');
  const finalBills = bills.filter((b) => b.status !== 'draft');

  // Confirming the vendor's real invoice retires the bill we migrated off the PO - bills on a
  // PO are summed, so leaving both would double what we owe.
  const confirmDraft = async (draft: any) => {
    const superseded = finalBills.filter((b) => b.source === 'reconstructed').map((b) => b.id);
    if (superseded.length) {
      const { error } = await supabase.from('vendor_bills' as any).delete().in('id', superseded);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
    }
    const { error } = await supabase
      .from('vendor_bills' as any)
      .update({ status: 'final' })
      .eq('id', draft.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Bill confirmed",
      description: superseded.length
        ? "It replaced the bill migrated from the PO."
        : undefined,
    });
    fetchBills();
    onChanged();
  };

  const billedTotal = finalBills.reduce((sum, b) => sum + Number(b.total || 0), 0);
  const orderedTotal = Number(vendorPO?.total || 0);
  const variance = Math.round((billedTotal - orderedTotal) * 100) / 100;
  const paid = Number(vendorPO?.total_paid || 0);
  const owed = Math.round((billedTotal - paid) * 100) / 100;

  return (
    <>
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5" />
            Vendor Bills
            {bills.length > 0 && <Badge variant="secondary">{bills.length}</Badge>}
          </CardTitle>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Attach Bill
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading bills...</p>
          ) : bills.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No vendor bill attached yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This PO is being costed at {formatCurrency(Number(vendorPO?.final_total ?? orderedTotal))} from its
                line items. Attach the vendor's invoice to cost it at what they actually charged.
              </p>
            </div>
          ) : (
            <>
              {drafts.length > 0 && (
                <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                  {drafts.length === 1 ? 'A bill was' : `${drafts.length} bills were`} read automatically from
                  what the vendor uploaded. Nothing is costed at {drafts.length === 1 ? 'it' : 'them'} until you
                  confirm — check the figures against the document first, and edit if the read is off.
                  {finalBills.some((b) => b.source === 'reconstructed') &&
                    ' Confirming replaces the bill migrated from this PO.'}
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Goods</TableHead>
                    <TableHead className="text-right">Freight</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[130px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow key={bill.id} className={bill.status === 'draft' ? 'bg-amber-50/60 dark:bg-amber-950/20' : undefined}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {bill.invoice_number || <span className="text-muted-foreground">—</span>}
                          {bill.status === 'draft' && (
                            <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                              Draft{bill.parse_confidence != null && Number(bill.parse_confidence) < 0.7 ? ' · check' : ''}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{bill.bill_date ? new Date(bill.bill_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{bill.due_date ? new Date(bill.due_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(bill.subtotal || 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(bill.freight || 0))}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(bill.total || 0))}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {bill.status === 'draft' && (
                            <Button
                              size="sm"
                              className="h-8"
                              onClick={() => confirmDraft(bill)}
                            >
                              Confirm
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Download this bill as a PDF"
                            onClick={() => downloadBill(bill)}
                          >
                            <FileDown className="h-4 w-4" />
                          </Button>
                          {bill.document_path && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={bill.document_name || "Open the vendor's own document"}
                              onClick={() => openStorageObjectInNewTab('po-documents', bill.document_path)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => { setEditing(bill); setDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleting(bill)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex justify-end">
                <div className="w-80 space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>PO as ordered</span>
                    <span>{formatCurrency(orderedTotal)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Billed by vendor</span>
                    <span>{formatCurrency(billedTotal)}</span>
                  </div>
                  {variance !== 0 && (
                    <div className={`flex justify-between ${variance > 0 ? 'text-destructive' : 'text-green-600'}`}>
                      <span>{variance > 0 ? 'Over the PO' : 'Under the PO'}</span>
                      <span>{variance > 0 ? '+' : ''}{formatCurrency(variance)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-green-600">
                    <span>Paid</span>
                    <span>{formatCurrency(paid)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-bold">
                    <span>Still owed</span>
                    <span className={owed > 0 ? 'text-destructive' : ''}>{formatCurrency(owed)}</span>
                  </div>
                  <p className="pt-1 text-xs text-muted-foreground">
                    <FileText className="mr-1 inline h-3 w-3" />
                    Project profit, AP and payments all use the billed figure.
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AddVendorBillDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}
        vendorPO={vendorPO}
        bill={editing}
        onSaved={handleSaved}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this bill?</AlertDialogTitle>
            <AlertDialogDescription>
              {bills.length === 1
                ? `This is the only bill on ${vendorPO?.po_number}. Removing it puts the PO back to being costed from its line items.`
                : `${vendorPO?.po_number} will be costed at the remaining bills.`}
              {' '}The attached document is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

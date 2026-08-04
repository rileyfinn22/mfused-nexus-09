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
import { Plus, FileText, Receipt, Pencil, Trash2, Download } from "lucide-react";

interface VendorBillsSectionProps {
  vendorPO: any;
  onChanged: () => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);

export function VendorBillsSection({ vendorPO, onChanged }: VendorBillsSectionProps) {
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

  const billedTotal = bills.reduce((sum, b) => sum + Number(b.total || 0), 0);
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
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">
                        {bill.invoice_number || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{bill.bill_date ? new Date(bill.bill_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{bill.due_date ? new Date(bill.due_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(bill.subtotal || 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(bill.freight || 0))}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(bill.total || 0))}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {bill.document_path && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={bill.document_name || 'View document'}
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

import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, DollarSign, AlertTriangle, Banknote, Link2, RefreshCw } from "lucide-react";
import { calculateFinanceFee, getAgingBadgeVariant, formatUSD } from "@/lib/financeUtils";
import { AddFinancedInvoiceDialog } from "@/components/AddFinancedInvoiceDialog";
import { RecordFinanceRepaymentDialog } from "@/components/RecordFinanceRepaymentDialog";
import { RecordFinanceDepositDialog } from "@/components/RecordFinanceDepositDialog";
import { GenerateFinanceLinkDialog } from "@/components/GenerateFinanceLinkDialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function Financing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Check for preselected vendor PO from URL params (e.g. from "Send to Finance" button)
  const preselectedVendorPO = useMemo(() => {
    const addPO = searchParams.get("addPO");
    if (!addPO) return null;
    return {
      id: addPO,
      po_number: searchParams.get("poNumber") || "",
      total: parseFloat(searchParams.get("poTotal") || "0"),
      description: searchParams.get("poDesc") || null,
    };
  }, [searchParams]);

  // Auto-open dialog when navigated with addPO param
  useEffect(() => {
    if (preselectedVendorPO && isAdmin) {
      setAddOpen(true);
      // Clear URL params after opening
      setSearchParams({}, { replace: true });
    }
  }, [preselectedVendorPO, isAdmin]);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "vibe_admin").maybeSingle();
    if (!data) { navigate("/dashboard"); return; }
    setIsAdmin(true);
    fetchData();
  };

  const fetchData = async () => {
    setLoading(true);
    const [invRes, depRes] = await Promise.all([
      supabase.from("financed_invoices").select("*, invoices(invoice_number, total, orders(order_number, customer_name)), vendor_pos(po_number, description, total)").order("financed_date", { ascending: false }),
      supabase.from("finance_deposits").select("*").order("payment_date", { ascending: false }),
    ]);
    setInvoices(invRes.data || []);
    setDeposits(depRes.data || []);
    setLoading(false);
  };

  if (!isAdmin) return null;

  const totalFinanced = invoices.reduce((s, i) => s + (i.financed_amount || 0), 0);
  const totalOutstanding = invoices.filter(i => i.status === "open").reduce((s, i) => s + (i.financed_amount - i.paid_back_amount), 0);
  const requiredDeposit = invoices.filter(i => i.status === "open").reduce((s, i) => s + i.financed_amount, 0) * 0.10;
  const currentDeposit = deposits.reduce((s, d) => s + (d.amount || 0), 0);
  const depositShortfall = Math.max(0, requiredDeposit - currentDeposit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PO Financing Tracker</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
            <Link2 className="mr-2 h-4 w-4" /> Share Link
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDepositOpen(true)}>
            <Banknote className="mr-2 h-4 w-4" /> Record Deposit
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Invoice
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Financed</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(totalFinanced)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-500">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(totalOutstanding)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Required Deposit (10%)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(requiredDeposit)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Deposit Balance</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-500">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(currentDeposit)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
            {depositShortfall > 0 && <AlertTriangle className="h-3 w-3 text-destructive" />} Deposit Shortfall
          </CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${depositShortfall > 0 ? "text-destructive" : "text-green-500"}`}>
            {loading ? <Skeleton className="h-8 w-24" /> : depositShortfall > 0 ? formatUSD(depositShortfall) : "—"}
          </p></CardContent>
        </Card>
      </div>

      {/* Financed Invoices Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Financed Invoices</CardTitle>
          <Button variant="ghost" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : invoices.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No financed invoices yet</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead>Vendor PO</TableHead>
                     <TableHead>Description</TableHead>
                     <TableHead>Invoice</TableHead>
                     <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Financed</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Aging</TableHead>
                    <TableHead>Fee Tier</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead className="text-right">Repaid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const fee = calculateFinanceFee(inv.financed_amount, inv.financed_date, inv.paid_back_amount);
                     const invoice = inv.invoices as any;
                     const order = invoice?.orders as any;
                     const vendorPO = inv.vendor_pos as any;
                     return (
                       <TableRow key={inv.id}>
                         <TableCell className="font-mono text-sm cursor-pointer hover:underline" onClick={() => vendorPO && navigate(`/vendor-pos/${inv.vendor_po_id}`)}>
                           {vendorPO?.po_number ? `PO #${vendorPO.po_number}` : "—"}
                         </TableCell>
                         <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{vendorPO?.description || "—"}</TableCell>
                         <TableCell className="font-mono text-sm cursor-pointer hover:underline" onClick={() => invoice && navigate(`/invoices/${inv.invoice_id}`)}>
                           {invoice?.invoice_number || "—"}
                         </TableCell>
                         <TableCell>{order?.customer_name || "—"}</TableCell>
                        <TableCell className="text-right">{formatUSD(inv.financed_amount)}</TableCell>
                        <TableCell>{new Date(inv.financed_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={getAgingBadgeVariant(fee.daysAging)}>{fee.daysAging}d</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{fee.feeTier}</TableCell>
                        <TableCell className="text-right">{formatUSD(fee.feeAmount)}</TableCell>
                        <TableCell className="text-right">{formatUSD(inv.paid_back_amount)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatUSD(fee.balance)}</TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "paid" ? "default" : inv.status === "overdue" ? "destructive" : "secondary"}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {inv.status !== "paid" && (
                            <Button size="sm" variant="outline" onClick={() => { setSelectedInvoice({ ...inv, invoice_number: invoice?.invoice_number }); setRepayOpen(true); }}>
                              Repay
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deposit History */}
      {deposits.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Deposit History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{new Date(d.payment_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">{formatUSD(d.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{d.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AddFinancedInvoiceDialog open={addOpen} onOpenChange={setAddOpen} onSuccess={fetchData} preselectedVendorPO={preselectedVendorPO} />
      <RecordFinanceRepaymentDialog open={repayOpen} onOpenChange={setRepayOpen} onSuccess={fetchData} invoice={selectedInvoice} />
      <RecordFinanceDepositDialog open={depositOpen} onOpenChange={setDepositOpen} onSuccess={fetchData} />
      <GenerateFinanceLinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
    </div>
  );
}

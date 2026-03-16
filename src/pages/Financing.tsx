import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertTriangle, Banknote, Link2, RefreshCw, ChevronDown, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateFinanceFee, getAgingBadgeVariant, formatUSD } from "@/lib/financeUtils";
import { AddFinancedInvoiceDialog } from "@/components/AddFinancedInvoiceDialog";
import { AddFinancedPaymentDialog } from "@/components/AddFinancedPaymentDialog";
import { RecordFinanceRepaymentDialog } from "@/components/RecordFinanceRepaymentDialog";
import { RecordFinanceDepositDialog } from "@/components/RecordFinanceDepositDialog";
import { GenerateFinanceLinkDialog } from "@/components/GenerateFinanceLinkDialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function Financing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userRole, setUserRole] = useState<"vibe_admin" | "finance" | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [preselectedVendorPO, setPreselectedVendorPO] = useState<{ id: string; po_number: string; total: number; description: string | null } | null>(null);

  const isVibeAdmin = userRole === "vibe_admin";
  const isFinanceUser = userRole === "finance";

  // Check for preselected vendor PO from URL params (e.g. from "Send to Finance" button)
  useEffect(() => {
    const addPO = searchParams.get("addPO");
    if (addPO && isVibeAdmin) {
      setPreselectedVendorPO({
        id: addPO,
        po_number: searchParams.get("poNumber") || "",
        total: parseFloat(searchParams.get("poTotal") || "0"),
        description: searchParams.get("poDesc") || null,
      });
      setAddOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, isVibeAdmin]);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["vibe_admin", "finance"]);
    if (!data || data.length === 0) { navigate("/dashboard"); return; }

    const roles = data.map((r: any) => r.role as string);
    if (roles.includes("vibe_admin")) {
      setUserRole("vibe_admin");
    } else {
      setUserRole("finance");
    }
    setIsAuthorized(true);
    fetchData();
  };

  const fetchData = async () => {
    setLoading(true);
    const [invRes, depRes] = await Promise.all([
      supabase.from("financed_invoices").select("*, invoices(invoice_number, total, orders(order_number, customer_name, description)), vendor_pos(po_number, description, total, orders(order_number, customer_name, description), vendors(name))").order("financed_date", { ascending: false }),
      supabase.from("finance_deposits").select("*").order("payment_date", { ascending: false }),
    ]);
    setInvoices(invRes.data || []);
    setDeposits(depRes.data || []);
    setLoading(false);
  };

  if (!isAuthorized) return null;

  const totalFinanced = invoices.reduce((s, i) => s + (i.financed_amount || 0), 0);
  const totalOutstanding = invoices.filter(i => i.status === "open").reduce((s, i) => {
    const fee = calculateFinanceFee(i.financed_amount, i.financed_date, i.paid_back_amount);
    return s + (i.financed_amount + fee.feeAmount - i.paid_back_amount);
  }, 0);
  const requiredDeposit = invoices.filter(i => i.status === "open").reduce((s, i) => s + i.financed_amount, 0) * 0.10;
  const currentDeposit = deposits.reduce((s, d) => s + (d.amount || 0), 0);
  const depositShortfall = Math.max(0, requiredDeposit - currentDeposit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {isFinanceUser ? "Invoice Financing" : "PO Financing Tracker"}
        </h1>
        <div className="flex gap-2">
          {isVibeAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" /> Share Link
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDepositOpen(true)}>
                <Banknote className="mr-2 h-4 w-4" /> Record Deposit
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Vendor PO
              </Button>
            </>
          )}
          {isFinanceUser && (
            <Button size="sm" onClick={() => setAddPaymentOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Invoice Payment
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className={`grid grid-cols-1 gap-4 ${isVibeAdmin ? "md:grid-cols-5" : "md:grid-cols-3"}`}>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Financed</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(totalFinanced)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-500">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(totalOutstanding)}</p></CardContent>
        </Card>
        {isVibeAdmin && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Required Deposit (10%)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(requiredDeposit)}</p></CardContent>
          </Card>
        )}
        {isVibeAdmin && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Deposit Balance</CardTitle></CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 text-2xl font-bold text-green-500 hover:underline cursor-pointer">
                    {loading ? <Skeleton className="h-8 w-24" /> : formatUSD(currentDeposit)}
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <div className="p-3 border-b border-border">
                    <p className="text-xs font-semibold text-muted-foreground">Deposit History</p>
                  </div>
                  {deposits.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No deposits yet</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto divide-y divide-border">
                      {deposits.map((d) => (
                        <div key={d.id} className="px-3 py-2 flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">{new Date(d.payment_date + "T00:00:00").toLocaleDateString()}</span>
                          <span className="font-medium">{formatUSD(d.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>
        )}
        {isVibeAdmin && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              {depositShortfall > 0 && <AlertTriangle className="h-3 w-3 text-destructive" />} Deposit Shortfall
            </CardTitle></CardHeader>
            <CardContent><p className={`text-2xl font-bold ${depositShortfall > 0 ? "text-destructive" : "text-green-500"}`}>
              {loading ? <Skeleton className="h-8 w-24" /> : depositShortfall > 0 ? formatUSD(depositShortfall) : "—"}
            </p></CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Repaid</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-500">
            {loading ? <Skeleton className="h-8 w-24" /> : formatUSD(invoices.reduce((s, i) => s + (i.paid_back_amount || 0), 0))}
          </p></CardContent>
        </Card>
      </div>

      {/* Financed Invoices Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Financed Invoices</CardTitle>
          <Button variant="ghost" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : invoices.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No financed invoices yet</p>
          ) : (
            <div className="w-full">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-border bg-muted">
                    {isVibeAdmin && <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Vendor PO</th>}
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Description</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Invoice</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Financed</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Date</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">Aging</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Fee</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Repaid</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Balance</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, idx) => {
                    const fee = calculateFinanceFee(inv.financed_amount, inv.financed_date, inv.paid_back_amount);
                    const invoice = inv.invoices as any;
                    const order = invoice?.orders as any;
                    const vendorPO = inv.vendor_pos as any;
                    const poOrder = vendorPO?.orders as any;

                    // Description logic: finance users see the custom description field only
                    // Admins see PO-derived description as before
                    const adminDesc = vendorPO?.description || poOrder?.description || poOrder?.customer_name || order?.description || order?.customer_name || "—";
                    const displayDesc = isFinanceUser
                      ? (inv.description || "—")
                      : (inv.description || adminDesc);

                    // Visual cue for admins: entry created by finance without linked PO
                    const needsPOLink = isVibeAdmin && !inv.vendor_po_id && inv.created_by_role === "finance";

                    return (
                      <tr key={inv.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} hover:bg-muted/70 cursor-pointer`} onClick={() => navigate(`/financing/${inv.id}`)}>
                        {isVibeAdmin && (
                          <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                            {vendorPO?.po_number ? (
                              `PO #${vendorPO.po_number}`
                            ) : needsPOLink ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 text-amber-500">
                                    <AlertCircle className="h-3 w-3" />
                                    <span className="text-[10px]">Needs PO</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Added by finance company — needs vendor PO link</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : "—"}
                          </td>
                        )}
                        <td className="px-2 py-1.5 max-w-[180px] truncate text-muted-foreground">{displayDesc}</td>
                        <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                          {invoice?.invoice_number || inv.invoice_number || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatUSD(inv.financed_amount)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{new Date(inv.financed_date + "T00:00:00").toLocaleDateString()}</td>
                        <td className="px-2 py-1.5 text-center">
                          <Badge variant={getAgingBadgeVariant(fee.daysAging)} className="text-[10px] px-1.5 py-0">{fee.daysAging}d</Badge>
                        </td>
                        <td className={`px-2 py-1.5 text-right whitespace-nowrap font-medium ${fee.daysAging <= 60 ? "text-yellow-500" : "text-orange-600"}`}>
                          {formatUSD(fee.feeAmount)} <span className="text-[10px] opacity-75">({fee.daysAging <= 60 ? "5%" : "7%"})</span>
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatUSD(inv.paid_back_amount)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatUSD(inv.financed_amount + fee.feeAmount - inv.paid_back_amount)}</td>
                        <td className="px-2 py-1.5">
                          {inv.status !== "paid" && isVibeAdmin && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); setSelectedInvoice({ ...inv, invoice_number: invoice?.invoice_number }); setRepayOpen(true); }}>
                              Repay
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin-only dialogs */}
      {isVibeAdmin && (
        <>
          <AddFinancedInvoiceDialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setPreselectedVendorPO(null); }} onSuccess={fetchData} preselectedVendorPO={preselectedVendorPO} />
          <RecordFinanceRepaymentDialog open={repayOpen} onOpenChange={setRepayOpen} onSuccess={fetchData} invoice={selectedInvoice} />
          <RecordFinanceDepositDialog open={depositOpen} onOpenChange={setDepositOpen} onSuccess={fetchData} />
          <GenerateFinanceLinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
        </>
      )}

      {/* Finance user dialog */}
      {isFinanceUser && (
        <AddFinancedPaymentDialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen} onSuccess={fetchData} />
      )}
    </div>
  );
}

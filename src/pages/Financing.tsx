import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, AlertTriangle, Banknote, Link2, RefreshCw, ChevronDown, AlertCircle, Clock, CheckCircle2, Search, Download } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateFinanceFee, getAgingBadgeVariant, formatUSD } from "@/lib/financeUtils";
import { AddFinancedInvoiceDialog } from "@/components/AddFinancedInvoiceDialog";
import { RecordFinanceRepaymentDialog } from "@/components/RecordFinanceRepaymentDialog";
import { RecordFinanceDepositDialog } from "@/components/RecordFinanceDepositDialog";
import { GenerateFinanceLinkDialog } from "@/components/GenerateFinanceLinkDialog";
import { AcceptFinanceRequestDialog } from "@/components/AcceptFinanceRequestDialog";
import { FinanceConfirmationsTab } from "@/components/FinanceConfirmationsTab";
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
  
  const [repayOpen, setRepayOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [preselectedVendorPO, setPreselectedVendorPO] = useState<{ id: string; po_number: string; total: number; description: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pendingConfirmations, setPendingConfirmations] = useState(0);

  const isVibeAdmin = userRole === "vibe_admin";
  const isFinanceUser = userRole === "finance";

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

  useEffect(() => { checkAccess(); }, []);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["vibe_admin", "finance"]);
    if (!data || data.length === 0) { navigate("/dashboard"); return; }
    const roles = data.map((r: any) => r.role as string);
    if (roles.includes("vibe_admin")) setUserRole("vibe_admin");
    else setUserRole("finance");
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
    // Count pending confirmations
    const [repConf, depConf] = await Promise.all([
      supabase.from("finance_repayments").select("id", { count: "exact", head: true }).eq("confirmation_status", "pending"),
      supabase.from("finance_deposits").select("id", { count: "exact", head: true }).eq("confirmation_status", "pending"),
    ]);
    setPendingConfirmations((repConf.count || 0) + (depConf.count || 0));
    setLoading(false);
  };

  if (!isAuthorized) return null;

  // Filter helper
  const filterBySearchAndDate = (list: any[]) => {
    let filtered = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((i) => {
        const vpo = i.vendor_pos as any;
        const inv = i.invoices as any;
        const poOrder = vpo?.orders as any;
        return (
          vpo?.po_number?.toLowerCase().includes(q) ||
          vpo?.description?.toLowerCase().includes(q) ||
          poOrder?.customer_name?.toLowerCase().includes(q) ||
          poOrder?.order_number?.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.invoice_number?.toLowerCase().includes(q) ||
          inv?.invoice_number?.toLowerCase().includes(q) ||
          i.notes?.toLowerCase().includes(q)
        );
      });
    }
    if (dateFrom) filtered = filtered.filter((i) => (i.financed_date || i.created_at) >= dateFrom);
    if (dateTo) filtered = filtered.filter((i) => (i.financed_date || i.created_at) <= dateTo + "T23:59:59");
    return filtered;
  };

  // Split invoices by finance_status
  const pendingInvoices = filterBySearchAndDate(invoices.filter(i => i.finance_status === "pending"));
  const activeInvoices = filterBySearchAndDate(invoices.filter(i => !i.finance_status || i.finance_status === "active"));
  const completedInvoices = filterBySearchAndDate(invoices.filter(i => i.finance_status === "completed"));

  // Summary cards only count active entries (unfiltered)
  const allActive = invoices.filter(i => !i.finance_status || i.finance_status === "active");
  const totalFinanced = allActive.reduce((s, i) => s + (i.financed_amount || 0), 0);
  const totalOutstanding = allActive.filter(i => i.status === "open").reduce((s, i) => {
    const fee = calculateFinanceFee(i.financed_amount, i.financed_date, i.paid_back_amount);
    return s + (i.financed_amount + fee.feeAmount - i.paid_back_amount);
  }, 0);
  const requiredDeposit = allActive.filter(i => i.status === "open").reduce((s, i) => s + i.financed_amount, 0) * 0.10;
  const currentDeposit = deposits.reduce((s, d) => s + (d.amount || 0), 0);
  const depositShortfall = Math.max(0, requiredDeposit - currentDeposit);

  const exportCSV = () => {
    const tab = activeTab === "pending" ? pendingInvoices : activeTab === "active" ? activeInvoices : completedInvoices;
    const headers = ["Description", "Financed Amount", "Date", "Status", "Paid Back", "Notes"];
    if (isVibeAdmin) headers.unshift("Vendor PO");
    if (activeTab === "active") headers.push("Fee", "Balance");

    const rows = tab.map((inv) => {
      const vpo = inv.vendor_pos as any;
      const fee = calculateFinanceFee(inv.financed_amount, inv.financed_date, inv.paid_back_amount);
      const row: string[] = [];
      if (isVibeAdmin) row.push(vpo?.po_number ? `PO #${vpo.po_number}` : "");
      row.push(
        inv.description || vpo?.description || "",
        String(inv.financed_amount || 0),
        inv.financed_date || "",
        inv.finance_status || "",
        String(inv.paid_back_amount || 0),
        inv.notes || "",
      );
      if (activeTab === "active") row.push(String(fee.feeAmount.toFixed(2)), String((inv.financed_amount + fee.feeAmount - inv.paid_back_amount).toFixed(2)));
      return row;
    });

    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${(c || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financing-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderActiveRow = (inv: any, idx: number) => {
    const fee = calculateFinanceFee(inv.financed_amount, inv.financed_date, inv.paid_back_amount);
    const invoice = inv.invoices as any;
    const order = invoice?.orders as any;
    const vendorPO = inv.vendor_pos as any;
    const poOrder = vendorPO?.orders as any;
    const adminDesc = vendorPO?.description || poOrder?.description || poOrder?.customer_name || order?.description || order?.customer_name || "—";
    const displayDesc = isFinanceUser ? (inv.description || "—") : (inv.description || adminDesc);
    const needsPOLink = isVibeAdmin && !inv.vendor_po_id && inv.created_by_role === "finance";

    return (
      <tr key={inv.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} hover:bg-muted/70 cursor-pointer`} onClick={() => navigate(`/financing/${inv.id}`)}>
        {isVibeAdmin && (
          <td className="px-2 py-1.5 font-mono whitespace-nowrap">
            {vendorPO?.po_number ? `PO #${vendorPO.po_number}` : needsPOLink ? (
              <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-1 text-amber-500"><AlertCircle className="h-3 w-3" /><span className="text-[10px]">Needs PO</span></span></TooltipTrigger><TooltipContent><p className="text-xs">Added by finance company — needs vendor PO link</p></TooltipContent></Tooltip>
            ) : "—"}
          </td>
        )}
        <td className="px-2 py-1.5 max-w-[180px] truncate text-muted-foreground">{displayDesc}</td>
        <td className="px-2 py-1.5 font-mono whitespace-nowrap">{invoice?.invoice_number || inv.invoice_number || "—"}</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatUSD(inv.financed_amount)}</td>
        <td className="px-2 py-1.5 whitespace-nowrap">{new Date(String(inv.financed_date).split("T")[0] + "T00:00:00").toLocaleDateString()}</td>
        <td className="px-2 py-1.5 text-center"><Badge variant={getAgingBadgeVariant(fee.daysAging)} className="text-[10px] px-1.5 py-0">{fee.daysAging}d</Badge></td>
        <td className={`px-2 py-1.5 text-right whitespace-nowrap font-medium ${fee.daysAging <= 60 ? "text-yellow-500" : "text-orange-600"}`}>
          {formatUSD(fee.feeAmount)} <span className="text-[10px] opacity-75">({fee.daysAging <= 60 ? "5%" : "7%"})</span>
        </td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatUSD(inv.paid_back_amount)}</td>
        <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatUSD(inv.financed_amount + fee.feeAmount - inv.paid_back_amount)}</td>
        <td className="px-2 py-1.5">
          {inv.status !== "paid" && isVibeAdmin && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); setSelectedInvoice({ ...inv, invoice_number: invoice?.invoice_number }); setRepayOpen(true); }}>Repay</Button>
          )}
        </td>
      </tr>
    );
  };

  const renderPendingRow = (inv: any, idx: number) => {
    const vendorPO = inv.vendor_pos as any;
    const poOrder = vendorPO?.orders as any;
    const desc = isFinanceUser ? (inv.description || vendorPO?.description || "—") : (vendorPO?.description || poOrder?.description || poOrder?.customer_name || "—");

    return (
      <tr key={inv.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} hover:bg-muted/70 cursor-pointer`} onClick={() => navigate(`/financing/${inv.id}`)}>
        {isVibeAdmin && (
          <td className="px-2 py-1.5 font-mono whitespace-nowrap">
            {vendorPO?.po_number ? `PO #${vendorPO.po_number}` : "—"}
          </td>
        )}
        <td className="px-2 py-1.5 max-w-[200px] truncate text-muted-foreground">{desc}</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatUSD(inv.financed_amount)}</td>
        <td className="px-2 py-1.5 whitespace-nowrap">{new Date(String(inv.created_at || inv.financed_date).split("T")[0] + "T00:00:00").toLocaleDateString()}</td>
        <td className="px-2 py-1.5 text-center">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-500 border-amber-500/30">
            <Clock className="h-2.5 w-2.5 mr-1" /> Waiting
          </Badge>
        </td>
        <td className="px-2 py-1.5">
          {isFinanceUser && (
            <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv); setAcceptOpen(true); }}>
              Accept
            </Button>
          )}
        </td>
      </tr>
    );
  };

  const renderCompletedRow = (inv: any, idx: number) => {
    const invoice = inv.invoices as any;
    const vendorPO = inv.vendor_pos as any;
    const poOrder = vendorPO?.orders as any;
    const desc = isFinanceUser ? (inv.description || "—") : (vendorPO?.description || poOrder?.description || poOrder?.customer_name || "—");

    return (
      <tr key={inv.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} hover:bg-muted/70 cursor-pointer opacity-70`} onClick={() => navigate(`/financing/${inv.id}`)}>
        {isVibeAdmin && (
          <td className="px-2 py-1.5 font-mono whitespace-nowrap">
            {vendorPO?.po_number ? `PO #${vendorPO.po_number}` : "—"}
          </td>
        )}
        <td className="px-2 py-1.5 max-w-[180px] truncate text-muted-foreground">{desc}</td>
        <td className="px-2 py-1.5 font-mono whitespace-nowrap">{invoice?.invoice_number || inv.invoice_number || "—"}</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatUSD(inv.financed_amount)}</td>
        <td className="px-2 py-1.5 whitespace-nowrap">{new Date(String(inv.financed_date).split("T")[0] + "T00:00:00").toLocaleDateString()}</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatUSD(inv.paid_back_amount)}</td>
        <td className="px-2 py-1.5 text-center">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-500 border-green-500/30">
            <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Paid
          </Badge>
        </td>
      </tr>
    );
  };

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
                <Plus className="mr-2 h-4 w-4" /> Submit for Financing
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards — only active entries */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Financed</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(totalFinanced)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Armropak Outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-500">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(totalOutstanding)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Required Deposit (10%)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-24" /> : formatUSD(requiredDeposit)}</p></CardContent>
        </Card>
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
                <div className="p-3 border-b border-border"><p className="text-xs font-semibold text-muted-foreground">Deposit History</p></div>
                {deposits.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No deposits yet</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-border">
                    {deposits.map((d) => (
                      <div key={d.id} className="px-3 py-2 flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{new Date(String(d.payment_date).split("T")[0] + "T00:00:00").toLocaleDateString()}</span>
                        <span className="font-medium">{formatUSD(d.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Repaid</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-500">
            {loading ? <Skeleton className="h-8 w-24" /> : formatUSD(activeInvoices.reduce((s, i) => s + (i.paid_back_amount || 0), 0))}
          </p></CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pending" className="gap-1.5">
              Pending {pendingInvoices.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{pendingInvoices.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-1.5">
              Active {activeInvoices.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{activeInvoices.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5">
              Completed {completedInvoices.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{completedInvoices.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="confirmations" className="gap-1.5">
              Confirmations {pendingConfirmations > 0 && <Badge variant="warning" className="text-[10px] px-1.5 py-0 ml-1">{pendingConfirmations}</Badge>}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3 pt-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search PO, description, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>From</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-[130px] text-xs" />
            <span>To</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-[130px] text-xs" />
            {(dateFrom || dateTo || searchQuery) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => { setSearchQuery(""); setDateFrom(""); setDateTo(""); }}>Clear</Button>
            )}
          </div>
        </div>

        {/* PENDING TAB */}
        <TabsContent value="pending">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : pendingInvoices.length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-sm">No pending requests</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border bg-muted">
                      {isVibeAdmin && <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Vendor PO</th>}
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Description</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Amount</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Submitted</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">Status</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>{pendingInvoices.map(renderPendingRow)}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVE TAB */}
        <TabsContent value="active">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : activeInvoices.length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-sm">No active financed invoices</p>
              ) : (
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
                  <tbody>{activeInvoices.map(renderActiveRow)}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPLETED TAB */}
        <TabsContent value="completed">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : completedInvoices.length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-sm">No completed entries</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border bg-muted">
                      {isVibeAdmin && <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Vendor PO</th>}
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Description</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Invoice</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Financed</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Date</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Repaid</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody>{completedInvoices.map(renderCompletedRow)}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {isVibeAdmin && (
        <>
          <AddFinancedInvoiceDialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setPreselectedVendorPO(null); }} onSuccess={fetchData} preselectedVendorPO={preselectedVendorPO} />
          <RecordFinanceRepaymentDialog open={repayOpen} onOpenChange={setRepayOpen} onSuccess={fetchData} invoice={selectedInvoice} />
          <RecordFinanceDepositDialog open={depositOpen} onOpenChange={setDepositOpen} onSuccess={fetchData} />
          <GenerateFinanceLinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
        </>
      )}
      {isFinanceUser && (
        <AcceptFinanceRequestDialog open={acceptOpen} onOpenChange={setAcceptOpen} onSuccess={fetchData} invoice={selectedInvoice} />
      )}
    </div>
  );
}

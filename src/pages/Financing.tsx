import { useState, useEffect, useMemo } from "react";
import { toast } from "@/hooks/use-toast";
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
import { calculateFinanceFee, getAgingBadgeVariant, formatUSD, formatRMB } from "@/lib/financeUtils";
import { AddFinancedInvoiceDialog } from "@/components/AddFinancedInvoiceDialog";
import { RecordFinanceRepaymentDialog } from "@/components/RecordFinanceRepaymentDialog";
import { RecordFinanceDepositDialog } from "@/components/RecordFinanceDepositDialog";
import { BulkFinancePaymentDialog } from "@/components/BulkFinancePaymentDialog";
import { GenerateFinanceLinkDialog } from "@/components/GenerateFinanceLinkDialog";
import { AcceptFinanceRequestDialog } from "@/components/AcceptFinanceRequestDialog";
import { FinanceConfirmationsTab } from "@/components/FinanceConfirmationsTab";
import { Skeleton } from "@/components/ui/skeleton";
import { useFinanceLang } from "@/lib/financeI18n";
import { FinanceLangToggle } from "@/components/FinanceLangToggle";
import { CardCurrency, DualCurrency } from "@/components/DualCurrency";

// Inline-editable text cell for the financing table (description / invoice #).
// Click to edit; Enter or blur saves; Escape cancels. Stops row-navigation clicks.
function EditableTextCell({
  value,
  placeholder = "—",
  editable = true,
  mono = false,
  className = "",
  onSave,
}: {
  value: string | null;
  placeholder?: string;
  editable?: boolean;
  mono?: boolean;
  className?: string;
  onSave: (next: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = async () => {
    const next = draft.trim();
    if (next === (value ?? "")) { setEditing(false); return; }
    setSaving(true);
    await onSave(next);
    setSaving(false);
    setEditing(false);
  };

  if (!editable) {
    return <span className={`${mono ? "font-mono " : ""}${className}`}>{value || placeholder}</span>;
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
        }}
        className={`h-6 text-xs px-1.5 ${mono ? "font-mono" : ""}`}
      />
    );
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="Click to edit"
      className={`block cursor-text rounded -mx-1 px-1 hover:bg-muted ${mono ? "font-mono " : ""}${value ? "" : "italic text-muted-foreground/50 "}${className}`}
    >
      {value || placeholder}
    </span>
  );
}

export default function Financing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userRole, setUserRole] = useState<"vibe_admin" | "finance" | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  
  const [repayOpen, setRepayOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [preselectedVendorPO, setPreselectedVendorPO] = useState<{ id: string; po_number: string; total: number; description: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pendingConfirmations, setPendingConfirmations] = useState(0);

  const { lang, toggleLang, t } = useFinanceLang();

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
    const [invRes, depRes, repRes] = await Promise.all([
      supabase.from("financed_invoices").select("*, invoices(invoice_number, total, orders(order_number, customer_name, description)), vendor_pos(po_number, description, total, orders(order_number, customer_name, description), vendors(name))").order("financed_date", { ascending: false }),
      supabase.from("finance_deposits").select("*").order("payment_date", { ascending: false }),
      supabase.from("finance_repayments").select("id, amount, source, payment_method, payment_batch_id, confirmation_status, payment_date"),
    ]);
    setInvoices(invRes.data || []);
    setDeposits(depRes.data || []);
    const reps = repRes.data || [];
    setRepayments(reps);
    // Count pending confirmations by BATCH: a wire / deposit-pull batch is one confirmation, not one per allocation row.
    const pendingReps = reps.filter((r: any) => r.confirmation_status === "pending");
    const pendingBatches = new Set(pendingReps.filter((r: any) => r.payment_batch_id).map((r: any) => r.payment_batch_id));
    const pendingUnbatched = pendingReps.filter((r: any) => !r.payment_batch_id).length;
    const pendingDeposits = (depRes.data || []).filter((d: any) => d.confirmation_status === "pending").length;
    setPendingConfirmations(pendingBatches.size + pendingUnbatched + pendingDeposits);
    setLoading(false);
  };

  // Inline-edit save for description / invoice_number directly on the table.
  const saveInvoiceField = async (id: string, field: "description" | "invoice_number", next: string) => {
    const { error } = await supabase
      .from("financed_invoices")
      .update({ [field]: next || null })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: next || null } : i)));
  };

  if (!isAuthorized) return null;

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

  const pendingInvoices = filterBySearchAndDate(invoices.filter(i => i.finance_status === "pending"));
  const activeInvoices = filterBySearchAndDate(invoices.filter(i => !i.finance_status || i.finance_status === "active"));
  const completedInvoices = filterBySearchAndDate(invoices.filter(i => i.finance_status === "completed"));

  const allActive = invoices.filter(i => !i.finance_status || i.finance_status === "active");
  const totalFinanced = allActive.reduce((s, i) => s + (i.financed_amount || 0), 0);
  const totalFinancedRMB = allActive.reduce((s, i) => s + (i.financed_amount_rmb || 0), 0);
  const totalOutstanding = allActive.filter(i => i.status === "open").reduce((s, i) => {
    const fee = calculateFinanceFee(i.financed_amount, i.financed_date, i.paid_back_amount, i.paid_back_date);
    return s + (i.financed_amount + fee.feeAmount - i.paid_back_amount);
  }, 0);
  const totalOutstandingRMB = allActive.filter(i => i.status === "open").reduce((s, i) => {
    const fee = calculateFinanceFee(i.financed_amount, i.financed_date, i.paid_back_amount, i.paid_back_date);
    const rate = i.exchange_rate || 7.2;
    return s + ((i.financed_amount + fee.feeAmount - i.paid_back_amount) * rate);
  }, 0);
  const requiredDeposit = allActive.filter(i => i.status === "open").reduce((s, i) => s + i.financed_amount, 0) * 0.10;
  const requiredDepositRMB = allActive.filter(i => i.status === "open").reduce((s, i) => s + (i.financed_amount_rmb || i.financed_amount * (i.exchange_rate || 7.2)), 0) * 0.10;
  const totalDeposited = deposits.filter(d => d.confirmation_status !== "disputed").reduce((s, d) => s + (d.amount || 0), 0);
  const depositPulled = repayments.filter(r => (r.source === "deposit" || r.payment_method === "deposit") && r.confirmation_status !== "disputed").reduce((s, r) => s + (r.amount || 0), 0);
  const currentDeposit = totalDeposited - depositPulled;
  const avgRate = allActive.length > 0 ? allActive.reduce((s, i) => s + (i.exchange_rate || 7.2), 0) / allActive.length : 7.2;
  const currentDepositRMB = currentDeposit * avgRate;
  const depositShortfall = Math.max(0, requiredDeposit - currentDeposit);
  const depositShortfallRMB = Math.max(0, requiredDepositRMB - currentDepositRMB);
  // Total repaid = everything paid back across ALL financed invoices (active + completed),
  // so it doesn't drop to 0 once invoices are fully paid off.
  const totalRepaidUSD = invoices.reduce((s, i) => s + (i.paid_back_amount || 0), 0);
  const totalRepaidRMB = invoices.reduce((s, i) => s + ((i.paid_back_amount || 0) * (i.exchange_rate || 7.2)), 0);

  const exportCSV = () => {
    const tab = activeTab === "pending" ? pendingInvoices : activeTab === "active" ? activeInvoices : completedInvoices;
    const headers = ["Description", "Financed Amount", "Date", "Status", "Paid Back", "Notes"];
    if (isVibeAdmin) headers.unshift("Vendor PO");
    if (activeTab === "active") headers.push("Fee", "Balance");

    const rows = tab.map((inv) => {
      const vpo = inv.vendor_pos as any;
      const fee = calculateFinanceFee(inv.financed_amount, inv.financed_date, inv.paid_back_amount, inv.paid_back_date);
      const row: string[] = [];
      if (isVibeAdmin) row.push(vpo?.po_number ? `PO #${vpo.po_number}` : "");
      row.push(
        inv.description || "",
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

  const renderDualAmount = (usd: number, rate: number) => {
    const rmb = usd * rate;
    return (
      <DualCurrency usd={usd} rmb={rmb} lang={lang} />
    );
  };

  const renderActiveRow = (inv: any, idx: number) => {
    const fee = calculateFinanceFee(inv.financed_amount, inv.financed_date, inv.paid_back_amount, inv.paid_back_date);
    const invoice = inv.invoices as any;
    const vendorPO = inv.vendor_pos as any;
    const needsPOLink = isVibeAdmin && !inv.vendor_po_id && inv.created_by_role === "finance";
    const rate = inv.exchange_rate || 7.2;

    return (
      <tr key={inv.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} hover:bg-muted/70 cursor-pointer`} onClick={() => navigate(`/financing/${inv.id}`)}>
        {isVibeAdmin && (
          <td className="px-2 py-1.5 font-mono whitespace-nowrap">
            {vendorPO?.po_number ? `PO #${vendorPO.po_number}` : needsPOLink ? (
              <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-1 text-amber-500"><AlertCircle className="h-3 w-3" /><span className="text-[10px]">{t("needsPO")}</span></span></TooltipTrigger><TooltipContent><p className="text-xs">{t("addedByFinance")}</p></TooltipContent></Tooltip>
            ) : "—"}
          </td>
        )}
        <td className="px-2 py-1.5 min-w-[220px] max-w-[340px] align-top text-muted-foreground">
          <EditableTextCell
            value={inv.description}
            editable={isVibeAdmin}
            placeholder={isVibeAdmin ? "Add description" : "—"}
            className="whitespace-normal break-words leading-snug"
            onSave={(v) => saveInvoiceField(inv.id, "description", v)}
          />
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap">
          <EditableTextCell
            value={inv.invoice_number}
            editable={isVibeAdmin}
            mono
            placeholder={invoice?.invoice_number || (isVibeAdmin ? "Add invoice #" : "—")}
            onSave={(v) => saveInvoiceField(inv.id, "invoice_number", v)}
          />
        </td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{renderDualAmount(inv.financed_amount, rate)}</td>
        <td className="px-2 py-1.5 whitespace-nowrap">{new Date(String(inv.financed_date).split("T")[0] + "T00:00:00").toLocaleDateString()}</td>
        <td className="px-2 py-1.5 text-center"><Badge variant={getAgingBadgeVariant(fee.daysAging)} className="text-[10px] px-1.5 py-0">{fee.daysAging}{t("days")}</Badge></td>
        <td className={`px-2 py-1.5 text-right whitespace-nowrap font-medium ${fee.daysAging <= 60 ? "text-yellow-500" : "text-orange-600"}`}>
          {renderDualAmount(fee.feeAmount, rate)} <span className="text-[10px] opacity-75">(5%)</span>
        </td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{renderDualAmount(inv.paid_back_amount, rate)}</td>
        <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{renderDualAmount(inv.financed_amount + fee.feeAmount - inv.paid_back_amount, rate)}</td>
        <td className="px-2 py-1.5">
          {inv.status !== "paid" && isVibeAdmin && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); setSelectedInvoice({ ...inv, invoice_number: invoice?.invoice_number }); setRepayOpen(true); }}>{t("repay")}</Button>
          )}
        </td>
      </tr>
    );
  };

  const renderPendingRow = (inv: any, idx: number) => {
    const vendorPO = inv.vendor_pos as any;
    const rate = inv.exchange_rate || 7.2;

    return (
      <tr key={inv.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} hover:bg-muted/70 cursor-pointer`} onClick={() => navigate(`/financing/${inv.id}`)}>
        {isVibeAdmin && (
          <td className="px-2 py-1.5 font-mono whitespace-nowrap">
            {vendorPO?.po_number ? `PO #${vendorPO.po_number}` : "—"}
          </td>
        )}
        <td className="px-2 py-1.5 min-w-[220px] max-w-[340px] align-top text-muted-foreground">
          <EditableTextCell
            value={inv.description}
            editable={isVibeAdmin}
            placeholder={isVibeAdmin ? "Add description" : "—"}
            className="whitespace-normal break-words leading-snug"
            onSave={(v) => saveInvoiceField(inv.id, "description", v)}
          />
        </td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{renderDualAmount(inv.financed_amount, rate)}</td>
        <td className="px-2 py-1.5 whitespace-nowrap">{new Date(String(inv.created_at || inv.financed_date).split("T")[0] + "T00:00:00").toLocaleDateString()}</td>
        <td className="px-2 py-1.5 text-center">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-500 border-amber-500/30">
            <Clock className="h-2.5 w-2.5 mr-1" /> {t("waiting")}
          </Badge>
        </td>
        <td className="px-2 py-1.5">
          {isFinanceUser && (
            <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv); setAcceptOpen(true); }}>
              {t("accept")}
            </Button>
          )}
          {isVibeAdmin && (
            <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={async (e) => {
              e.stopPropagation();
              const { error } = await supabase.from("financed_invoices").update({ finance_status: "active" }).eq("id", inv.id);
              if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
              else { toast({ title: "Activated" }); fetchData(); }
            }}>
              Activate
            </Button>
          )}
        </td>
      </tr>
    );
  };

  const renderCompletedRow = (inv: any, idx: number) => {
    const invoice = inv.invoices as any;
    const vendorPO = inv.vendor_pos as any;
    const rate = inv.exchange_rate || 7.2;
    const feeAmount = (inv.paid_back_amount || 0) - (inv.financed_amount || 0);

    return (
      <tr key={inv.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} hover:bg-muted/70 cursor-pointer opacity-70`} onClick={() => navigate(`/financing/${inv.id}`)}>
        {isVibeAdmin && (
          <td className="px-2 py-1.5 font-mono whitespace-nowrap">
            {vendorPO?.po_number ? `PO #${vendorPO.po_number}` : "—"}
          </td>
        )}
        <td className="px-2 py-1.5 min-w-[220px] max-w-[340px] align-top text-muted-foreground">
          <EditableTextCell
            value={inv.description}
            editable={isVibeAdmin}
            placeholder={isVibeAdmin ? "Add description" : "—"}
            className="whitespace-normal break-words leading-snug"
            onSave={(v) => saveInvoiceField(inv.id, "description", v)}
          />
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap">
          <EditableTextCell
            value={inv.invoice_number}
            editable={isVibeAdmin}
            mono
            placeholder={invoice?.invoice_number || (isVibeAdmin ? "Add invoice #" : "—")}
            onSave={(v) => saveInvoiceField(inv.id, "invoice_number", v)}
          />
        </td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{renderDualAmount(inv.financed_amount, rate)}</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap text-yellow-600">
          {feeAmount > 0.01 ? <>+{renderDualAmount(feeAmount, rate)} <span className="text-[10px] opacity-75">(5%)</span></> : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap">{new Date(String(inv.financed_date).split("T")[0] + "T00:00:00").toLocaleDateString()}</td>
        <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap text-green-600">{renderDualAmount(inv.paid_back_amount, rate)}</td>
        <td className="px-2 py-1.5 text-center">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-500 border-green-500/30">
            <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> {t("paid")}
          </Badge>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {isFinanceUser ? t("invoiceFinancing") : t("poFinancingTracker")}
        </h1>
        <div className="flex gap-2">
          <FinanceLangToggle lang={lang} onToggle={toggleLang} />
          {isVibeAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" /> {t("shareLink")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBulkPayOpen(true)}>
                <Banknote className="mr-2 h-4 w-4" /> Bulk Payment
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDepositOpen(true)}>
                <Banknote className="mr-2 h-4 w-4" /> {t("recordDeposit")}
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> {t("submitForFinancing")}
              </Button>
            </>
          )}
          {isFinanceUser && !isVibeAdmin && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Financed Order
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("activeFinanced")}</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-24" /> : <CardCurrency usd={totalFinanced} rmb={totalFinancedRMB} lang={lang} />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("armorpakOutstanding")}</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-24" /> : <CardCurrency usd={totalOutstanding} rmb={totalOutstandingRMB} lang={lang} colorClass="text-amber-500" />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("requiredDeposit")}</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-24" /> : <CardCurrency usd={requiredDeposit} rmb={requiredDepositRMB} lang={lang} />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("depositBalance")}</CardTitle></CardHeader>
          <CardContent>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 hover:underline cursor-pointer">
                  <CardCurrency usd={currentDeposit} rmb={currentDepositRMB} lang={lang} colorClass="text-green-500" />
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <div className="p-3 border-b border-border space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total Deposited</span><span className="font-medium">{formatUSD(totalDeposited)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Pulled to Repayments</span><span className="font-medium text-amber-500">−{formatUSD(depositPulled)}</span></div>
                  <div className="flex justify-between text-xs border-t border-border pt-1 mt-1"><span className="font-semibold">Available</span><span className="font-semibold text-green-500">{formatUSD(currentDeposit)}</span></div>
                </div>
                <div className="p-3 border-b border-border"><p className="text-xs font-semibold text-muted-foreground">{t("depositHistory")}</p></div>
                {deposits.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">{t("noDeposits")}</p>
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
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("totalRepaid")}</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-24" /> : <CardCurrency usd={totalRepaidUSD} rmb={totalRepaidRMB} lang={lang} colorClass="text-green-500" />}</CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pending" className="gap-1.5">
              {t("pending")} {pendingInvoices.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{pendingInvoices.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-1.5">
              {t("active")} {activeInvoices.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{activeInvoices.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5">
              {t("completed")} {completedInvoices.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{completedInvoices.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="confirmations" className="gap-1.5">
              {t("confirmations")} {pendingConfirmations > 0 && <Badge variant="warning" className="text-[10px] px-1.5 py-0 ml-1">{pendingConfirmations}</Badge>}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> {t("export")}
            </Button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3 pt-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t("from")}</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-[130px] text-xs" />
            <span>{t("to")}</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-[130px] text-xs" />
            {(dateFrom || dateTo || searchQuery) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => { setSearchQuery(""); setDateFrom(""); setDateTo(""); }}>{t("clear")}</Button>
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
                <p className="text-muted-foreground text-center py-8 text-sm">{t("noPending")}</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border bg-muted">
                      {isVibeAdmin && <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("vendorPO")}</th>}
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("description")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("amount")}</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("submitted")}</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">{t("status")}</th>
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
                <p className="text-muted-foreground text-center py-8 text-sm">{t("noActive")}</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border bg-muted">
                      {isVibeAdmin && <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("vendorPO")}</th>}
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("description")}</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("invoice")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("financed")}</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("date")}</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">{t("aging")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("fee")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("repaid")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("balance")}</th>
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
                <p className="text-muted-foreground text-center py-8 text-sm">{t("noCompleted")}</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border bg-muted">
                      {isVibeAdmin && <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("vendorPO")}</th>}
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("description")}</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("invoice")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("financed")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("fee")}</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("date")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("repaid")}</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">{t("status")}</th>
                    </tr>
                  </thead>
                  <tbody>{completedInvoices.map(renderCompletedRow)}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONFIRMATIONS TAB */}
        <TabsContent value="confirmations">
          <FinanceConfirmationsTab isVibeAdmin={isVibeAdmin} isFinanceUser={isFinanceUser} lang={lang} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {isVibeAdmin && (
        <>
          <AddFinancedInvoiceDialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setPreselectedVendorPO(null); }} onSuccess={fetchData} preselectedVendorPO={preselectedVendorPO} mode="admin" />
          <RecordFinanceRepaymentDialog open={repayOpen} onOpenChange={setRepayOpen} onSuccess={fetchData} invoice={selectedInvoice} />
          <BulkFinancePaymentDialog open={bulkPayOpen} onOpenChange={setBulkPayOpen} onSuccess={fetchData} invoices={allActive} />
          <RecordFinanceDepositDialog open={depositOpen} onOpenChange={setDepositOpen} onSuccess={fetchData} />
          <GenerateFinanceLinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
        </>
      )}
      {isFinanceUser && !isVibeAdmin && (
        <AddFinancedInvoiceDialog open={addOpen} onOpenChange={setAddOpen} onSuccess={fetchData} mode="finance" />
      )}
      {(isFinanceUser || isVibeAdmin) && (
        <AcceptFinanceRequestDialog open={acceptOpen} onOpenChange={setAcceptOpen} onSuccess={fetchData} invoice={selectedInvoice} lang={lang} />
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { calculateFinanceFee, getAgingBadgeVariant, formatRMB, formatUSD } from "@/lib/financeUtils";
import { Toaster } from "@/components/ui/toaster";
import { useFinanceLang } from "@/lib/financeI18n";
import { FinanceLangToggle } from "@/components/FinanceLangToggle";
import { CardCurrency, DualCurrency } from "@/components/DualCurrency";

export default function FinanceView() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  const { lang, toggleLang, t } = useFinanceLang();

  useEffect(() => {
    if (token) fetchData();
    else setError(t("invalidLink"));
  }, [token]);

  const fetchData = async () => {
    setLoading(true);
    const { data: result, error: err } = await supabase.rpc("get_finance_data_by_token", { p_token: token! });
    if (err || !result || !(result as any).success) {
      setError(t("linkExpired"));
    } else {
      setData(result);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Toaster />
        <Card className="max-w-sm">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <p className="text-lg font-semibold">{error}</p>
            <p className="text-sm text-muted-foreground mt-2">{t("contactAdmin")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invoices = data?.invoices || [];
  const totalOpenFinanced = data?.total_open_financed || 0;
  const totalDeposited = data?.total_deposited || 0;
  const requiredDeposit = data?.required_deposit || 0;
  const depositShortfall = Math.max(0, requiredDeposit - totalDeposited);

  const avgRate = invoices.length > 0 ? invoices.reduce((s: number, i: any) => s + (i.exchange_rate || 7.2), 0) / invoices.length : 7.2;

  const totalFinancedRMB = invoices.reduce((s: number, i: any) => s + (i.financed_amount_rmb || 0), 0);
  const totalFinancedUSD = invoices.reduce((s: number, i: any) => s + (i.financed_amount || 0), 0);
  const totalOutstandingRMB = invoices.filter((i: any) => i.status === "open").reduce((s: number, i: any) => s + ((i.financed_amount - i.paid_back_amount) * (i.exchange_rate || 7.2)), 0);
  const totalOutstandingUSD = invoices.filter((i: any) => i.status === "open").reduce((s: number, i: any) => s + (i.financed_amount - i.paid_back_amount), 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Toaster />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center mb-8 relative">
          <div className="absolute right-0 top-0">
            <FinanceLangToggle lang={lang} onToggle={toggleLang} />
          </div>
          <h1 className="text-3xl font-bold">{t("financeTrackingPlatform")}</h1>
          {data?.label && <p className="text-muted-foreground mt-1">{data.label}</p>}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("totalFinanced")}</CardTitle></CardHeader>
            <CardContent><CardCurrency usd={totalFinancedUSD} rmb={totalFinancedRMB} lang={lang} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("totalOutstanding")}</CardTitle></CardHeader>
            <CardContent><CardCurrency usd={totalOutstandingUSD} rmb={totalOutstandingRMB} lang={lang} colorClass="text-amber-500" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("requiredDeposit")}</CardTitle></CardHeader>
            <CardContent><CardCurrency usd={requiredDeposit} rmb={requiredDeposit * avgRate} lang={lang} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("depositBalance")}</CardTitle></CardHeader>
            <CardContent><CardCurrency usd={totalDeposited} rmb={totalDeposited * avgRate} lang={lang} colorClass="text-green-500" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              {depositShortfall > 0 && <AlertTriangle className="h-3 w-3 text-destructive" />} {t("depositShortfall")}
            </CardTitle></CardHeader>
            <CardContent>
              {depositShortfall > 0 ? (
                <CardCurrency usd={depositShortfall} rmb={depositShortfall * avgRate} lang={lang} colorClass="text-destructive" />
              ) : (
                <p className="text-2xl font-bold text-green-500">—</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Invoices Table */}
        <Card>
          <CardHeader><CardTitle>{lang === "zh" ? "融资发票明细" : "Financed Invoice Details"}</CardTitle></CardHeader>
          <CardContent className="p-0">
            {invoices.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{t("noFinanceRecords")}</p>
            ) : (
              <div className="w-full">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border bg-muted">
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("invoice")}</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("description")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("financed")}</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("financedDate")}</th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">{t("aging")}</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{t("feeTier")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("fee")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("repaid")}</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t("balance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv: any, idx: number) => {
                      const fee = calculateFinanceFee(inv.financed_amount, inv.financed_date, inv.paid_back_amount, inv.paid_back_date);
                      const rate = inv.exchange_rate || 7.2;
                      const desc = inv.vendor_po_description || inv.customer_name || "—";
                      return (
                        <tr key={inv.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""}`}>
                          <td className="px-2 py-1.5 font-mono whitespace-nowrap">{inv.invoice_number || inv.vendor_po_number ? `PO #${inv.vendor_po_number}` : "—"}</td>
                          <td className="px-2 py-1.5 max-w-[180px] truncate text-muted-foreground">{desc}</td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            <DualCurrency usd={inv.financed_amount} rmb={inv.financed_amount_rmb} lang={lang} />
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{new Date(inv.financed_date).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}</td>
                          <td className="px-2 py-1.5 text-center">
                            <Badge variant={getAgingBadgeVariant(fee.daysAging)} className="text-[10px] px-1.5 py-0">{fee.daysAging}{t("days")}</Badge>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{fee.feeTier}</td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            <DualCurrency usd={fee.feeAmount} rmb={fee.feeAmount * rate} lang={lang} />
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            <DualCurrency usd={inv.paid_back_amount} rmb={inv.paid_back_amount * rate} lang={lang} />
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">
                            <DualCurrency usd={fee.balance} rmb={fee.balance * rate} lang={lang} />
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
      </div>
    </div>
  );
}

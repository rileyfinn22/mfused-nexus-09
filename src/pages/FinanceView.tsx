import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle } from "lucide-react";
import { calculateFinanceFee, getAgingBadgeVariant, formatRMB } from "@/lib/financeUtils";
import { Toaster } from "@/components/ui/toaster";

export default function FinanceView() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (token) fetchData();
    else setError("无效的链接");
  }, [token]);

  const fetchData = async () => {
    setLoading(true);
    const { data: result, error: err } = await supabase.rpc("get_finance_data_by_token", { p_token: token! });
    if (err || !result || !(result as any).success) {
      setError("链接无效或已过期");
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
            <p className="text-sm text-muted-foreground mt-2">请联系管理员获取新链接</p>
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

  // Convert deposit amounts to RMB using average exchange rate
  const avgRate = invoices.length > 0 ? invoices.reduce((s: number, i: any) => s + (i.exchange_rate || 7.2), 0) / invoices.length : 7.2;

  const totalFinancedRMB = invoices.reduce((s: number, i: any) => s + (i.financed_amount_rmb || 0), 0);
  const totalOutstandingRMB = invoices.filter((i: any) => i.status === "open").reduce((s: number, i: any) => s + ((i.financed_amount - i.paid_back_amount) * (i.exchange_rate || 7.2)), 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Toaster />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">融资跟踪平台</h1>
          {data?.label && <p className="text-muted-foreground mt-1">{data.label}</p>}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">融资总额</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{formatRMB(totalFinancedRMB)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">未偿还金额</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-amber-500">{formatRMB(totalOutstandingRMB)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">应缴保证金 (10%)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{formatRMB(requiredDeposit * avgRate)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">保证金余额</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-green-500">{formatRMB(totalDeposited * avgRate)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              {depositShortfall > 0 && <AlertTriangle className="h-3 w-3 text-destructive" />} 保证金缺口
            </CardTitle></CardHeader>
            <CardContent><p className={`text-2xl font-bold ${depositShortfall > 0 ? "text-destructive" : "text-green-500"}`}>
              {depositShortfall > 0 ? formatRMB(depositShortfall * avgRate) : "—"}
            </p></CardContent>
          </Card>
        </div>

        {/* Invoices Table */}
        <Card>
          <CardHeader><CardTitle>融资发票明细</CardTitle></CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">暂无融资记录</p>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                       <TableHead>采购单号</TableHead>
                       <TableHead>描述</TableHead>
                       <TableHead>发票编号</TableHead>
                       <TableHead>客户</TableHead>
                       <TableHead className="text-right">融资金额 (¥)</TableHead>
                       <TableHead>融资日期</TableHead>
                       <TableHead>账龄</TableHead>
                       <TableHead>费率</TableHead>
                       <TableHead className="text-right">手续费 (¥)</TableHead>
                       <TableHead className="text-right">已还款 (¥)</TableHead>
                       <TableHead className="text-right">余额 (¥)</TableHead>
                       <TableHead>状态</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {invoices.map((inv: any) => {
                       const fee = calculateFinanceFee(inv.financed_amount, inv.financed_date, inv.paid_back_amount);
                       const rate = inv.exchange_rate || 7.2;
                       const statusMap: Record<string, string> = { open: "未还", paid: "已还", overdue: "逾期" };
                       return (
                         <TableRow key={inv.id}>
                           <TableCell className="font-mono text-sm">{inv.vendor_po_number ? `PO #${inv.vendor_po_number}` : "—"}</TableCell>
                           <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{inv.vendor_po_description || "—"}</TableCell>
                           <TableCell className="font-mono text-sm">{inv.invoice_number || "—"}</TableCell>
                           <TableCell>{inv.customer_name || "—"}</TableCell>
                          <TableCell className="text-right">{formatRMB(inv.financed_amount_rmb)}</TableCell>
                          <TableCell>{new Date(inv.financed_date).toLocaleDateString("zh-CN")}</TableCell>
                          <TableCell>
                            <Badge variant={getAgingBadgeVariant(fee.daysAging)}>{fee.daysAging}天</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{fee.feeTier}</TableCell>
                          <TableCell className="text-right">{formatRMB(fee.feeAmount * rate)}</TableCell>
                          <TableCell className="text-right">{formatRMB(inv.paid_back_amount * rate)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatRMB(fee.balance * rate)}</TableCell>
                          <TableCell>
                            <Badge variant={inv.status === "paid" ? "default" : inv.status === "overdue" ? "destructive" : "secondary"}>
                              {statusMap[inv.status] || inv.status}
                            </Badge>
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
      </div>
    </div>
  );
}

import { useState, useEffect, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, AlertTriangle, X, ChevronDown, ChevronRight } from "lucide-react";
import { formatUSD } from "@/lib/financeUtils";
import { DualCurrency } from "@/components/DualCurrency";
import type { FinanceLang } from "@/lib/financeI18n";
import { useFinanceLang } from "@/lib/financeI18n";

interface Props {
  isVibeAdmin: boolean;
  isFinanceUser: boolean;
  lang?: FinanceLang;
}

export function FinanceConfirmationsTab({ isVibeAdmin, isFinanceUser, lang: langProp }: Props) {
  const { t, lang: hookLang } = useFinanceLang();
  const lang = langProp ?? hookLang;

  const [repayments, setRepayments] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState("");
  const [disputeType, setDisputeType] = useState<"repayment" | "deposit">("repayment");
  const [disputeBatch, setDisputeBatch] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [repRes, depRes] = await Promise.all([
      supabase
        .from("finance_repayments")
        .select("*, financed_invoices(id, description, financed_amount, exchange_rate, vendor_pos(po_number, description))")
        .order("payment_date", { ascending: false }),
      supabase
        .from("finance_deposits")
        .select("*")
        .order("payment_date", { ascending: false }),
    ]);
    setRepayments(repRes.data || []);
    setDeposits(depRes.data || []);
    setLoading(false);
  };

  const handleConfirm = async (id: string, table: "finance_repayments" | "finance_deposits") => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from(table)
      .update({
        confirmation_status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: user?.id,
      } as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Error confirming", description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("confirmed") });
      fetchAll();
    }
  };

  // Confirm every pending allocation row in a batch in one click.
  const handleConfirmBatch = async (batchId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const q: any = supabase.from("finance_repayments").update({
      confirmation_status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: user?.id,
    } as any);
    const { error } = await q.eq("payment_batch_id", batchId).eq("confirmation_status", "pending");

    if (error) {
      toast({ title: "Error confirming", description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("confirmed") });
      fetchAll();
    }
  };

  const handleDispute = async () => {
    if (!disputeId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const table = disputeType === "repayment" ? "finance_repayments" : "finance_deposits";
    const patch = {
      confirmation_status: "disputed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: user?.id,
      dispute_note: disputeNote,
    } as any;
    let q: any = supabase.from(table).update(patch);
    q = disputeBatch ? q.eq("payment_batch_id", disputeId) : q.eq("id", disputeId);
    const { error } = await q;

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("disputed") });
      setDisputeId(null);
      setDisputeNote("");
      setDisputeBatch(false);
      fetchAll();
    }
  };

  const statusBadge = (status: string, note?: string) => {
    if (status === "confirmed") return <Badge variant="success" className="text-[10px] px-1.5 py-0 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />{t("confirmed")}</Badge>;
    if (status === "disputed") return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="danger" className="text-[10px] px-1.5 py-0 gap-1"><AlertTriangle className="h-2.5 w-2.5" />{t("disputed")}</Badge>
        {note && <span className="text-[10px] text-destructive max-w-[150px] truncate">{note}</span>}
      </div>
    );
    return <Badge variant="warning" className="text-[10px] px-1.5 py-0 gap-1"><Clock className="h-2.5 w-2.5" />{t("pendingStatus")}</Badge>;
  };

  const sortedRepayments = [...repayments].sort((a, b) => {
    const order: Record<string, number> = { pending: 0, disputed: 1, confirmed: 2 };
    return (order[a.confirmation_status] ?? 0) - (order[b.confirmation_status] ?? 0);
  });

  const sortedDeposits = [...deposits].sort((a, b) => {
    const order: Record<string, number> = { pending: 0, disputed: 1, confirmed: 2 };
    return (order[a.confirmation_status] ?? 0) - (order[b.confirmation_status] ?? 0);
  });

  // Group repayments by batch; unbatched rows become their own singleton groups.
  const repaymentGroups = (() => {
    const map = new Map<string, any[]>();
    for (const r of sortedRepayments) {
      const key = r.payment_batch_id || `single:${r.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const statusOrder: Record<string, number> = { pending: 0, disputed: 1, confirmed: 2 };
    return Array.from(map.entries())
      .map(([key, rows]) => {
        const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
        const statuses = new Set(rows.map((r) => r.confirmation_status));
        const status = statuses.has("disputed") ? "disputed" : statuses.has("pending") ? "pending" : "confirmed";
        return {
          key,
          rows,
          total,
          status,
          batched: !key.startsWith("single:"),
          batchId: key.startsWith("single:") ? null : key,
          reference: rows[0]?.batch_reference || null,
          method: rows[0]?.payment_method || null,
          date: rows[0]?.payment_date,
        };
      })
      .sort((a, b) => (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0));
  })();

  if (loading) return <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>;

  return (
    <div className="space-y-6">
      {/* Repayments Section */}
      <div>
        <h3 className="text-sm font-semibold mb-2">{t("repaymentConfirmations")}</h3>
        <Card>
          <CardContent className="p-0">
            {sortedRepayments.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">{t("noRepayments")}</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-border bg-muted">
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">{t("date")}</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">{t("description")}</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">{t("amount")}</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">{t("method")}</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">{t("reference")}</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground">{t("status")}</th>
                    {isFinanceUser && <th className="px-2 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {repaymentGroups.map((g, idx) => {
                    // Singleton (unbatched legacy row) — render as before.
                    if (!g.batched) {
                      const r = g.rows[0];
                      const fi = r.financed_invoices as any;
                      const desc = fi?.description || fi?.vendor_pos?.description || "—";
                      const rate = fi?.exchange_rate || 7.2;
                      const principal = fi?.financed_amount || 0;
                      const fee = Math.max(0, r.amount - principal);
                      const isFullPayoff = principal > 0 && fee > 0.01 && Math.abs(r.amount - principal * 1.05) < 0.05;
                      return (
                        <tr key={r.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} ${r.confirmation_status === "disputed" ? "bg-destructive/5" : ""}`}>
                          <td className="px-2 py-1.5 whitespace-nowrap">{new Date(r.payment_date + "T00:00:00").toLocaleDateString()}</td>
                          <td className="px-2 py-1.5 max-w-[180px] truncate text-muted-foreground">{desc}</td>
                          <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                            <DualCurrency usd={r.amount} rmb={r.amount * rate} lang={lang} />
                            {isFullPayoff && (
                              <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                                {formatUSD(principal)} + {formatUSD(fee)} {t("fee").toLowerCase()} (5%)
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 capitalize">{r.payment_method || "—"}</td>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.reference_number || "—"}</td>
                          <td className="px-2 py-1.5 text-center">{statusBadge(r.confirmation_status, r.dispute_note)}</td>
                          {isFinanceUser && (
                            <td className="px-2 py-1.5">
                              {r.confirmation_status === "pending" && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-green-600 border-green-600/30 hover:bg-green-500/10" onClick={() => handleConfirm(r.id, "finance_repayments")}>
                                    <CheckCircle2 className="h-3 w-3 mr-1" />{t("confirm")}
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setDisputeId(r.id); setDisputeType("repayment"); setDisputeBatch(false); setDisputeNote(""); }}>
                                    <X className="h-3 w-3 mr-1" />{t("dispute")}
                                  </Button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    }
                    // Batched group — collapsible parent row + child allocations.
                    const isOpen = expanded.has(g.key);
                    return (
                      <Fragment key={g.key}>
                        <tr className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} ${g.status === "disputed" ? "bg-destructive/5" : ""} cursor-pointer hover:bg-muted/70`} onClick={() => toggleExpand(g.key)}>
                          <td className="px-2 py-1.5 whitespace-nowrap">{g.date ? new Date(g.date + "T00:00:00").toLocaleDateString() : "—"}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            <span className="inline-flex items-center gap-1 font-medium text-foreground">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {g.reference || "Batch"}
                            </span>
                            <span className="ml-1 text-[10px] text-muted-foreground">({g.rows.length} {g.rows.length === 1 ? "allocation" : "allocations"})</span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatUSD(g.total)}</td>
                          <td className="px-2 py-1.5 capitalize">{g.method || "—"}</td>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground truncate max-w-[140px]">{g.reference || "—"}</td>
                          <td className="px-2 py-1.5 text-center">{statusBadge(g.status)}</td>
                          {isFinanceUser && (
                            <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                              {g.status === "pending" && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-green-600 border-green-600/30 hover:bg-green-500/10" onClick={() => handleConfirmBatch(g.batchId!)}>
                                    <CheckCircle2 className="h-3 w-3 mr-1" />Confirm batch
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setDisputeId(g.batchId!); setDisputeType("repayment"); setDisputeBatch(true); setDisputeNote(""); }}>
                                    <X className="h-3 w-3 mr-1" />{t("dispute")}
                                  </Button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                        {isOpen && g.rows.map((r: any) => {
                          const fi = r.financed_invoices as any;
                          const desc = fi?.description || fi?.vendor_pos?.description || fi?.vendor_pos?.po_number || "—";
                          const rate = fi?.exchange_rate || 7.2;
                          return (
                            <tr key={r.id} className="border-b border-border/50 bg-muted/20 text-muted-foreground">
                              <td className="px-2 py-1"></td>
                              <td className="px-2 py-1 pl-6 max-w-[200px] truncate">↳ {desc}</td>
                              <td className="px-2 py-1 text-right whitespace-nowrap"><DualCurrency usd={r.amount} rmb={r.amount * rate} lang={lang} /></td>
                              <td className="px-2 py-1 capitalize text-[10px]">{r.payment_method || "—"}</td>
                              <td className="px-2 py-1"></td>
                              <td className="px-2 py-1 text-center">{statusBadge(r.confirmation_status, r.dispute_note)}</td>
                              {isFinanceUser && <td className="px-2 py-1"></td>}
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deposits Section */}
      <div>
        <h3 className="text-sm font-semibold mb-2">{t("depositsSection")}</h3>
        <Card>
          <CardContent className="p-0">
            {sortedDeposits.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">{t("noDepositsConfirm")}</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-border bg-muted">
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">{t("date")}</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">{t("amount")}</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">{t("notes")}</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground">{t("status")}</th>
                    {isFinanceUser && <th className="px-2 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedDeposits.map((d, idx) => (
                    <tr key={d.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} ${d.confirmation_status === "disputed" ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{new Date(d.payment_date.split("T")[0] + "T00:00:00").toLocaleDateString()}</td>
                      <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{formatUSD(d.amount)}</td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[200px] truncate">{d.notes || "—"}</td>
                      <td className="px-2 py-1.5 text-center">{statusBadge(d.confirmation_status, d.dispute_note)}</td>
                      {isFinanceUser && (
                        <td className="px-2 py-1.5">
                          {d.confirmation_status === "pending" && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-green-600 border-green-600/30 hover:bg-green-500/10" onClick={() => handleConfirm(d.id, "finance_deposits")}>
                                <CheckCircle2 className="h-3 w-3 mr-1" />{t("confirm")}
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setDisputeId(d.id); setDisputeType("deposit"); setDisputeNote(""); }}>
                                <X className="h-3 w-3 mr-1" />{t("dispute")}
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dispute Dialog Inline */}
      {disputeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-sm font-semibold">{t("disputeThis")} {disputeType}</h3>
              <p className="text-xs text-muted-foreground">{t("disputeExplain")}</p>
              <Input
                placeholder={t("disputeReason")}
                value={disputeNote}
                onChange={(e) => setDisputeNote(e.target.value)}
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDisputeId(null); setDisputeNote(""); }}>{t("cancel")}</Button>
                <Button variant="destructive" size="sm" onClick={handleDispute} disabled={!disputeNote.trim()}>{t("submitDispute")}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

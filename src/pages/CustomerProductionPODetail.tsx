import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Package } from "lucide-react";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { cn } from "@/lib/utils";

interface SheetRow {
  po_id: string;
  cpo: string | null;
  order_number: string | null;
  description: string | null;
  completion_date: string | null;
  delivery_date: string | null;
  notes: string | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  ship_to_name: string | null;
  ship_to_street: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  invoice_numbers: string[];
}

/** Customer production detail: order info + progress percent only. Vendor
 *  notes, attachments, and shipment documents are vibe-admin-only; customer
 *  packing lists and art files live on the invoice page. */
export default function CustomerProductionPODetail() {
  const { poId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [row, setRow] = useState<SheetRow | null>(null);
  const [percent, setPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const { activeCompanyId } = useActiveCompany();

  useEffect(() => {
    if (!poId || !activeCompanyId) return;
    (async () => {
      try {
        const [{ data: sheet }, { data: detail, error }] = await Promise.all([
          (supabase as any).rpc("customer_production_sheet", { p_company_id: activeCompanyId }),
          (supabase as any).rpc("customer_po_production_detail", { p_po_id: poId }),
        ]);
        if (error || detail?.success === false) throw new Error(error?.message || detail?.error || "Not available");

        setRow(((sheet || []) as SheetRow[]).find((r) => r.po_id === poId) || null);
        setPercent(detail?.production_percent ?? 0);
      } catch (error: any) {
        console.error("Error loading production detail:", error);
        toast({ title: "Failed to load", description: error?.message || "Try again", variant: "destructive" });
        navigate("/production");
      } finally {
        setLoading(false);
      }
    })();
  }, [poId, activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const shipToLines = row
    ? ([
        row.ship_to_name,
        row.ship_to_street,
        [row.ship_to_city, [row.ship_to_state, row.ship_to_zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      ].filter(Boolean) as string[])
    : [];

  return (
    <div className="space-y-6 max-w-4xl">
      <button
        onClick={() => navigate("/production")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to production
      </button>

      {/* Order header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Package className="h-5 w-5 text-muted-foreground" />
                {row?.cpo ? `PO #${row.cpo}` : "Production order"}
              </CardTitle>
              {(row?.invoice_numbers?.length ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  Vibe Invoice: <span className="font-mono text-foreground">{row!.invoice_numbers.join(", ")}</span>
                </p>
              )}
              {row?.description && <p className="text-sm text-muted-foreground mt-0.5">{row.description}</p>}
            </div>
            <div className="text-right text-sm text-muted-foreground">
              {row?.completion_date && <div>Complete: {row.completion_date}</div>}
              {row?.delivery_date && <div>Delivery: {row.delivery_date}</div>}
              {row?.tracking_number && (
                <div>
                  Tracking:{" "}
                  {row.tracking_url ? (
                    <a href={row.tracking_url} target="_blank" rel="noreferrer" className="text-primary hover:underline font-mono">
                      {row.tracking_number}
                    </a>
                  ) : (
                    <span className="font-mono text-foreground">{row.tracking_number}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        {shipToLines.length > 0 && (
          <CardContent className="pt-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Ship To</div>
            <div className="text-sm">
              {shipToLines.map((l, i) => (
                <div key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>{l}</div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Production progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Production progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", percent >= 100 ? "bg-success" : "bg-primary")}
                style={{ width: `${Math.min(100, percent)}%` }}
              />
            </div>
            <div className={cn("text-2xl font-semibold w-20 text-right", percent >= 100 && "text-success")}>
              {percent}%
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

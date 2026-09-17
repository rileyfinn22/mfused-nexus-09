import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { EMAIL_KIND_LABEL, daysBetween, type InvoiceEmailKind } from "@/lib/invoiceEmailLog";
import { formatDocDate } from "@/lib/utils";

interface LogRow {
  id: string;
  email_kind: InvoiceEmailKind;
  recipients: string[];
  subject: string | null;
  sent_by_email: string | null;
  sent_at: string;
  /** 'app' = logged at send time; 'status_history' = inferred from the billed status change. */
  source: string;
}

interface InvoiceSendHistoryProps {
  invoiceId: string;
  /** invoices.first_sent_at, so the header line does not wait for the log to load. */
  firstSentAt?: string | null;
  /** When true, the latest payment date is looked up and "days to pay" is shown. */
  isPaid?: boolean;
  /** Bump to refetch (after a send). */
  refreshToken?: number;
}

/**
 * When this invoice went out and to whom. The first send is the clock start for
 * days-to-pay; later sends (reminders, resends) are listed but do not move it.
 */
export function InvoiceSendHistory({ invoiceId, firstSentAt, isPaid = false, refreshToken = 0 }: InvoiceSendHistoryProps) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [paidAt, setPaidAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data, error }, paid] = await Promise.all([
        supabase
          .from("invoice_email_log")
          .select("id, email_kind, recipients, subject, sent_by_email, sent_at, source")
          .eq("invoice_id", invoiceId)
          .order("sent_at", { ascending: false }),
        isPaid
          ? supabase.from("payments").select("payment_date").eq("invoice_id", invoiceId).order("payment_date", { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (error) console.error("Error loading invoice send history:", error);
      if (!cancelled) {
        setRows((data as LogRow[]) || []);
        setPaidAt((paid.data as { payment_date?: string } | null)?.payment_date ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, refreshToken, isPaid]);

  const first = firstSentAt || (rows.length ? rows[rows.length - 1].sent_at : null);
  const daysToPay = first && paidAt ? daysBetween(first, paidAt) : null;
  const daysOutstanding = first && !paidAt ? daysBetween(first, new Date()) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Sent history
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">First sent</p>
            <p className="font-medium">{first ? formatDocDate(first, "long") : <span className="text-warning">Not sent yet</span>}</p>
          </div>
          {daysToPay !== null && (
            <div>
              <p className="text-xs text-muted-foreground">Days to pay</p>
              <p className="font-medium tabular-nums">{daysToPay}</p>
            </div>
          )}
          {daysOutstanding !== null && (
            <div>
              <p className="text-xs text-muted-foreground">Days outstanding</p>
              <p className="font-medium tabular-nums">{daysOutstanding}</p>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emails recorded for this invoice. Sends are logged from here on.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {rows.map((r) => (
              <div key={r.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{EMAIL_KIND_LABEL[r.email_kind] ?? r.email_kind}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(r.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate" title={r.recipients.join(", ")}>
                  {r.source === "status_history"
                    ? "Inferred from the date the invoice was marked billed; recipients not recorded"
                    : r.recipients.length > 0
                      ? `To ${r.recipients.join(", ")}`
                      : "Recipients not recorded"}
                  {r.sent_by_email ? ` · by ${r.sent_by_email}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default InvoiceSendHistory;

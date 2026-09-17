import { supabase } from "@/integrations/supabase/client";

export type InvoiceEmailKind = "invoice" | "deposit" | "billed_notice" | "payment_due";

export interface LogInvoiceEmailArgs {
  invoiceId: string;
  companyId: string;
  kind: InvoiceEmailKind;
  recipients: string[];
  subject?: string | null;
  senderEmail?: string | null;
  resendMessageId?: string | null;
}

/**
 * Records that an invoice email went out. Called right after the send function reports
 * success; the database trigger updates invoices.first_sent_at / last_sent_at from it.
 * Never throws: a logging failure must not turn a sent email into an error for the user.
 */
export async function logInvoiceEmail(args: LogInvoiceEmailArgs): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("invoice_email_log").insert({
      invoice_id: args.invoiceId,
      company_id: args.companyId,
      email_kind: args.kind,
      recipients: args.recipients,
      subject: args.subject ?? null,
      sent_by: user?.id ?? null,
      sent_by_email: args.senderEmail ?? user?.email ?? null,
      resend_message_id: args.resendMessageId ?? null,
    });
    if (error) console.error("Could not log invoice email:", error);
  } catch (error) {
    console.error("Could not log invoice email:", error);
  }
}

/** Deposit invoices are partial-percentage blankets; everything else is a plain invoice send. */
export function invoiceSendKind(invoice: { billed_percentage?: number | null; invoice_type?: string | null }): InvoiceEmailKind {
  const pct = invoice.billed_percentage;
  const isDeposit = pct != null && pct > 0 && pct < 100 && (invoice.invoice_type === "full" || !invoice.invoice_type || invoice.invoice_type === "deposit");
  return isDeposit ? "deposit" : "invoice";
}

export const EMAIL_KIND_LABEL: Record<InvoiceEmailKind, string> = {
  invoice: "Invoice",
  deposit: "Deposit invoice",
  billed_notice: "Billed notice",
  payment_due: "Payment-due reminder",
};

/** Whole days between two dates, for "days to pay". */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

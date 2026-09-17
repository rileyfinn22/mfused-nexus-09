import { renderEmail, paragraph, paragraphsFromText, detailCard, buttons, escapeHtml } from "../_shared/emailLayout.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Attachment {
  filename: string;
  content: string;
}

interface SendNoticeRequest {
  noticeType: "billed" | "payment_due";
  recipientEmails: string[];
  senderEmail: string;
  invoiceNumber: string;
  dueDate: string;
  totalAmount: number;
  customerName: string;
  portalUrl: string;
  pdfBase64?: string;
  pdfFilename?: string;
  customSubject?: string;
  customBody?: string;
  additionalAttachments?: Attachment[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Send invoice notice function called");

    const {
      noticeType,
      recipientEmails,
      senderEmail,
      invoiceNumber,
      dueDate,
      totalAmount,
      customerName,
      portalUrl,
      pdfBase64,
      pdfFilename,
      customSubject,
      customBody,
      additionalAttachments,
    }: SendNoticeRequest = await req.json();

    if (!recipientEmails || recipientEmails.length === 0) {
      throw new Error("No recipient emails provided");
    }

    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(totalAmount);

    const formattedDueDate = dueDate
      ? new Date(dueDate).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "Upon Receipt";

    const isDue = noticeType !== "billed";
    const subject = customSubject || (isDue
      ? `Payment due — Invoice ${invoiceNumber} (${formattedAmount})`
      : `Invoice ${invoiceNumber} — ${formattedAmount} due ${formattedDueDate}`);

    const bodyMessage = customBody
      ? paragraphsFromText(customBody)
      : isDue
        ? paragraph(`Dear ${escapeHtml(customerName)},`) +
          paragraph(`This is a reminder that invoice <strong>${escapeHtml(invoiceNumber)}</strong> for <strong>${escapeHtml(formattedAmount)}</strong> was due on <strong>${escapeHtml(formattedDueDate)}</strong>.`) +
          paragraph("If payment has already been sent, please disregard this notice. Otherwise, we kindly ask that you arrange payment at your earliest convenience.")
        : paragraph(`Dear ${escapeHtml(customerName)},`) +
          paragraph(`Your order has shipped and invoice <strong>${escapeHtml(invoiceNumber)}</strong> is ready for payment. Per our Net 30 terms, payment is due by <strong>${escapeHtml(formattedDueDate)}</strong>.`) +
          paragraph("You can view the full invoice and make a payment through our portal.");

    const emailHtml = renderEmail({
      documentLabel: isDue ? "PAYMENT DUE" : "INVOICE",
      labelDanger: isDue,
      heading: isDue ? "Payment due" : "Invoice ready for payment",
      title: `Invoice ${invoiceNumber}`,
      bodyHtml:
        bodyMessage +
        detailCard([
          { label: "Invoice number", value: escapeHtml(invoiceNumber), emphasis: true },
          { label: "Due date", value: escapeHtml(formattedDueDate), danger: isDue },
          { label: "Amount due", value: escapeHtml(formattedAmount), emphasis: true, danger: isDue },
        ]) +
        buttons([{ label: isDue ? "Pay now" : "View invoice and pay", url: portalUrl }]),
      contactEmail: senderEmail,
    });
    console.log(`Sending ${noticeType} notice for invoice ${invoiceNumber} to ${recipientEmails.join(", ")}`);

    const internalBccRecipients = [
      "Justin@vibepkg.com",
      "Riley@vibepkg.com",
      "Carrie@vibepkg.com",
    ];

    const fromAddress = noticeType === "billed"
      ? "VibePKG <invoices@vibepkgportal.com>"
      : "VibePKG <invoices@vibepkgportal.com>";

    const attachments: Attachment[] = pdfBase64
      ? [{ filename: pdfFilename || `Invoice-${invoiceNumber}.pdf`, content: pdfBase64 }]
      : [];

    if (additionalAttachments && additionalAttachments.length > 0) {
      for (const attachment of additionalAttachments) {
        attachments.push({
          filename: attachment.filename,
          content: attachment.content,
        });
      }
    }

    const emailResponse = await resend.emails.send({
      from: fromAddress,
      replyTo: senderEmail,
      to: recipientEmails,
      bcc: internalBccRecipients,
      subject,
      html: emailHtml,
      attachments,
    });

    console.log("Resend response:", JSON.stringify(emailResponse));

    if (emailResponse.error) {
      throw new Error(`Resend error: ${JSON.stringify(emailResponse.error)}`);
    }

    console.log("Notice email sent successfully, message ID:", emailResponse.data?.id);

    return new Response(
      JSON.stringify({ success: true, messageId: emailResponse.data?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Error sending notice email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
};

serve(handler);

import { renderEmail, paragraph, paragraphsFromText, detailCard, buttons, escapeHtml } from "../_shared/emailLayout.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Attachment {
  filename: string;
  content: string; // base64 encoded
}

interface SendInvoiceRequest {
  invoiceId: string;
  recipientEmails: string[];
  senderName: string;
  senderEmail: string;
  customMessage?: string;
  pdfBase64: string;
  pdfFilename?: string;
  invoiceNumber: string;
  dueDate: string;
  totalAmount: number;
  customerName: string;
  additionalAttachments?: Attachment[];
  /** Optional overrides so non-invoice documents (e.g. order confirmations)
   *  don't get sent with invoice wording / "Amount Due". */
  subject?: string;
  html?: string;
  /** Masthead label, e.g. "ORDER CONFIRMATION". Defaults to INVOICE; anything else hides
   *  the amount / due date and the portal button. */
  documentLabel?: string;
  /** Plain-text message from the sender, shown as paragraphs above the details. */
  intro?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Send invoice email function called");

    const {
      invoiceId,
      recipientEmails,
      senderName,
      senderEmail,
      customMessage,
      pdfBase64,
      pdfFilename,
      invoiceNumber,
      dueDate,
      totalAmount,
      customerName,
      additionalAttachments,
      subject: subjectOverride,
      html: htmlOverride,
      documentLabel,
      intro: introOverride,
    }: SendInvoiceRequest = await req.json();

    // Validate required fields
    if (!invoiceId || !recipientEmails || recipientEmails.length === 0 || !pdfBase64 || !invoiceNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Sending invoice ${invoiceNumber} to ${recipientEmails.join(", ")}`);

    // Format currency
    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(totalAmount);

    // Format due date
    const formattedDueDate = dueDate
      ? new Date(dueDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "Upon Receipt";

    // Build the email HTML - link directly to the invoice
    // NOTE: Lovable preview URLs require a Lovable login, so never send customers there.
    // Prefer the public portal URL (published site/custom domain).
    const defaultPortalUrl = Deno.env.get("PUBLIC_APP_URL") || "https://vibepkgportal.com";
    const requestOrigin = req.headers.get("origin");

    const isPreviewOrigin = !!requestOrigin && (requestOrigin.includes("lovable.app") || requestOrigin.includes("lovableproject.com"));
    const isLocalOrigin = !!requestOrigin && requestOrigin.includes("localhost");

    const portalUrl = requestOrigin && requestOrigin.startsWith("http") && !isPreviewOrigin && !isLocalOrigin
      ? requestOrigin
      : defaultPortalUrl;

    const invoiceUrl = `${portalUrl}/login?invoice=${invoiceId}&redirect=/invoices/${invoiceId}`;
    const label = (documentLabel || "INVOICE").toUpperCase();
    const isInvoice = label === "INVOICE";
    const introText = customMessage || introOverride;
    const intro = introText
      ? paragraphsFromText(introText)
      : paragraph(isInvoice
          ? "Please find your invoice attached. We appreciate your business."
          : "Please find your order confirmation attached.");
    const emailHtml = renderEmail({
      documentLabel: label,
      title: `${label.charAt(0)}${label.slice(1).toLowerCase()} ${invoiceNumber}`,
      bodyHtml:
        paragraph(`Hello ${escapeHtml(customerName || "there")},`) +
        intro +
        detailCard([
          { label: isInvoice ? "Invoice number" : "Order number", value: escapeHtml(invoiceNumber), emphasis: true },
          ...(isInvoice
            ? [
                { label: "Due date", value: escapeHtml(formattedDueDate) },
                { label: "Amount due", value: escapeHtml(formattedAmount), emphasis: true },
              ]
            : []),
        ]) +
        (isInvoice ? buttons([{ label: "View in the VibePKG portal", url: invoiceUrl }]) : "") +
        paragraph(`The ${isInvoice ? "invoice" : "confirmation"} PDF is attached for your records.`, { muted: true, last: true }),
      contactEmail: senderEmail,
    });
    // Build attachments array - primary PDF + any additional attachments
    const attachments: Attachment[] = [
      {
        filename: pdfFilename || `Invoice-${invoiceNumber}.pdf`,
        content: pdfBase64,
      },
    ];

    // Add any additional attachments
    if (additionalAttachments && additionalAttachments.length > 0) {
      for (const attachment of additionalAttachments) {
        attachments.push({
          filename: attachment.filename,
          content: attachment.content,
        });
      }
    }

    console.log(`Sending email with ${attachments.length} attachment(s)`);

    // Internal team members to BCC on all emails
    const internalBccRecipients = [
      'Justin@vibepkg.com',
      'Riley@vibepkg.com',
      'Carrie@vibepkg.com',
    ];

    // CC the sender so they're on the email thread (e.g. jack@vibepkg.com sending → jack gets cc'd)
    const ccRecipients: string[] = [];
    if (senderEmail && !recipientEmails.map(e => e.toLowerCase()).includes(senderEmail.toLowerCase())) {
      ccRecipients.push(senderEmail);
    }

    // Send the email - use verified domain for sending
    const emailResponse = await resend.emails.send({
      from: `VibePKG <invoices@vibepkgportal.com>`,
      replyTo: senderEmail,
      to: recipientEmails,
      cc: ccRecipients.length > 0 ? ccRecipients : undefined,
      bcc: internalBccRecipients.filter(e => e.toLowerCase() !== (senderEmail || '').toLowerCase()),
      subject: subjectOverride || `Invoice ${invoiceNumber} from VibePKG - ${formattedAmount} Due ${formattedDueDate}`,
      html: htmlOverride || emailHtml,
      attachments,
    });

    console.log("Resend response:", emailResponse);

    // Check if Resend returned an error
    if (emailResponse.error) {
      console.error("Resend error:", emailResponse.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: emailResponse.error.message || "Failed to send email",
          details: emailResponse.error
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("Email sent successfully, message ID:", emailResponse.data?.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: emailResponse.data?.id,
        sentTo: recipientEmails 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-invoice-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

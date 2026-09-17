import { EMAIL, renderEmail, paragraph, paragraphsFromText, detailCard, escapeHtml } from "../_shared/emailLayout.ts";
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
  content: string; // base64 encoded
}

interface CaseStickerEntry {
  orderNumber?: string;
  invoiceNumber?: string;
  customerPO?: string;
}

interface SendVendorPORequest {
  poId: string;
  recipientEmails: string[];
  senderName: string;
  senderEmail: string;
  customMessage?: string;
  pdfBase64: string;
  pdfFilename?: string;
  poNumber: string;
  orderNumbers?: string[];
  orderDate: string;
  expectedDeliveryDate?: string;
  totalAmount: number;
  vendorName: string;
  additionalAttachments?: Attachment[];
  caseStickerInfo?: CaseStickerEntry[];
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Send vendor PO email function called");

    const {
      poId,
      recipientEmails,
      senderName,
      senderEmail,
      customMessage,
      pdfBase64,
      pdfFilename,
      poNumber,
      orderNumbers,
      orderDate,
      expectedDeliveryDate,
      totalAmount,
      vendorName,
      additionalAttachments,
      caseStickerInfo,
    }: SendVendorPORequest = await req.json();

    // Validate required fields
    if (!poId || !recipientEmails || recipientEmails.length === 0 || !pdfBase64 || !poNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Sending PO ${poNumber} to ${recipientEmails.join(", ")}`);

    // Format currency
    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(totalAmount);

    // Format order date
    const formattedOrderDate = orderDate
      ? new Date(orderDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

    // Format expected delivery date if provided
    const formattedDeliveryDate = expectedDeliveryDate
      ? new Date(expectedDeliveryDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    // Case-sticker requirement: a bordered panel in ink, not an amber alert box.
    const stickerRows = caseStickerInfo && caseStickerInfo.length > 0
      ? `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${EMAIL.ink}; border-radius: 6px; margin: 0 0 24px 0;">
          <tr><td style="padding: 16px 20px;">
            <p style="margin: 0 0 4px 0; color: ${EMAIL.ink}; font-size: 13px; font-weight: 700;">Required on case stickers</p>
            <p style="margin: 0 0 12px 0; color: ${EMAIL.body}; font-size: 13px; line-height: 1.5;">Please print the Invoice # and Customer PO # below on the case stickers for this order.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
              <tr>
                <th align="left" style="padding: 6px 8px; color: ${EMAIL.muted}; font-size: 11px; font-weight: 600; border-bottom: 1px solid ${EMAIL.rule};">Order #</th>
                <th align="left" style="padding: 6px 8px; color: ${EMAIL.muted}; font-size: 11px; font-weight: 600; border-bottom: 1px solid ${EMAIL.rule};">Invoice #</th>
                <th align="left" style="padding: 6px 8px; color: ${EMAIL.muted}; font-size: 11px; font-weight: 600; border-bottom: 1px solid ${EMAIL.rule};">Customer PO #</th>
              </tr>
              ${caseStickerInfo.map((e) => `
              <tr>
                <td style="padding: 8px; color: ${EMAIL.ink}; font-size: 14px; font-weight: 600; border-bottom: 1px solid ${EMAIL.rule};">${escapeHtml(e.orderNumber || "—")}</td>
                <td style="padding: 8px; color: ${EMAIL.ink}; font-size: 14px; font-weight: 600; border-bottom: 1px solid ${EMAIL.rule};">${escapeHtml(e.invoiceNumber || "—")}</td>
                <td style="padding: 8px; color: ${EMAIL.ink}; font-size: 14px; font-weight: 600; border-bottom: 1px solid ${EMAIL.rule};">${escapeHtml(e.customerPO || "—")}</td>
              </tr>`).join("")}
            </table>
          </td></tr>
        </table>`
      : "";

    const emailHtml = renderEmail({
      documentLabel: "PURCHASE ORDER",
      title: `PO ${poNumber} from Vibe Packaging`,
      bodyHtml:
        paragraph(`Dear ${escapeHtml(vendorName || "Valued Vendor")},`) +
        (customMessage
          ? paragraphsFromText(customMessage)
          : paragraph("Please find the attached purchase order. Kindly confirm receipt and provide an estimated delivery date.")) +
        detailCard([
          { label: "PO number", value: escapeHtml(poNumber), emphasis: true },
          ...(orderNumbers && orderNumbers.length > 0
            ? [{ label: orderNumbers.length > 1 ? "Order numbers" : "Order number", value: escapeHtml(orderNumbers.join(", ")) }]
            : []),
          { label: "Order date", value: escapeHtml(formattedOrderDate) },
          ...(formattedDeliveryDate ? [{ label: "Expected delivery", value: escapeHtml(formattedDeliveryDate) }] : []),
          { label: "Total", value: escapeHtml(formattedAmount), emphasis: true },
        ]) +
        stickerRows +
        paragraph("The purchase order PDF is attached for your records.", { muted: true, last: true }),
      contactEmail: senderEmail,
    });
    // Build attachments array - primary PDF + any additional attachments
    const attachments: Attachment[] = [
      {
        filename: pdfFilename || `PO-${poNumber}.pdf`,
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

    // Send the email - use verified domain for sending
    // Subject: "PO # From VibePKG" only
    const emailResponse = await resend.emails.send({
      from: `VibePKG <orders@vibepkgportal.com>`,
      replyTo: senderEmail,
      to: recipientEmails,
      bcc: internalBccRecipients,
      subject: orderNumbers && orderNumbers.length > 0
        ? `PO ${poNumber} (Order ${orderNumbers.join(', ')}) From VibePKG`
        : `PO ${poNumber} From VibePKG`,
      html: emailHtml,
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
    console.error("Error in send-vendor-po-email function:", error);
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

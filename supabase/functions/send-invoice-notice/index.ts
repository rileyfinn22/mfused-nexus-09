import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    let subject: string;
    let headline: string;
    let bodyMessage: string;
    let ctaLabel: string;
    let headerColor: string;
    let ctaColor: string;

    if (noticeType === "billed") {
      subject = customSubject || `Invoice ${invoiceNumber} — ${formattedAmount} Due ${formattedDueDate}`;
      headline = "Invoice Ready for Payment";
      bodyMessage = customBody
        ? customBody.split('\n').map(line => `<p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">${line}</p>`).join('')
        : `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          Dear ${customerName},
        </p>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          Your order has shipped and invoice <strong>${invoiceNumber}</strong> is now ready for payment. 
          Per our Net 30 terms, payment is due by <strong>${formattedDueDate}</strong>.
        </p>
        <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          You can view the full invoice and make a payment through our portal.
        </p>
      `;
      ctaLabel = "View Invoice & Pay";
      headerColor = "#2563eb";
      ctaColor = "background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);";
    } else {
      subject = customSubject || `⚠️ Payment Due — Invoice ${invoiceNumber} (${formattedAmount})`;
      headline = "Payment Due Reminder";
      bodyMessage = customBody
        ? customBody.split('\n').map(line => `<p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">${line}</p>`).join('')
        : `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          Dear ${customerName},
        </p>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          This is a friendly reminder that invoice <strong>${invoiceNumber}</strong> for <strong>${formattedAmount}</strong> 
          was due on <strong>${formattedDueDate}</strong>.
        </p>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          If payment has already been sent, please disregard this notice. Otherwise, we kindly ask that you 
          arrange payment at your earliest convenience.
        </p>
        <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          You can view the invoice and make a payment through our secure portal below.
        </p>
      `;
      ctaLabel = "Pay Now";
      headerColor = "#dc2626";
      ctaColor = "background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);";
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.07); overflow: hidden;">
                
                <!-- Header Banner -->
                <tr>
                  <td style="background: ${headerColor}; padding: 32px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">${headline}</h1>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="padding: 40px;">
                    ${bodyMessage}
                    
                    <!-- Invoice Details Card -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 24px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
                                <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Invoice Number</p>
                                <p style="margin: 4px 0 0 0; color: #111827; font-size: 18px; font-weight: 600;">${invoiceNumber}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 16px 0;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                  <tr>
                                    <td width="50%">
                                      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Due Date</p>
                                      <p style="margin: 4px 0 0 0; color: ${noticeType === 'payment_due' ? '#dc2626' : '#111827'}; font-size: 16px; font-weight: ${noticeType === 'payment_due' ? '700' : '500'};">${formattedDueDate}</p>
                                    </td>
                                    <td width="50%" align="right">
                                      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Amount Due</p>
                                      <p style="margin: 4px 0 0 0; color: ${noticeType === 'payment_due' ? '#dc2626' : '#2563eb'}; font-size: 24px; font-weight: 700;">${formattedAmount}</p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- CTA Button -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="padding: 16px 0;">
                          <a href="${portalUrl}" style="display: inline-block; ${ctaColor} color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(0,0,0,0.2);">
                            ${ctaLabel}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 24px 40px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <p style="margin: 0; color: #ef4444; font-size: 12px; font-weight: 600;">
                            ⚠️ Please do not reply to this email — this mailbox is not monitored.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 8px;">
                          <p style="margin: 0; color: #6b7280; font-size: 14px;">
                            Questions? Contact us at 
                            <a href="mailto:${senderEmail}" style="color: #2563eb; text-decoration: none;">${senderEmail}</a>
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 16px;">
                          <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                            © ${new Date().getFullYear()} VibePKG. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    console.log(`Sending ${noticeType} notice for invoice ${invoiceNumber} to ${recipientEmails.join(", ")}`);

    const internalBccRecipients = [
      "Justin@vibepkg.com",
      "Riley@vibepkg.com",
      "Carrie@vibepkg.com",
    ];

    const fromAddress = noticeType === "billed"
      ? "VibePKG <invoices@vibepkgportal.com>"
      : "VibePKG <invoices@vibepkgportal.com>";

    const attachments = pdfBase64
      ? [{ filename: pdfFilename || `Invoice-${invoiceNumber}.pdf`, content: pdfBase64 }]
      : [];

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

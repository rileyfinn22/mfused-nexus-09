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
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice ${invoiceNumber}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f4f4f5;">
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 40px 30px 40px; border-radius: 12px 12px 0 0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">VibePKG</h1>
                          <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">Premium Packaging Solutions</p>
                        </td>
                        <td align="right">
                          <span style="background-color: rgba(255, 255, 255, 0.2); color: #ffffff; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600;">INVOICE</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                      Hello ${customerName || "Valued Customer"},
                    </p>
                    
                    ${customMessage ? `
                    <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                      ${customMessage}
                    </p>
                    ` : `
                    <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                      Please find attached your invoice from VibePKG. We appreciate your business!
                    </p>
                    `}
                    
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
                                      <p style="margin: 4px 0 0 0; color: #111827; font-size: 16px; font-weight: 500;">${formattedDueDate}</p>
                                    </td>
                                    <td width="50%" align="right">
                                      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Amount Due</p>
                                      <p style="margin: 4px 0 0 0; color: #2563eb; font-size: 24px; font-weight: 700;">${formattedAmount}</p>
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
                          <a href="${invoiceUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                            View in VibePKG Portal
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      The invoice PDF is attached to this email for your records.
                    </p>
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

    // Send the email - use verified domain for sending
    const emailResponse = await resend.emails.send({
      from: `VibePKG <invoices@vibepkgportal.com>`,
      replyTo: senderEmail,
      to: recipientEmails,
      bcc: internalBccRecipients,
      subject: `Invoice ${invoiceNumber} from VibePKG - ${formattedAmount} Due ${formattedDueDate}`,
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

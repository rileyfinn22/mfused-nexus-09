import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DeliveryNotificationRequest {
  recipientEmails: string[];
  senderEmail: string;
  orderNumber: string;
  orderDescription: string | null;
  customerName: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  legType: string | null;
  origin: string | null;
  destination: string | null;
  arrivalDate: string | null;
  customSubject?: string;
  customBody?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      recipientEmails,
      senderEmail,
      orderNumber,
      customerName,
      carrier,
      trackingNumber,
      trackingUrl,
      legType,
      origin,
      destination,
      arrivalDate,
      customSubject,
      customBody,
    }: DeliveryNotificationRequest = await req.json();

    if (!recipientEmails || recipientEmails.length === 0) {
      throw new Error("No recipient emails provided");
    }

    const formattedArrival = arrivalDate
      ? new Date(arrivalDate).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "Recently";

    const subject =
      customSubject ||
      `✅ Order ${orderNumber} — Shipment Delivered`;

    const bodyMessage = customBody
      ? customBody
          .split("\n")
          .map(
            (line: string) =>
              `<p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">${line}</p>`
          )
          .join("")
      : `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          Dear ${customerName},
        </p>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          Great news! Your shipment for order <strong>${orderNumber}</strong> has been delivered${arrivalDate ? ` on <strong>${formattedArrival}</strong>` : ""}.
        </p>
        <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          If you have any questions about your delivery, please don't hesitate to reach out.
        </p>
      `;

    // Build tracking section
    let trackingSection = "";
    if (carrier || trackingNumber) {
      trackingSection = `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Order</p>
                    <p style="margin: 4px 0 0 0; color: #111827; font-size: 18px; font-weight: 600;">${orderNumber}</p>
                  </td>
                </tr>
                ${
                  origin || destination
                    ? `<tr>
                  <td style="padding: 12px 0; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Route</p>
                    <p style="margin: 4px 0 0 0; color: #111827; font-size: 14px;">${origin || "—"} → ${destination || "—"}</p>
                  </td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding: 12px 0; border-top: 1px solid #e5e7eb;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        ${
                          carrier
                            ? `<td width="50%">
                          <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Carrier</p>
                          <p style="margin: 4px 0 0 0; color: #111827; font-size: 16px; font-weight: 500;">${carrier}</p>
                        </td>`
                            : ""
                        }
                        <td ${carrier ? 'width="50%" align="right"' : ""}>
                          <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Delivered</p>
                          <p style="margin: 4px 0 0 0; color: #16a34a; font-size: 16px; font-weight: 700;">${formattedArrival}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${
                  trackingNumber
                    ? `<tr>
                  <td style="padding: 12px 0 0 0; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Tracking Number</p>
                    <p style="margin: 4px 0 0 0; color: #111827; font-size: 14px; font-family: monospace;">${
                      trackingUrl
                        ? `<a href="${trackingUrl}" style="color: #2563eb; text-decoration: none;">${trackingNumber}</a>`
                        : trackingNumber
                    }</p>
                  </td>
                </tr>`
                    : ""
                }
              </table>
            </td>
          </tr>
        </table>
      `;
    }

    // Build CTA button if tracking URL available
    const ctaButton = trackingUrl
      ? `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="padding: 16px 0;">
              <a href="${trackingUrl}" style="display: inline-block; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(0,0,0,0.2);">
                View Tracking Details
              </a>
            </td>
          </tr>
        </table>
      `
      : "";

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
                  <td style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 32px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">📦 Shipment Delivered</h1>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="padding: 40px;">
                    ${bodyMessage}
                    ${trackingSection}
                    ${ctaButton}
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

    const internalBccRecipients = [
      "Justin@vibepkg.com",
      "Riley@vibepkg.com",
      "Carrie@vibepkg.com",
    ];

    const emailResponse = await resend.emails.send({
      from: "VibePKG <invoices@vibepkgportal.com>",
      replyTo: senderEmail,
      to: recipientEmails,
      bcc: internalBccRecipients,
      subject,
      html: emailHtml,
    });

    if (emailResponse.error) {
      throw new Error(`Resend error: ${JSON.stringify(emailResponse.error)}`);
    }

    return new Response(
      JSON.stringify({ success: true, messageId: emailResponse.data?.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error sending delivery notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
};

serve(handler);

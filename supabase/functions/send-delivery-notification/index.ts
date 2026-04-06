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
  orderId?: string;
  invoicePdfBase64?: string | null;
  invoiceFileName?: string | null;
}

const LOGO_URL = "https://spxdyqdygsmzyngrqxni.supabase.co/storage/v1/object/public/print-files/demo/vibe-logo-dark.png";
const PORTAL_URL = "https://vibepkgportal.lovable.app";

// Brand colors
const CHARCOAL = "#353d47";
const LIME = "#b8cf68";
const FOREST = "#6a9b40";
const LIGHT_GRAY = "#e8e8e8";
const SLATE = "#48585f";

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      recipientEmails,
      senderEmail,
      orderNumber,
      orderDescription,
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
      orderId,
      invoicePdfBase64,
      invoiceFileName,
    }: DeliveryNotificationRequest = await req.json();

    if (!recipientEmails || recipientEmails.length === 0) {
      throw new Error("No recipient emails provided");
    }

    // Parse date without timezone shift
    let formattedArrival = "Recently";
    if (arrivalDate) {
      const parts = arrivalDate.split("T")[0].split("-").map(Number);
      const localDate = new Date(parts[0], parts[1] - 1, parts[2]);
      formattedArrival = localDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }

    const descPart = orderDescription ? ` — ${orderDescription}` : "";
    const subject =
      customSubject ||
      `Order ${orderNumber}${descPart} — Shipment Delivered`;

    const bodyMessage = customBody
      ? customBody
          .split("\n")
          .map(
            (line: string) =>
              `<p style="margin: 0 0 16px 0; color: ${SLATE}; font-size: 15px; line-height: 1.6;">${line}</p>`
          )
          .join("")
      : `
        <p style="margin: 0 0 16px 0; color: ${SLATE}; font-size: 15px; line-height: 1.6;">
          Dear ${customerName},
        </p>
        <p style="margin: 0 0 16px 0; color: ${SLATE}; font-size: 15px; line-height: 1.6;">
          Great news! Your shipment for order <strong>${orderNumber}</strong> has been delivered${arrivalDate ? ` on <strong>${formattedArrival}</strong>` : ""}.
        </p>
        <p style="margin: 0 0 24px 0; color: ${SLATE}; font-size: 15px; line-height: 1.6;">
          If you have any questions about your delivery, please don't hesitate to reach out.
        </p>
      `;

    // Build tracking section
    let trackingSection = "";
    if (carrier || trackingNumber) {
      trackingSection = `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f7f8f5; border-radius: 8px; margin-bottom: 24px; border: 1px solid ${LIGHT_GRAY};">
          <tr>
            <td style="padding: 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <p style="margin: 0; color: #a2a7af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Order</p>
                    <p style="margin: 4px 0 0 0; color: ${CHARCOAL}; font-size: 18px; font-weight: 700;">${orderNumber}</p>
                  </td>
                </tr>
                ${
                  origin || destination
                    ? `<tr>
                  <td style="padding: 12px 0; border-top: 1px solid ${LIGHT_GRAY};">
                    <p style="margin: 0; color: #a2a7af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Route</p>
                    <p style="margin: 4px 0 0 0; color: ${CHARCOAL}; font-size: 14px;">${origin || "—"} → ${destination || "—"}</p>
                  </td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding: 12px 0; border-top: 1px solid ${LIGHT_GRAY};">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        ${
                          carrier
                            ? `<td width="50%">
                          <p style="margin: 0; color: #a2a7af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Carrier</p>
                          <p style="margin: 4px 0 0 0; color: ${CHARCOAL}; font-size: 16px; font-weight: 600;">${carrier}</p>
                        </td>`
                            : ""
                        }
                        <td ${carrier ? 'width="50%" align="right"' : ""}>
                          <p style="margin: 0; color: #a2a7af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Delivered</p>
                          <p style="margin: 4px 0 0 0; color: ${FOREST}; font-size: 16px; font-weight: 700;">${formattedArrival}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${
                  trackingNumber
                    ? `<tr>
                  <td style="padding: 12px 0 0 0; border-top: 1px solid ${LIGHT_GRAY};">
                    <p style="margin: 0; color: #a2a7af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Tracking Number</p>
                    <p style="margin: 4px 0 0 0; color: ${CHARCOAL}; font-size: 14px; font-family: monospace;">${
                      trackingUrl
                        ? `<a href="${trackingUrl}" style="color: ${FOREST}; text-decoration: none; font-weight: 600;">${trackingNumber}</a>`
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

    // Build CTA buttons — tracking + view order
    let ctaButtons = "";
    const buttons: string[] = [];

    if (trackingUrl) {
      buttons.push(`
        <td align="center" style="padding: 8px 6px;">
          <a href="${trackingUrl}" style="display: inline-block; background-color: ${FOREST}; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 0.3px;">
            View Tracking Details
          </a>
        </td>
      `);
    }

    if (orderId) {
      const orderUrl = `${PORTAL_URL}/orders/${orderId}`;
      buttons.push(`
        <td align="center" style="padding: 8px 6px;">
          <a href="${orderUrl}" style="display: inline-block; background-color: ${CHARCOAL}; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 0.3px;">
            View Order in Portal
          </a>
        </td>
      `);
    }

    if (buttons.length > 0) {
      ctaButtons = `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            ${buttons.join("")}
          </tr>
        </table>
      `;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin: 0; padding: 0; background-color: #f0f1ec; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0f1ec;">
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 12px rgba(53,61,71,0.08); overflow: hidden;">
                
                <!-- Header Banner -->
                <tr>
                  <td style="background-color: ${CHARCOAL}; padding: 28px 40px; text-align: center;">
                    <img src="${LOGO_URL}" alt="Vibe Packaging" width="140" style="display: block; margin: 0 auto 12px auto;" />
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                      <tr>
                        <td style="background-color: ${LIME}; border-radius: 20px; padding: 6px 18px;">
                          <p style="margin: 0; color: ${CHARCOAL}; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">📦 SHIPMENT DELIVERED</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="padding: 36px 40px;">
                    ${bodyMessage}
                    ${trackingSection}
                    ${ctaButtons}
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: ${CHARCOAL}; padding: 24px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <p style="margin: 0; color: #ef4444; font-size: 11px; font-weight: 600;">
                            ⚠️ Please do not reply to this email — this mailbox is not monitored.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 8px;">
                          <p style="margin: 0; color: #a2a7af; font-size: 13px;">
                            Questions? Contact us at 
                            <a href="mailto:${senderEmail}" style="color: ${LIME}; text-decoration: none; font-weight: 600;">${senderEmail}</a>
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 12px; border-top: 1px solid #48585f; margin-top: 12px;">
                          <p style="margin: 8px 0 0 0; color: #67737a; font-size: 11px;">
                            © ${new Date().getFullYear()} Vibe Packaging. All rights reserved.
                          </p>
                          <p style="margin: 2px 0 0 0; color: #67737a; font-size: 11px;">
                            1415 S 700 W, Ste FLEXETC · Salt Lake City, UT 84104
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

    // Build attachments array
    const attachments: { filename: string; content: string }[] = [];
    if (invoicePdfBase64 && invoiceFileName) {
      attachments.push({
        filename: invoiceFileName,
        content: invoicePdfBase64,
      });
    }

    const emailPayload: any = {
      from: "Vibe Packaging <invoices@vibepkgportal.com>",
      replyTo: senderEmail,
      to: recipientEmails,
      bcc: internalBccRecipients,
      subject,
      html: emailHtml,
    };

    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const emailResponse = await resend.emails.send(emailPayload);

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

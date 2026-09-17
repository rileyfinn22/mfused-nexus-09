import { EMAIL, renderEmail, paragraph, paragraphsFromText, detailCard, buttons, escapeHtml } from "../_shared/emailLayout.ts";
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

const PORTAL_URL = "https://vibepkgportal.lovable.app";


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
      ? paragraphsFromText(customBody)
      : paragraph(`Dear ${escapeHtml(customerName)},`) +
        paragraph(`Your shipment for order <strong>${escapeHtml(orderNumber)}</strong> has been delivered${arrivalDate ? ` on <strong>${escapeHtml(formattedArrival)}</strong>` : ""}.`) +
        paragraph("If you have any questions about your delivery, please reach out.");

    const rows = [
      { label: "Order", value: escapeHtml(orderNumber), emphasis: true },
      ...(origin || destination ? [{ label: "Route", value: `${escapeHtml(origin || "—")} → ${escapeHtml(destination || "—")}` }] : []),
      ...(carrier ? [{ label: "Carrier", value: escapeHtml(carrier) }] : []),
      { label: "Delivered", value: escapeHtml(formattedArrival) },
      ...(trackingNumber
        ? [{
            label: "Tracking number",
            value: trackingUrl
              ? `<a href="${escapeHtml(trackingUrl)}" style="color: ${EMAIL.ink};">${escapeHtml(trackingNumber)}</a>`
              : escapeHtml(trackingNumber),
            mono: true,
          }]
        : []),
    ];

    const ctas = [
      ...(trackingUrl ? [{ label: "View tracking", url: trackingUrl, secondary: true }] : []),
      ...(orderId ? [{ label: "View order in portal", url: `${PORTAL_URL}/orders/${orderId}` }] : []),
    ];

    const emailHtml = renderEmail({
      documentLabel: "SHIPMENT DELIVERED",
      title: `Order ${orderNumber} delivered`,
      bodyHtml: bodyMessage + detailCard(rows) + buttons(ctas),
      contactEmail: senderEmail,
    });
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

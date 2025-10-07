import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured. Please add RESEND_API_KEY.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);
    const { packingListPdf, invoiceData, fulfillmentEmail } = await req.json();

    console.log('Sending packing list email to:', fulfillmentEmail);

    const { data, error } = await resend.emails.send({
      from: 'Orders <onboarding@resend.dev>',
      to: [fulfillmentEmail || 'fulfillment@example.com'],
      subject: `Packing List - Order ${invoiceData.invoiceNumber}`,
      html: `
        <h1>New Order - Packing List</h1>
        <p><strong>Invoice Number:</strong> ${invoiceData.invoiceNumber}</p>
        <p><strong>Customer:</strong> ${invoiceData.customerName}</p>
        <p><strong>Destination:</strong> ${invoiceData.state}</p>
        <p><strong>Shipping Address:</strong></p>
        <p>${invoiceData.address}</p>
        <br>
        <p><strong>Items:</strong></p>
        <ul>
          ${invoiceData.items.map((item: any) => `
            <li>${item.sku} - Quantity: ${item.quantity}</li>
          `).join('')}
        </ul>
        <br>
        <p>Please find the packing list attached.</p>
        <p>Best regards,<br>The Team</p>
      `,
      attachments: [
        {
          filename: `packing-list-${invoiceData.invoiceNumber}.pdf`,
          content: packingListPdf.split(',')[1], // Remove data:application/pdf;base64, prefix
        },
      ],
    });

    if (error) {
      console.error('Error sending email:', error);
      throw error;
    }

    console.log('Email sent successfully:', data);

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-packing-list function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

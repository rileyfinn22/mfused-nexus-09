import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple rate limiting map (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // 10 emails per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

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

    const requestBody = await req.json();
    const { packingListPdf, invoiceData, fulfillmentEmail } = requestBody;
    
    // Input validation
    if (!packingListPdf || !invoiceData || !fulfillmentEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: packingListPdf, invoiceData, or fulfillmentEmail' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fulfillmentEmail)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate PDF size (base64 data URL)
    const pdfData = packingListPdf.split(',')[1] || packingListPdf;
    const pdfSizeBytes = (pdfData.length * 3) / 4; // Approximate decoded size
    const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
    
    if (pdfSizeBytes > MAX_PDF_SIZE) {
      return new Response(
        JSON.stringify({ error: 'PDF file too large. Maximum size is 10MB' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Rate limiting by email
    if (!checkRateLimit(fulfillmentEmail)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Maximum 10 emails per minute.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);

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
            <li>${item.itemId ? `${item.itemId} - ` : ''}${item.sku} - Quantity: ${item.quantity}</li>
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

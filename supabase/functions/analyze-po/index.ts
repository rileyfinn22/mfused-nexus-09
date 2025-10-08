import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { pdfPath, companyId, userId, filename } = await req.json();
    console.log('Analyzing PO from path:', pdfPath);

    // Download PDF from storage
    console.log('Downloading PDF from storage...');
    const { data: pdfBlob, error: downloadError } = await supabase
      .storage
      .from('po-documents')
      .download(pdfPath);

    if (downloadError) {
      console.error('Download error:', JSON.stringify(downloadError, null, 2));
      throw new Error(`Failed to download PDF: ${downloadError.message || 'Unknown error'}`);
    }
    
    if (!pdfBlob) {
      throw new Error('No PDF data received');
    }
    
    console.log('PDF downloaded, size:', pdfBlob.size);
    
    // Convert to base64 and extract text using third-party API
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfArrayBuffer)));
    
    // Use pdf.js via CDN to extract text
    console.log('Extracting text from PDF...');
    const pdfParseResponse = await fetch('https://api.pdf.co/v1/pdf/convert/to/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'demo' // Using demo key - in production, you'd need a real API key
      },
      body: JSON.stringify({
        url: `data:application/pdf;base64,${pdfBase64.substring(0, 50000)}`, // Limit size for demo
        inline: true
      })
    });

    let extractedText = '';
    if (pdfParseResponse.ok) {
      const parseData = await pdfParseResponse.json();
      extractedText = parseData.body || '';
      console.log('Extracted text length:', extractedText.length);
    } else {
      console.log('PDF parsing service failed, using fallback');
      extractedText = `Purchase order document: ${filename}`;
    }

    // Analyze with Lovable AI
    console.log('Sending to AI for analysis...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: `You are a purchase order data extraction expert. Carefully analyze this PO text and extract ALL line items with their details.

CRITICAL: Look for tables, line items, product lists. Each item MUST have:
- sku/item code (look for: Item#, SKU, Code, Part#)
- name/description (the product name or description)
- quantity (look for: Qty, Quantity, QTY, Amount)
- unit_price (look for: Price, Unit Price, Rate, Cost per unit)

Also extract:
- po_number: The PO# or purchase order number
- customer_name: Vendor or company name at top
- customer_email: Email address if present
- customer_phone: Phone number if present
- shipping_name: Ship To name
- shipping_street: Ship To street address
- shipping_city: Ship To city
- shipping_state: Ship To state (2-letter code)
- shipping_zip: Ship To zip code
- billing_name: Bill To name (or same as shipping)
- billing_street: Bill To street
- billing_city: Bill To city
- billing_state: Bill To state
- billing_zip: Bill To zip
- due_date: Due date in YYYY-MM-DD format
- memo: Any special notes or terms

PAY SPECIAL ATTENTION to extracting ALL items from tables or line item sections. Look for patterns like:
- Item Code | Description | Qty | Price
- SKU / Product Name / Quantity / Unit Price
- Multiple rows of similar data

PO Text:
${extractedText}

Return ONLY valid JSON. If you cannot find certain fields, use null. But you MUST extract all line items you find.`
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('Failed to analyze with AI');
    }

    const aiData = await aiResponse.json();
    const extractedData = JSON.parse(aiData.choices[0].message.content);
    console.log('Extracted data:', extractedData);

    // Generate order number
    const orderNumber = `ORD-${Date.now()}`;

    // Calculate totals
    let subtotal = 0;
    if (extractedData.items && Array.isArray(extractedData.items)) {
      subtotal = extractedData.items.reduce((sum: number, item: any) => {
        return sum + ((item.quantity || 0) * (item.unit_price || 0));
      }, 0);
    }
    const tax = subtotal * 0.06;
    const total = subtotal + tax;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        company_id: companyId,
        order_number: orderNumber,
        po_number: extractedData.po_number || null,
        customer_name: extractedData.customer_name || 'Unknown Customer',
        customer_email: extractedData.customer_email || null,
        customer_phone: extractedData.customer_phone || null,
        shipping_name: extractedData.shipping_name || extractedData.customer_name || 'Unknown',
        shipping_street: extractedData.shipping_street || '',
        shipping_city: extractedData.shipping_city || '',
        shipping_state: extractedData.shipping_state || '',
        shipping_zip: extractedData.shipping_zip || '',
        billing_name: extractedData.billing_name || extractedData.customer_name,
        billing_street: extractedData.billing_street || extractedData.shipping_street,
        billing_city: extractedData.billing_city || extractedData.shipping_city,
        billing_state: extractedData.billing_state || extractedData.shipping_state,
        billing_zip: extractedData.billing_zip || extractedData.shipping_zip,
        due_date: extractedData.due_date || null,
        memo: extractedData.memo || `Order from PO: ${filename}`,
        subtotal,
        tax,
        total,
        status: 'pending',
        terms: 'Net 30'
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      throw new Error('Failed to create order');
    }

    // Create order items
    if (extractedData.items && Array.isArray(extractedData.items)) {
      const orderItems = extractedData.items.map((item: any) => ({
        order_id: order.id,
        product_id: null,
        sku: item.sku || 'UNKNOWN',
        name: item.name || item.description || 'Unknown Item',
        description: item.description || null,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total: (item.quantity || 1) * (item.unit_price || 0),
        item_id: item.sku || null
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('Error creating order items:', itemsError);
      }
    }

    console.log('Order created:', order.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        orderId: order.id,
        orderNumber: orderNumber,
        extractedData 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

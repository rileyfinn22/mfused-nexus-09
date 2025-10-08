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
    
    // Convert to array buffer for PDF parsing
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    
    // Use pdf-parse library to extract text
    console.log('Extracting text from PDF with pdf-parse...');
    
    // Import pdf-parse for Deno
    const pdfParse = (await import('npm:pdf-parse@1.1.1')).default;
    
    let extractedText = '';
    try {
      const pdfData = await pdfParse(new Uint8Array(pdfArrayBuffer));
      extractedText = pdfData.text;
      console.log('Successfully extracted text, length:', extractedText.length);
      console.log('First 500 chars:', extractedText.substring(0, 500));
    } catch (parseError) {
      console.error('PDF parse error:', parseError);
      extractedText = `Failed to parse PDF: ${filename}. Please enter data manually.`;
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
            role: 'system',
            content: 'You are an expert at analyzing purchase orders. Use reasoning to understand document structure.'
          },
          {
            role: 'user',
            content: `CRITICAL: Purchase orders often have MISLEADING column headers. You must reason about what data is actually in each column.

COMMON PATTERN TO LOOK FOR:
- A column labeled "Description" often contains SKU/product codes (like "PCK-00430-WABAG")
- A column labeled "Item" or "Item #" often contains item numbers or IDs
- The actual product name/description might be in a different column or combined
- "PO #" or "Purchase Order #" is the PO number
- "Expected Date", "Due Date", or "Delivery Date" is the due date

ANALYSIS INSTRUCTIONS:

1. IDENTIFY COLUMNS by looking at the actual data patterns, NOT just headers:
   - SKU column: Contains alphanumeric codes (e.g., "PCK-00430-WABAG", "SDA10065")
   - Product name: Contains full descriptive text about the product
   - Quantity: Contains numeric values for quantities
   - Unit price: Contains decimal prices (e.g., 0.218, 23.51)

2. EXTRACT DATA:
For each line item:
- sku: The SKU/product code (often in "Description" column!)
- name: The full product name (might be in "Item" or separate column)
- quantity: Numeric quantity
- unit_price: Price per unit

For order info:
- po_number: Look for "PO #", "Purchase Order #", "PO Number"
- due_date: Look for "Expected Date", "Due Date", "Delivery Date" - convert to YYYY-MM-DD
- customer_name: Vendor or company name
- shipping_name, shipping_street, shipping_city, shipping_state, shipping_zip: Ship To address
- billing info if separate from shipping

PURCHASE ORDER TEXT:
${extractedText}

IMPORTANT: 
- If "Description" contains codes like "PCK-00430-WABAG", that's the SKU
- If "Item" contains product names, that's the name
- Extract ALL line items from the table

Return ONLY valid JSON:
{
  "po_number": "...",
  "customer_name": "...",
  "customer_email": null,
  "customer_phone": null,
  "shipping_name": "...",
  "shipping_street": "...",
  "shipping_city": "...",
  "shipping_state": "XX",
  "shipping_zip": "...",
  "billing_name": null,
  "billing_street": null,
  "billing_city": null,
  "billing_state": null,
  "billing_zip": null,
  "due_date": "YYYY-MM-DD",
  "memo": null,
  "items": [
    {"sku": "...", "name": "...", "description": null, "quantity": 0, "unit_price": 0.0}
  ]
}`
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
        status: 'draft',
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

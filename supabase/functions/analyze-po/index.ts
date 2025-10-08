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

1. IDENTIFY COLUMNS - The PO typically has these columns:
   - "Description" or similar: Contains the SKU/product code (e.g., "PCK-00430-WABAG")
   - "Item" or "Item #": Contains the Item ID that matches your product catalog
   - Product name/description: The full product name
   - "Qty" or "Quantity": Numeric quantities
   - "Rate" or "Unit Price": Decimal prices

2. EXTRACT DATA:
For each line item, you MUST extract:
- sku: The SKU from the Description column (e.g., "PCK-00430-WABAG")
- item_id: The Item ID from the Item/Item# column - THIS IS CRITICAL FOR MATCHING
- name: The full product name
- quantity: Numeric quantity
- unit_price: Price per unit

Example:
If the row shows:
Description: PCK-00430-WABAG | Item: BAG - E2.5 - 1g - Super Fog - Twisted - Apple Ambush - Hyb | Qty: 3000 | Rate: 0.218

Extract as:
{
  "sku": "PCK-00430-WABAG",
  "item_id": "BAG - E2.5 - 1g - Super Fog - Twisted - Apple Ambush - Hyb",
  "name": "E2.5 - 1g - Super Fog - Twisted - Apple Ambush - Hyb",
  "quantity": 3000,
  "unit_price": 0.218
}

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
    {"sku": "...", "item_id": "...", "name": "...", "description": null, "quantity": 0, "unit_price": 0.0}
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

    // Fetch products to try matching SKUs and names
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, item_id, name')
      .eq('company_id', companyId);

    if (productsError) {
      console.error('Error fetching products:', productsError);
    }

    console.log(`Found ${products?.length || 0} products for matching`);

    // Function to find matching product by item_id
    const findMatchingProduct = (poItem: any) => {
      if (!products || products.length === 0) return null;

      // Helper to normalize item_id by removing common suffixes
      const normalizeItemId = (id: string): string => {
        if (!id) return '';
        // Remove "BAG" suffix if present (e.g., "PCK-00430-WABAG" -> "PCK-00430-WA")
        let normalized = id.replace(/BAG$/i, '');
        // If ends with state code like "-WA", extract just the base (e.g., "PCK-00430-WA" -> "PCK-00430")
        const stateMatch = normalized.match(/^(.+?)-(WA|CA|OR|CO|NV|AZ|FL|TX|NY)$/i);
        if (stateMatch) {
          return stateMatch[1]; // Return just the base part
        }
        return normalized;
      };

      // Try exact match first
      if (poItem.item_id) {
        const match = products.find(p => p.item_id === poItem.item_id);
        if (match) {
          console.log(`Exact match item_id "${poItem.item_id}" to product: ${match.name}`);
          return match.id;
        }
      }

      // Try normalized match on item_id
      if (poItem.item_id) {
        const normalizedPoId = normalizeItemId(poItem.item_id);
        console.log(`Trying normalized item_id: "${normalizedPoId}" from "${poItem.item_id}"`);
        
        const match = products.find(p => {
          const normalizedProductId = normalizeItemId(p.item_id || '');
          return normalizedProductId === normalizedPoId;
        });
        
        if (match) {
          console.log(`Normalized match "${normalizedPoId}" to product: ${match.name}`);
          return match.id;
        }
      }

      // Try matching by SKU
      if (poItem.sku) {
        const normalizedSku = normalizeItemId(poItem.sku);
        const match = products.find(p => {
          const normalizedProductId = normalizeItemId(p.item_id || '');
          return normalizedProductId === normalizedSku;
        });
        
        if (match) {
          console.log(`Matched SKU "${poItem.sku}" (normalized: "${normalizedSku}") to product: ${match.name}`);
          return match.id;
        }
      }

      console.log(`No match found for item_id: "${poItem.item_id}", sku: "${poItem.sku}"`);
      return null;
    };

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

    // Create order items with product matching
    if (extractedData.items && Array.isArray(extractedData.items)) {
      const orderItems = extractedData.items.map((item: any) => {
        const matchedProductId = findMatchingProduct(item);
        
        // ALWAYS use PO unit_price, never pull from product cost
        const unitPrice = item.unit_price || 0;
        const quantity = item.quantity || 1;
        
        return {
          order_id: order.id,
          product_id: matchedProductId, // Will be null if no match found
          sku: item.sku || 'UNKNOWN',
          name: item.name || item.description || 'Unknown Item',
          description: item.description || null,
          quantity: quantity,
          unit_price: unitPrice, // PO price overrides product cost
          total: quantity * unitPrice,
          item_id: item.sku || null
        };
      });

      console.log(`Creating ${orderItems.length} order items, ${orderItems.filter(i => i.product_id).length} matched to products`);
      console.log('Using PO unit prices, not product costs');

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

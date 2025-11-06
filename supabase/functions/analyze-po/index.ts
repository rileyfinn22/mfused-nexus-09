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
    // Extract and verify JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Create client with user's JWT for authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized: Invalid token');
    }

    // Create service client for operations that need elevated privileges
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { pdfPath, companyId, filename, orderType = 'pull_ship' } = await req.json();
    
    console.log(`Processing PO for company_id: ${companyId}`);
    
    // Validate user has access to this company
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      throw new Error('Unauthorized: No user role found');
    }

    console.log(`User role: ${userRole.role}, User's company: ${userRole.company_id}`);

    // Vibe admins have access to all companies, others must match company_id
    if (userRole.role !== 'vibe_admin' && userRole.company_id !== companyId) {
      throw new Error('Unauthorized: User does not have access to this company');
    }
    console.log('Analyzing PO from path:', pdfPath, 'for order type:', orderType);

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
            content: `You are an expert at analyzing purchase orders. Extract data carefully from the table structure.

ANALYSIS INSTRUCTIONS:

1. IDENTIFY THE TABLE STRUCTURE:
Look at the column headers in the purchase order table. Common headers include:
- Item/Item #/SKU: Usually contains the product code
- Description: Product name or details
- Qty/Quantity: Numeric quantities
- Rate/Unit Price/Price: The price per unit (THIS IS CRITICAL - extract as a decimal number)
- Amount/Total: Total for that line

2. FOR EACH LINE ITEM, EXTRACT:
- item_id: The product code from the Item/SKU column (e.g., "PCK-00430-WA")
- sku: Also use the product code
- name: The product description/name
- quantity: The numeric quantity
- unit_price: The rate/price per unit - MUST be a decimal number (e.g., 0.218, not "$0.218")

EXAMPLE:
If you see:
Item: PCK-00430-WABAG
Description: BAG - E2.5 - 1g - Super Fog - Twisted - Apple Ambush - Hyb
Qty: 3000
Rate: $0.218

Extract as:
{
  "item_id": "PCK-00430-WABAG",
  "sku": "PCK-00430-WABAG",
  "name": "BAG - E2.5 - 1g - Super Fog - Twisted - Apple Ambush - Hyb",
  "quantity": 3000,
  "unit_price": 0.218
}

3. FOR ORDER INFO:
- po_number: Look for "PO #", "Order #"
- due_date: Look for "Due Date", "Expected Date" - format as YYYY-MM-DD
- customer_name: Vendor name
- shipping address: Ship To section

PURCHASE ORDER TEXT:
${extractedText}

CRITICAL: unit_price MUST be a number (0.218), NOT a string or formatted currency ("$0.218")

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
    console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
    
    // Log first few items with prices
    if (extractedData.items && extractedData.items.length > 0) {
      console.log('First item details:', JSON.stringify(extractedData.items[0], null, 2));
      console.log('Unit price type:', typeof extractedData.items[0].unit_price);
      console.log('Unit price value:', extractedData.items[0].unit_price);
    }

    // Fetch products to try matching SKUs and names
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, item_id, name')
      .eq('company_id', companyId);

    if (productsError) {
      console.error('Error fetching products:', productsError);
    }

    console.log(`Found ${products?.length || 0} products for matching`);
    if (products && products.length > 0) {
      console.log('Sample products:', JSON.stringify(products.slice(0, 3), null, 2));
    }

    // Function to find matching product by item_id
    const findMatchingProduct = (poItem: any) => {
      if (!products || products.length === 0) {
        console.log('No products available for matching');
        return null;
      }

      console.log(`\nAttempting to match PO item:`, JSON.stringify({
        item_id: poItem.item_id,
        sku: poItem.sku,
        name: poItem.name
      }, null, 2));

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

      // Try exact match on item_id first
      if (poItem.item_id) {
        const match = products.find(p => p.item_id === poItem.item_id);
        if (match) {
          console.log(`✓ Exact item_id match: "${poItem.item_id}" -> product: ${match.name}`);
          return match.id;
        }
      }

      // Try exact match on SKU
      if (poItem.sku && poItem.sku !== poItem.item_id) {
        const match = products.find(p => p.item_id === poItem.sku);
        if (match) {
          console.log(`✓ Exact SKU match: "${poItem.sku}" -> product: ${match.name}`);
          return match.id;
        }
      }

      // Try normalized match on item_id
      if (poItem.item_id) {
        const normalizedPoId = normalizeItemId(poItem.item_id);
        console.log(`  Trying normalized item_id: "${normalizedPoId}" (from "${poItem.item_id}")`);
        
        const match = products.find(p => {
          const normalizedProductId = normalizeItemId(p.item_id || '');
          const matches = normalizedProductId === normalizedPoId;
          if (matches) {
            console.log(`  Comparing with product item_id: "${p.item_id}" (normalized: "${normalizedProductId}")`);
          }
          return matches;
        });
        
        if (match) {
          console.log(`✓ Normalized item_id match: "${normalizedPoId}" -> product: ${match.name}`);
          return match.id;
        }
      }

      // Try matching by SKU with normalization
      if (poItem.sku && poItem.sku !== poItem.item_id) {
        const normalizedSku = normalizeItemId(poItem.sku);
        console.log(`  Trying normalized SKU: "${normalizedSku}" (from "${poItem.sku}")`);
        
        const match = products.find(p => {
          const normalizedProductId = normalizeItemId(p.item_id || '');
          return normalizedProductId === normalizedSku;
        });
        
        if (match) {
          console.log(`✓ Normalized SKU match: "${normalizedSku}" -> product: ${match.name}`);
          return match.id;
        }
      }

      // Try fuzzy name matching as last resort
      if (poItem.name) {
        const poNameLower = poItem.name.toLowerCase().trim();
        const match = products.find(p => {
          const productNameLower = (p.name || '').toLowerCase().trim();
          // Check if names are very similar (at least 80% of words match)
          const poWords = new Set(poNameLower.split(/\s+/));
          const productWords = productNameLower.split(/\s+/);
          const matchingWords = productWords.filter(w => poWords.has(w)).length;
          const similarity = matchingWords / Math.max(poWords.size, productWords.length);
          return similarity >= 0.8;
        });
        
        if (match) {
          console.log(`✓ Name similarity match: "${poItem.name}" -> product: ${match.name}`);
          return match.id;
        }
      }

      console.log(`✗ No match found for: item_id="${poItem.item_id}", sku="${poItem.sku}", name="${poItem.name}"`);
      return null;
    };

    // Generate order number
    const orderNumber = `ORD-${Date.now()}`;

    // Calculate totals - no tax for pull_ship orders
    let subtotal = 0;
    if (extractedData.items && Array.isArray(extractedData.items)) {
      subtotal = extractedData.items.reduce((sum: number, item: any) => {
        return sum + ((item.quantity || 0) * (item.unit_price || 0));
      }, 0);
    }
    const tax = 0; // No tax on pull & ship orders
    const total = subtotal;

    // Create order with the specified order_type
    const orderStatus = orderType === 'pull_ship' ? 'pending_pull' : 'draft';
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        company_id: companyId,
        order_number: orderNumber,
        order_type: orderType,
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
        memo: extractedData.memo || `Pull & Ship order from PO: ${filename}`,
        subtotal,
        tax,
        total,
        status: orderStatus,
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
        
        console.log(`Item "${item.name}": unit_price=${item.unit_price}, type=${typeof item.unit_price}`);
        
        return {
          order_id: order.id,
          product_id: matchedProductId, // Will be null if no match found
          sku: item.sku || 'UNKNOWN',
          name: item.name || item.description || 'Unknown Item',
          description: item.description || null,
          quantity: quantity,
          unit_price: unitPrice, // PO price overrides product cost
          total: quantity * unitPrice,
          shipped_quantity: 0, // Initialize as 0 for new orders
          item_id: item.sku || null
        };
      });

      console.log(`Creating ${orderItems.length} order items, ${orderItems.filter(i => i.product_id).length} matched to products`);
      console.log('Sample order item:', JSON.stringify(orderItems[0], null, 2));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('Error creating order items:', itemsError);
        // Clean up the order since items failed
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error(`Failed to create order items: ${itemsError.message}`);
      }
      
      if (orderItems.length === 0) {
        console.warn('No items extracted from PO');
        // Clean up the order
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error('No items could be extracted from the PO. Please check the document format and try again, or create the order manually.');
      }
      
      console.log(`Successfully created ${orderItems.length} order items`);
    } else {
      console.error('No items array in extracted data');
      // Clean up the order
      await supabase.from('orders').delete().eq('id', order.id);
      throw new Error('No items found in the PO. Please verify the document format.');
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

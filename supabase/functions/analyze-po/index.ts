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
- Item/Item #/SKU/Product Code: Contains the SKU NUMBER (alphanumeric code)
- Description/Product Name/Item Name: Contains the PRODUCT NAME (text description)
- Qty/Quantity: Numeric quantities
- Rate/Unit Price/Price: The price per unit (THIS IS CRITICAL - extract as a decimal number)
- Amount/Total: Total for that line

2. FOR EACH LINE ITEM, EXTRACT:
- sku: The SKU NUMBER from the Item/SKU/Product Code column (e.g., "PCK-00430-WA" or "12345")
- item_id: Same as sku
- name: The PRODUCT NAME from the Description/Product Name column (e.g., "BAG - E2.5 - 1g - Super Fog - Twisted - Apple Ambush - Hyb")
- quantity: The numeric quantity
- unit_price: The rate/price per unit - MUST be a decimal number (e.g., 0.218, not "$0.218")

IMPORTANT MATCHING RULES:
- sku/item_id = The SKU CODE/NUMBER (will match to product's item_id in database)
- name = The PRODUCT NAME/DESCRIPTION (will match to product's name in database)
- These are often in SEPARATE columns in the PO table

EXAMPLE:
If you see a table row like:
SKU: PCK-00430-WA
Description: BAG - E2.5 - 1g - Super Fog - Twisted - Apple Ambush - Hyb
Qty: 3000
Rate: $0.218

Extract as:
{
  "item_id": "PCK-00430-WA",
  "sku": "PCK-00430-WA",
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
    
    // Strip markdown code blocks if present
    let content = aiData.choices[0].message.content;
    console.log('Raw AI response:', content.substring(0, 200));
    
    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    content = content.replace(/^```(?:json)?\s*\n/m, '').replace(/\n```\s*$/m, '');
    
    const extractedData = JSON.parse(content);
    console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
    
    // Log first few items with prices
    if (extractedData.items && extractedData.items.length > 0) {
      console.log('First item details:', JSON.stringify(extractedData.items[0], null, 2));
      console.log('Unit price type:', typeof extractedData.items[0].unit_price);
      console.log('Unit price value:', extractedData.items[0].unit_price);
    }

    // Fetch products to try matching SKUs and names (include customer_id for customer-specific SKU matching)
    console.log(`\n========== FETCHING PRODUCTS ==========`);
    console.log(`Querying products with company_id: ${companyId}`);
    
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, item_id, name, description, customer_id, preferred_vendor_id, cost')
      .eq('company_id', companyId);

    if (productsError) {
      console.error('Error fetching products:', productsError);
    }

    console.log(`Found ${products?.length || 0} products for matching`);

    // Get customer info from extracted data for customer-specific matching
    const customerName = extractedData.customer_name;
    let customerId: string | null = null;
    
    if (customerName) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('company_id', companyId)
        .ilike('name', customerName)
        .maybeSingle();
      
      if (customer) {
        customerId = customer.id;
        console.log(`Found customer ID: ${customerId} for customer: ${customerName}`);
      }
    }

    // Function to find matching product by item_id with improved matching
    // Returns the full product object (not just ID) so we can access vendor_id, cost, etc.
    const findMatchingProduct = (poItem: any) => {
      if (!products || products.length === 0) {
        console.log('No products available for matching');
        return null;
      }

      console.log(`\n========== MATCHING ATTEMPT ==========`);
      console.log(`PO Item Details:`, JSON.stringify({
        item_id: poItem.item_id,
        sku: poItem.sku,
        name: poItem.name,
        customer_id: customerId
      }, null, 2));
      console.log(`Total products in database: ${products.length}`);
      console.log(`First 5 product item_ids:`, products.slice(0, 5).map(p => p.item_id));

      // Helper to normalize strings for better matching
      const normalize = (str: string): string => {
        if (!str) return '';
        return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      };

      // Helper to extract base SKU (remove suffixes like BAG, state codes, etc)
      const extractBaseSku = (id: string): string => {
        if (!id) return '';
        let cleaned = id.toUpperCase().trim();
        // Remove common suffixes
        cleaned = cleaned.replace(/BAG$/i, '').replace(/PKG$/i, '');
        // Remove state codes at the end
        cleaned = cleaned.replace(/-(WA|CA|OR|CO|NV|AZ|FL|TX|NY|MI|IL|MA|PA|OH|NC|GA|VA|MD|WI|MN|MO|TN|IN|SC|AL|LA|KY|OK|CT|UT|IA|NE|KS|NM|WV|ID|HI|ME|NH|RI|MT|DE|SD|ND|AK|VT|WY)$/i, '');
        return cleaned;
      };

      const poItemId = poItem.item_id || '';
      const poSku = poItem.sku || '';
      const poName = poItem.name || '';

      // PRIORITY 1: Try customer-specific SKU match first (if customer found)
      if (customerId && poItemId) {
        const match = products.find(p => 
          p.customer_id === customerId &&
          p.item_id && 
          p.item_id.toLowerCase().trim() === poItemId.toLowerCase().trim()
        );
        if (match) {
          console.log(`✓ Customer-specific SKU match: "${poItemId}" for customer ${customerId} -> product: ${match.name}`);
          return match;
        }
      }

      // Try exact match on item_id (case insensitive)
      if (poItemId) {
        console.log(`\n[STEP 2] Trying exact item_id match for: "${poItemId}"`);
        const match = products.find(p => {
          const matches = p.item_id && p.item_id.toLowerCase().trim() === poItemId.toLowerCase().trim();
          if (p.item_id && p.item_id.toLowerCase().includes('pck-00046')) {
            console.log(`  Checking product: "${p.item_id}" vs "${poItemId}" = ${matches}`);
          }
          return matches;
        });
        if (match) {
          console.log(`✓ EXACT MATCH FOUND: "${poItemId}" -> product: ${match.name} (item_id: ${match.item_id})`);
          return match;
        }
        console.log(`✗ No exact item_id match found for: "${poItemId}"`);
      }

      // Try exact match on SKU (case insensitive)
      if (poSku && poSku !== poItemId) {
        const match = products.find(p => 
          p.item_id && p.item_id.toLowerCase().trim() === poSku.toLowerCase().trim()
        );
        if (match) {
          console.log(`✓ Exact SKU match: "${poSku}" -> product: ${match.name}`);
          return match;
        }
      }

      // Try normalized alphanumeric match
      if (poItemId) {
        console.log(`\n[STEP 4] Trying normalized match for: "${poItemId}"`);
        const normalizedPoId = normalize(poItemId);
        console.log(`  Normalized PO ID: "${normalizedPoId}"`);
        const match = products.find(p => {
          if (!p.item_id) return false;
          const normalizedProductId = normalize(p.item_id);
          const matches = normalizedProductId === normalizedPoId;
          if (p.item_id && p.item_id.toLowerCase().includes('pck-00046')) {
            console.log(`  Checking product: "${p.item_id}" (normalized: "${normalizedProductId}") vs "${normalizedPoId}" = ${matches}`);
          }
          return matches;
        });
        if (match) {
          console.log(`✓ NORMALIZED MATCH FOUND: "${poItemId}" -> "${match.item_id}" (product: ${match.name})`);
          return match;
        }
        console.log(`✗ No normalized match found for: "${poItemId}"`);
      }

      // Try base SKU matching (removes suffixes)
      if (poItemId) {
        console.log(`\n[STEP 5] Trying base SKU match for: "${poItemId}"`);
        const basePoSku = extractBaseSku(poItemId);
        console.log(`  Base PO SKU: "${basePoSku}"`);
        
        const match = products.find(p => {
          if (!p.item_id) return false;
          const baseProductSku = extractBaseSku(p.item_id);
          const matches = baseProductSku === basePoSku;
          if (p.item_id && p.item_id.toLowerCase().includes('pck-00046')) {
            console.log(`  Checking product: "${p.item_id}" (base: "${baseProductSku}") vs "${basePoSku}" = ${matches}`);
          }
          return matches;
        });
        
        if (match) {
          console.log(`✓ BASE SKU MATCH FOUND: "${basePoSku}" -> "${match.item_id}" (product: ${match.name})`);
          return match;
        }
        console.log(`✗ No base SKU match found for: "${poItemId}"`);
      }

      // STEP 6: Try exact name match as fallback (important for products without item_id)
      if (poName) {
        console.log(`\n[STEP 6] Trying exact name match for: "${poName}"`);
        const match = products.find(p => 
          p.name && p.name.toLowerCase().trim() === poName.toLowerCase().trim()
        );
        if (match) {
          console.log(`✓ EXACT NAME MATCH FOUND: "${poName}" -> product ID: ${match.id}`);
          return match;
        }
        console.log(`✗ No exact name match found for: "${poName}"`);
      }

      // STEP 7: Try normalized name match (remove special chars)
      if (poName) {
        console.log(`\n[STEP 7] Trying normalized name match for: "${poName}"`);
        const normalizedPoName = normalize(poName);
        console.log(`  Normalized PO name: "${normalizedPoName}"`);
        const match = products.find(p => {
          if (!p.name) return false;
          const normalizedProductName = normalize(p.name);
          return normalizedProductName === normalizedPoName;
        });
        if (match) {
          console.log(`✓ NORMALIZED NAME MATCH FOUND: "${poName}" -> "${match.name}"`);
          return match;
        }
        console.log(`✗ No normalized name match found for: "${poName}"`);
      }

      // Removed overly aggressive partial and fuzzy matching to prevent incorrect product matches
      // Only exact, normalized, and base SKU matches are used now

      console.log(`\n========== NO MATCH FOUND ==========`);
      console.log(`✗ Failed to match: item_id="${poItemId}", sku="${poSku}", name="${poName}"`);
      console.log(`All products with similar SKUs:`);
      products.filter(p => p.item_id && p.item_id.toLowerCase().includes('pck')).slice(0, 10).forEach(p => {
        console.log(`  - ${p.item_id} (${p.name})`);
      });
      return null;
    };

    // Generate sequential order number by finding the max existing order number
    const { data: maxOrderData } = await supabase
      .from('orders')
      .select('order_number')
      .order('order_number', { ascending: false })
      .limit(1);
    
    let orderNum = 10700; // Default starting number
    if (maxOrderData && maxOrderData.length > 0) {
      const maxNum = parseInt(maxOrderData[0].order_number, 10);
      if (!isNaN(maxNum)) {
        orderNum = maxNum + 1;
      }
    }
    const orderNumber = String(orderNum);

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
        po_pdf_path: pdfPath,
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
        const matchedProduct = findMatchingProduct(item);
        
        // ALWAYS use PO unit_price, never pull from product cost
        const unitPrice = item.unit_price || 0;
        const quantity = item.quantity || 1;
        
        console.log(`Item "${item.name}": unit_price=${item.unit_price}, type=${typeof item.unit_price}`);
        
        // If product matched, use its full identity including vendor assignment
        const orderItem: any = {
          order_id: order.id,
          product_id: matchedProduct?.id || null,
          sku: item.sku || 'UNKNOWN',
          name: item.name || item.description || 'Unknown Item',
          description: matchedProduct?.description || item.description || null,
          quantity: quantity,
          unit_price: unitPrice, // PO price overrides product cost
          total: quantity * unitPrice,
          shipped_quantity: 0, // Initialize as 0 for new orders
          item_id: matchedProduct?.item_id || item.sku || null
        };
        
        // If product has a preferred vendor, assign it to the order item
        if (matchedProduct?.preferred_vendor_id) {
          orderItem.vendor_id = matchedProduct.preferred_vendor_id;
          orderItem.vendor_cost = matchedProduct.cost || null;
          console.log(`✓ Assigned vendor ${matchedProduct.preferred_vendor_id} to item "${item.name}"`);
        }
        
        return orderItem;
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

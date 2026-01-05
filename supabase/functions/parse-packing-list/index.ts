import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Parsing packing list...");
    const { fileContent, orderItems, fileName, isBase64 } = await req.json();
    console.log(`Processing file: ${fileName}, order has ${orderItems?.length || 0} items, isBase64: ${isBase64}`);
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }
    
    if (!fileContent) {
      console.error("No file content provided");
      throw new Error("No file content provided");
    }

    if (!orderItems || orderItems.length === 0) {
      console.error("No order items provided");
      throw new Error("No order items provided");
    }

    // Parse file content based on type
    let parsedContent = "";
    const fileNameLower = fileName.toLowerCase();
    
    if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) {
      // Parse Excel file
      console.log("Parsing Excel file...");
      try {
        // Decode base64 to binary
        const binaryString = atob(fileContent);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const workbook = XLSX.read(bytes, { type: 'array' });
        console.log("Sheet names:", workbook.SheetNames);
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to CSV for AI parsing
        parsedContent = XLSX.utils.sheet_to_csv(worksheet);
        console.log("Parsed Excel to CSV, preview:", parsedContent.substring(0, 500));
      } catch (xlsxError) {
        console.error("XLSX parsing error:", xlsxError);
        throw new Error(`Failed to parse Excel file: ${xlsxError instanceof Error ? xlsxError.message : 'Unknown error'}. Please ensure the file is a valid Excel file.`);
      }
    } else {
      // Text file (CSV/TXT) - use content directly
      parsedContent = fileContent;
      console.log("Using text content directly, preview:", parsedContent.substring(0, 500));
    }

    // Format order items for the AI to match against
    const orderItemsList = orderItems.map((item: any) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      ordered_quantity: item.quantity,
      already_shipped: item.shipped_quantity || 0
    }));

    console.log("Order items for matching:", JSON.stringify(orderItemsList.map((i: any) => ({ id: i.id.substring(0,8), name: i.name, sku: i.sku })), null, 2));

    const systemPrompt = `You are a packing list parser. Your job is to extract shipped quantities from a packing list document and match them to order items.

The packing list may be in various formats (CSV, tab-separated, or plain text). It contains products that were shipped with their quantities.

You have the following order items to match against:
${JSON.stringify(orderItemsList, null, 2)}

MATCHING RULES - FOLLOW STRICTLY IN THIS ORDER:
1. **SKU MATCHING (HIGHEST PRIORITY)** - If the packing list contains SKU codes (look for columns like "SKU", "Item Code", "Part #", "Product Code"), match them EXACTLY to order item SKUs first.

2. **PRODUCT NAME MATCHING** - When SKU is not available, match by product name:
   - Compare the FULL product name from the packing list to EACH order item name
   - Look for the MOST SIMILAR match, not just partial matches
   - Be flexible with: word order, capitalization, abbreviations, size formats
   - The product name in the packing list may appear in columns like "Product", "Description", "Item", "Name"

3. **FUZZY MATCHING** - For products that don't match exactly:
   - Look for key identifiers: product type, size, flavor, color, model number
   - Match based on unique identifying words that appear in both names

QUANTITY EXTRACTION:
- Look for columns: "Qty", "Quantity", "Shipped", "Ship Qty", "Amount", "Count", "Units"
- If multiple quantity columns exist, prefer "Shipped" or "Ship Qty" over "Ordered" or "Order Qty"
- Extract only numeric values, ignore units like "ea", "pcs", "units"

CRITICAL RULES:
- Each order item ID should appear AT MOST ONCE in matched_items
- Each packing list row should match AT MOST one order item
- If unsure about a match, put the item in unmatched_items with its name and quantity
- ALWAYS verify the match makes sense - don't match "Product A" to "Product B" just because they both have "Product"`;

    const userPrompt = `Parse this packing list and match each product row to the correct order item. For each row in the packing list, find the BEST matching order item based on name similarity.

Packing List Content:
${parsedContent}

IMPORTANT: Return the order_item_id (the "id" field from the order items list) for each match, not the row number or any other identifier.`;

    console.log("Calling AI Gateway with gemini-2.5-pro...");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_packing_list",
              description: "Parse packing list and match to order items with shipped quantities",
              parameters: {
                type: "object",
                properties: {
                  matched_items: {
                    type: "array",
                    description: "Items that were matched between packing list and order",
                    items: {
                      type: "object",
                      properties: {
                        order_item_id: { 
                          type: "string",
                          description: "The ID of the matching order item"
                        },
                        shipped_quantity: { 
                          type: "number",
                          description: "The quantity shipped according to the packing list"
                        },
                        packing_list_name: {
                          type: "string",
                          description: "The product name as it appears in the packing list"
                        },
                        match_confidence: {
                          type: "string",
                          enum: ["high", "medium", "low"],
                          description: "Confidence level of the match"
                        }
                      },
                      required: ["order_item_id", "shipped_quantity", "packing_list_name", "match_confidence"]
                    }
                  },
                  unmatched_items: {
                    type: "array",
                    description: "Items in packing list that couldn't be matched to any order item",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "number" }
                      },
                      required: ["name", "quantity"]
                    }
                  },
                  parsing_notes: {
                    type: "string",
                    description: "Any notes about the parsing process or issues encountered"
                  }
                },
                required: ["matched_items", "unmatched_items", "parsing_notes"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "parse_packing_list" } }
      }),
    });

    console.log(`AI Gateway response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI Gateway error response: ${errorText}`);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI Gateway response received");
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call in AI response:", JSON.stringify(data));
      throw new Error("No tool call in response");
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log(`Successfully matched ${result.matched_items?.length || 0} items, ${result.unmatched_items?.length || 0} unmatched`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error parsing packing list:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to parse packing list",
        matched_items: [],
        unmatched_items: [],
        parsing_notes: "Failed to parse packing list"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

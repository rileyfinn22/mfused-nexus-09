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

    const systemPrompt = `You are a packing list parser. Your job is to extract shipped quantities from a packing list document and match them to order items.

The packing list may be in various formats (CSV, tab-separated, or plain text). It contains products that were shipped with their quantities.

You have the following order items to match against:
${JSON.stringify(orderItemsList, null, 2)}

MATCHING RULES (in order of priority):
1. **SKU MATCHING (HIGHEST PRIORITY)** - If the packing list contains SKU codes, match them EXACTLY to order item SKUs. This is the most reliable method.
2. **PRODUCT NAME MATCHING** - Match product names, being flexible with:
   - Word order variations (e.g., "Widget 1000mg" = "1000mg Widget")
   - Case differences (ignore capitalization)
   - Minor spelling variations
   - Abbreviations and full forms
   - Size/weight in different formats (e.g., "1000mg" = "1g" = "1 gram")
3. **PARTIAL NAME MATCHING** - If exact match fails, match if key product identifiers appear in both

CRITICAL INSTRUCTIONS:
- Look for columns like "SKU", "Item #", "Part #", "Code" for SKU matching
- Look for columns like "Qty", "Quantity", "Shipped", "Ship Qty", "Amount", "Count" for quantities
- Extract numeric quantities - ignore units like "ea", "pcs", "units"
- If a row has multiple quantity columns, prefer "Shipped" or "Ship Qty" over "Ordered"
- Each packing list item should match AT MOST one order item
- If you cannot confidently match an item, put it in unmatched_items
- Return ALL matched items, even if quantity exceeds remaining to ship`;

    const userPrompt = `Parse this packing list and match products to order items. Return the shipped quantities for each matched item.

Packing List Content:
${parsedContent}`;

    console.log("Calling AI Gateway...");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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

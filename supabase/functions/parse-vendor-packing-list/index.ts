import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedPackingItem {
  description: string;
  cartons: string;
  qty_per_carton: string;
  total_qty: string;
  gross_weight: string;
  net_weight: string;
  measurement: string;
  shipping_date?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Parsing vendor packing list...");
    const { fileContent, fileName } = await req.json();
    
    if (!fileContent) {
      throw new Error("No file content provided");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Parse file content based on type
    let parsedContent = "";
    const fileNameLower = fileName.toLowerCase();
    
    if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) {
      // Parse Excel file
      console.log("Parsing Excel file...");
      try {
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
        throw new Error(`Failed to parse Excel file: ${xlsxError instanceof Error ? xlsxError.message : 'Unknown error'}`);
      }
    } else if (fileNameLower.endsWith('.csv')) {
      // CSV file - decode base64
      parsedContent = atob(fileContent);
      console.log("Using CSV content directly, preview:", parsedContent.substring(0, 500));
    } else {
      throw new Error("Unsupported file type. Please upload Excel (.xlsx, .xls) or CSV files.");
    }

    // Use AI to extract packing list items
    const systemPrompt = `You extract shipping/packing list items from vendor documents.

Extract each line item with these fields:
- description: Product name/description
- cartons: Number of cartons (e.g., "2CTNS", "5")
- qty_per_carton: Quantity per carton (e.g., "200PCS/CTN", "500")
- total_qty: Total quantity (e.g., "1000PCS", "2500")
- gross_weight: Gross weight with unit (e.g., "5.30KG")
- net_weight: Net weight with unit (e.g., "4.30KG")
- measurement: CBM/volume measurement (e.g., "0.03CBM")
- shipping_date: Shipping date if present

Rules:
- Extract ALL product rows, not headers or totals
- Keep original formatting for quantities and weights
- Skip empty rows, headers, and summary/total rows
- If a field is not present, use empty string`;

    const userPrompt = `Extract packing list items from this vendor document:

${parsedContent}`;

    console.log("Calling AI Gateway to extract packing list items...");
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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_packing_items",
              description: "Extract packing list items from vendor document",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        cartons: { type: "string" },
                        qty_per_carton: { type: "string" },
                        total_qty: { type: "string" },
                        gross_weight: { type: "string" },
                        net_weight: { type: "string" },
                        measurement: { type: "string" },
                        shipping_date: { type: "string" },
                      },
                      required: ["description", "total_qty"],
                    },
                  },
                  notes: { type: "string" },
                },
                required: ["items"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_packing_items" } },
      }),
    });

    console.log(`AI Gateway response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI Gateway error response: ${errorText}`);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI Gateway response received");

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      console.error("No tool call in AI response:", JSON.stringify(data));
      throw new Error("Failed to parse packing list");
    }

    const extracted = JSON.parse(toolCall.function.arguments) as {
      items: ParsedPackingItem[];
      notes?: string;
    };

    // Clean up items
    const items = (extracted.items || [])
      .map((item) => ({
        description: (item.description || "").trim(),
        cartons: (item.cartons || "").trim(),
        qty_per_carton: (item.qty_per_carton || "").trim(),
        total_qty: (item.total_qty || "").trim(),
        gross_weight: (item.gross_weight || "").trim(),
        net_weight: (item.net_weight || "").trim(),
        measurement: (item.measurement || "").trim(),
        shipping_date: (item.shipping_date || "").trim(),
      }))
      .filter((item) => item.description && item.total_qty);

    console.log(`Extracted ${items.length} items from packing list`);

    return new Response(
      JSON.stringify({ 
        items, 
        notes: extracted.notes || `Extracted ${items.length} items from vendor packing list` 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error parsing vendor packing list:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to parse packing list",
        items: []
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

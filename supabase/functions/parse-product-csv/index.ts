import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Parsing CSV with AI...");
    const { csvRows } = await req.json();
    console.log(`Received ${csvRows?.length || 0} CSV rows`);
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }
    
    if (!csvRows || csvRows.length === 0) {
      console.error("No CSV rows provided");
      throw new Error("No CSV rows provided");
    }

const systemPrompt = `You are a data extraction assistant. Parse CSV product data into a standardized format.
Extract the following fields from each row:
- name (required): product name/title
- state (optional): state code (CA, CO, MA, MI, NV, OR, WA) or "general" for non-state-specific items. Default to "general" if not specified.
- item_id: SKU, product ID, item code, or similar identifier
- description: product description, details, or notes
- price: selling price (number only)
- cost: cost price (number only)

Be flexible with column names - understand variations like "Product Name", "product_name", "name", etc.
If a field is missing or unclear, omit it from the output (except state, which should default to "general").`;

    const userPrompt = `Parse these CSV rows into standardized product objects:\n${JSON.stringify(csvRows, null, 2)}`;

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
              name: "parse_products",
              description: "Parse CSV rows into standardized product format",
              parameters: {
                type: "object",
                properties: {
                  products: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        state: { type: "string" },
                        item_id: { type: "string" },
                        description: { type: "string" },
                        price: { type: "string" },
                        cost: { type: "string" }
                      },
                      required: ["name"],
                      additionalProperties: false
                    }
                  },
                  errors: {
                    type: "array",
                    items: { type: "string" }
                  }
                },
                required: ["products", "errors"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "parse_products" } }
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
    console.log(`Successfully parsed ${result.products?.length || 0} products`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error parsing CSV:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to parse CSV",
        products: [],
        errors: ["Failed to parse CSV with AI"]
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

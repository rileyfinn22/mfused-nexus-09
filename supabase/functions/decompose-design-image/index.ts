import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { image_url, canvas_width, canvas_height } = await req.json();
    if (!image_url) {
      return new Response(JSON.stringify({ error: "image_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are analyzing a product label/packaging design image. Your job is to identify every text element in the design and return structured data about each one.

For each text element found, extract:
- "text": the exact text content
- "x_percent": horizontal position as percentage of image width (0-100), measuring from left edge to text center
- "y_percent": vertical position as percentage of image height (0-100), measuring from top edge to text center
- "font_size_percent": approximate font size as percentage of image height
- "color": the text color as a hex code (e.g. "#FFFFFF")
- "font_weight": "bold" or "normal"
- "font_style": "italic" or "normal"
- "text_align": "left", "center", or "right"
- "suggested_font": suggest a Google Font that closely matches the style (e.g. "Montserrat", "Playfair Display", "Bebas Neue")

Be precise about positions. Return ALL visible text, including small text like ingredients, weights, taglines, etc.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this design image (canvas size: ${canvas_width}x${canvas_height} pixels). Extract all text elements with their positions and styling. Return ONLY a JSON array of text elements, no markdown, no explanation.`,
                },
                {
                  type: "image_url",
                  image_url: { url: image_url },
                },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_text_regions",
                description: "Extract all text regions from the design image with position and style data",
                parameters: {
                  type: "object",
                  properties: {
                    text_regions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          text: { type: "string", description: "The exact text content" },
                          x_percent: { type: "number", description: "X position as % of image width (0-100)" },
                          y_percent: { type: "number", description: "Y position as % of image height (0-100)" },
                          font_size_percent: { type: "number", description: "Font size as % of image height" },
                          color: { type: "string", description: "Text color as hex code" },
                          font_weight: { type: "string", enum: ["bold", "normal"] },
                          font_style: { type: "string", enum: ["italic", "normal"] },
                          text_align: { type: "string", enum: ["left", "center", "right"] },
                          suggested_font: { type: "string", description: "Suggested Google Font name" },
                        },
                        required: ["text", "x_percent", "y_percent", "font_size_percent", "color"],
                      },
                    },
                  },
                  required: ["text_regions"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_text_regions" } },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Extract from tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let textRegions: any[] = [];
    
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        textRegions = args.text_regions || [];
      } catch (e) {
        console.error("Failed to parse tool call arguments:", e);
      }
    }

    // Fallback: try parsing content as JSON if no tool calls
    if (textRegions.length === 0) {
      const content = data.choices?.[0]?.message?.content || "";
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          textRegions = JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.warn("Could not parse fallback content as JSON");
      }
    }

    return new Response(
      JSON.stringify({ text_regions: textRegions }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("decompose-design-image error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

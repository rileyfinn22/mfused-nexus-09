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

    const { image_url, extract_all, canvas_width, canvas_height } = await req.json();
    if (!image_url) {
      return new Response(JSON.stringify({ error: "image_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Two modes: single zone extraction (with font detection) or full-page extraction
    const isFullPage = extract_all === true;

    const tools = isFullPage
      ? [
          {
            type: "function",
            function: {
              name: "extract_text_regions",
              description:
                "Extract all text regions from the full page image. Return each distinct text block with its position as a percentage of image dimensions, estimated font properties, and content.",
              parameters: {
                type: "object",
                properties: {
                  regions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string", description: "The text content" },
                        x_percent: {
                          type: "number",
                          description: "Left position as percentage (0-100) of image width",
                        },
                        y_percent: {
                          type: "number",
                          description: "Top position as percentage (0-100) of image height",
                        },
                        w_percent: {
                          type: "number",
                          description: "Width as percentage (0-100) of image width",
                        },
                        h_percent: {
                          type: "number",
                          description: "Height as percentage (0-100) of image height",
                        },
                        font_family: {
                          type: "string",
                          description:
                            "Best guess for the font family. Use common names like Arial, Helvetica, Times New Roman, Georgia, Roboto, Montserrat, Bebas Neue, etc.",
                        },
                        font_size_pt: {
                          type: "number",
                          description: "Estimated font size in points based on the text height relative to the page",
                        },
                        font_weight: {
                          type: "string",
                          enum: ["normal", "bold"],
                          description: "Whether the text appears bold",
                        },
                        font_style: {
                          type: "string",
                          enum: ["normal", "italic"],
                          description: "Whether the text appears italic",
                        },
                        color: {
                          type: "string",
                          description: "Text color as hex (e.g. #000000, #ffffff, #ff0000)",
                        },
                      },
                      required: ["text", "x_percent", "y_percent", "w_percent", "h_percent"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["regions"],
                additionalProperties: false,
              },
            },
          },
        ]
      : [
          {
            type: "function",
            function: {
              name: "extract_text_with_style",
               description:
                 "Extract text from the cropped image region along with detected font styling and text bounds within the crop.",
               parameters: {
                 type: "object",
                 properties: {
                   text: { type: "string", description: "The extracted text content" },
                   x_percent: {
                     type: "number",
                     description: "Left position of text in the crop as percentage (0-100) of crop width",
                   },
                   y_percent: {
                     type: "number",
                     description: "Top position of text in the crop as percentage (0-100) of crop height",
                   },
                   w_percent: {
                     type: "number",
                     description: "Text bounds width in the crop as percentage (0-100) of crop width",
                   },
                   h_percent: {
                     type: "number",
                     description: "Text bounds height in the crop as percentage (0-100) of crop height",
                   },
                   font_family: {
                     type: "string",
                     description:
                       "Best guess for the font family. Use common names like Arial, Helvetica, Times New Roman, Georgia, Roboto, Montserrat, Bebas Neue, Open Sans, Lato, Poppins, etc.",
                   },
                   font_size_pt: {
                     type: "number",
                     description: "Estimated font size in points based on the text height relative to the cropped region",
                   },
                   font_weight: {
                     type: "string",
                     enum: ["normal", "bold"],
                     description: "Whether the text appears bold",
                   },
                   font_style: {
                     type: "string",
                     enum: ["normal", "italic"],
                     description: "Whether the text appears italic",
                   },
                   color: {
                     type: "string",
                     description: "Text color as hex (e.g. #000000, #ffffff, #ff0000)",
                   },
                 },
                required: ["text"],
                additionalProperties: false,
              },
            },
          },
        ];

    const systemPrompt = isFullPage
      ? `You are a precise OCR and layout analysis assistant for print design files. Analyze the full page image and identify ALL distinct text blocks/regions. For each text block, determine its position (as percentage of page dimensions), the text content, and font styling. Be very accurate with positions. Group nearby text that belongs together (e.g. a multi-line paragraph is one region). The canvas dimensions are ${canvas_width || "unknown"}x${canvas_height || "unknown"} pixels.`
      : "You are an OCR assistant specialized in print design. Extract the text from the cropped image and detect its font styling (family, weight, style, color). Also return the text bounds position and size within the crop as percentages (x_percent, y_percent, w_percent, h_percent). Be precise about font family and positions.";

    const userPrompt = isFullPage
      ? "Analyze this full page design and extract ALL text regions with their positions and font properties."
      : "Extract the text, styling, and precise bounds from this cropped region.";

    const toolChoice = isFullPage
      ? { type: "function", function: { name: "extract_text_regions" } }
      : { type: "function", function: { name: "extract_text_with_style" } };

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
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: image_url } },
              ],
            },
          ],
          tools,
          tool_choice: toolChoice,
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
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "AI text extraction failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Parse tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      // Fallback to content-based extraction
      const fallbackText = (data.choices?.[0]?.message?.content || "").trim();
      return new Response(
        JSON.stringify({ text: fallbackText }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    if (isFullPage) {
      return new Response(
        JSON.stringify({ regions: parsed.regions || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({
          text: parsed.text || "",
          x_percent: parsed.x_percent ?? null,
          y_percent: parsed.y_percent ?? null,
          w_percent: parsed.w_percent ?? null,
          h_percent: parsed.h_percent ?? null,
          font_family: parsed.font_family || null,
          font_size_pt: parsed.font_size_pt || null,
          font_weight: parsed.font_weight || "normal",
          font_style: parsed.font_style || "normal",
          color: parsed.color || "#000000",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("decompose-design-image error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

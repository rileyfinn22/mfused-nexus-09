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

    const { prompt, reference_image, edit_mode } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt: string;
    if (edit_mode && reference_image) {
      systemPrompt = "You are a professional packaging and label designer and image editor. The user has provided their current design. Apply the requested edits precisely while preserving the rest of the design. Keep the same dimensions, layout, and elements that weren't mentioned. Output a clean, high-quality, print-ready result.";
    } else if (reference_image) {
      systemPrompt = "You are a professional packaging and label designer. The user has provided a reference image (screenshot, photo, or mockup). Your job is to recreate the design as a clean, high-quality, print-ready graphic. Match the layout, color scheme, and overall style as closely as possible. Make the output crisp, professional, and suitable for product packaging printing. Improve clarity and sharpness where the original is blurry or low-quality.";
    } else {
      systemPrompt = "You are a professional packaging and label designer. Generate high-quality design elements, graphics, patterns, or label artwork based on the user's description. Output should be clean, print-ready, and suitable for product packaging. Use vibrant colors and sharp details. The image should have a transparent or white background unless otherwise specified.";
    }

    // Build the user message content
    const userContent: any[] = [{ type: "text", text: prompt }];

    if (reference_image) {
      userContent.push({
        type: "image_url",
        image_url: { url: reference_image },
      });
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          modalities: ["image", "text"],
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
        JSON.stringify({ error: "AI generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const imageUrl =
      data.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
    const textContent = data.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ image_url: imageUrl, message: textContent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-design-image error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

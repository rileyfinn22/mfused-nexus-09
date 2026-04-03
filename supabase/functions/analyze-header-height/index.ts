import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, pdfPageHeight } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ headerHeight: 70 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.lovable.dev/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You analyze PDF page images to determine the height of the company/vendor branding header area at the top of the page. This header typically contains the company name, logo, address, and contact info. You need to determine how many PDF points (from the top of the page) should be covered with a white rectangle to fully hide the vendor's branding without covering any table/content data below it. The page height in PDF points is ${pdfPageHeight || 792}. Respond with ONLY a JSON object like {"headerHeight": 75}. Be precise — include enough to cover the full header but not the content below. If unsure, estimate conservatively (cover more rather than less). Typical headers are 50-120 points.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this packing list PDF page. How many PDF points from the top should be covered to hide the vendor/company header branding? Include any company name, logo, address lines, and decorative header elements. Do NOT include the main table data.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status);
      return new Response(JSON.stringify({ headerHeight: 70 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    
    // Parse the JSON from the response
    const jsonMatch = content.match(/\{[^}]*"headerHeight"\s*:\s*(\d+)[^}]*\}/);
    const headerHeight = jsonMatch ? parseInt(jsonMatch[1], 10) : 70;

    return new Response(JSON.stringify({ headerHeight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ headerHeight: 70 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

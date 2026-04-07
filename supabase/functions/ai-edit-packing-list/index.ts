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
    const { matrix, prompt } = await req.json();

    if (!matrix || !Array.isArray(matrix) || !prompt) {
      throw new Error("Missing matrix data or prompt");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Convert matrix to a readable table format for the AI
    const tableText = matrix.map((row: string[], i: number) =>
      `Row ${i}: ${row.map((cell, j) => `[${j}]="${cell}"`).join(" | ")}`
    ).join("\n");

    const systemPrompt = `You are a spreadsheet editor. You receive a table as rows of cells and a user instruction. Return the ENTIRE modified table. You must preserve all rows and columns unless the user explicitly asks to remove them.

Rules:
- Return the complete table, not just changed rows
- Each row is an array of strings
- Preserve formatting of numbers, dates, weights etc unless asked to change
- If asked to remove a row, remove it entirely
- If asked to add a row, add it at the appropriate position
- If asked to modify text, only change what's requested
- Never add explanations, just return the data`;

    const userPrompt = `Here is the table data:

${tableText}

User instruction: ${prompt}

Return the modified table.`;

    console.log(`AI edit packing list: ${matrix.length} rows, prompt: "${prompt}"`);

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
              name: "return_edited_table",
              description: "Return the edited table data",
              parameters: {
                type: "object",
                properties: {
                  rows: {
                    type: "array",
                    description: "The complete edited table, each item is an array of cell strings",
                    items: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  summary: {
                    type: "string",
                    description: "Brief summary of what was changed",
                  },
                },
                required: ["rows", "summary"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_edited_table" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI Gateway error: ${response.status}`, errorText);
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      console.error("No tool call in AI response:", JSON.stringify(data));
      throw new Error("Failed to get AI edit result");
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log(`AI edit complete: ${result.rows?.length} rows, summary: ${result.summary}`);

    return new Response(
      JSON.stringify({ rows: result.rows, summary: result.summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error editing packing list:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to edit packing list" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

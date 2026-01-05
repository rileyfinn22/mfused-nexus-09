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

    // Format order items for deterministic matching
    const normalizeSku = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizeText = (s: string) =>
      (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const tokenize = (s: string) => {
      const t = normalizeText(s);
      if (!t) return [] as string[];
      return t.split(/\s+/).filter(Boolean);
    };

    const jaccard = (a: string[], b: string[]) => {
      if (a.length === 0 || b.length === 0) return 0;
      const A = new Set(a);
      const B = new Set(b);
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      const union = new Set([...A, ...B]).size;
      return union === 0 ? 0 : inter / union;
    };

    const orderItemsList = orderItems.map((item: any) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      ordered_quantity: item.quantity,
      already_shipped: item.shipped_quantity || 0,
      _sku_norm: normalizeSku(item.sku || ""),
      _name_norm: normalizeText(item.name || ""),
      _name_tokens: tokenize(item.name || ""),
    }));

    const orderBySku = new Map<string, any>();
    for (const item of orderItemsList) {
      if (item._sku_norm) orderBySku.set(item._sku_norm, item);
    }

    console.log(
      "Order items for matching:",
      JSON.stringify(orderItemsList.map((i: any) => ({ id: i.id.substring(0, 8), name: i.name, sku: i.sku })), null, 2),
    );

    // Step 1: Use AI ONLY to extract packing list line items (name/sku/qty) from the document.
    // Step 2: Match extracted lines to order items deterministically (SKU first, then strict fuzzy name match).

    const systemPrompt = `You extract shipped line items from a packing list.

Return ONLY items that appear in the packing list content. Do NOT guess, do NOT invent items, and do NOT try to match against an order.

Rules:
- Identify each shipped product row and extract:
  - name (string)
  - quantity (number)
  - sku (string, optional) if present in the row (columns like SKU/Item Code/Part #)
- If you can't find a quantity for a row, skip the row.
- Ignore headers, totals, empty rows, and notes.
- Quantity must be a number (e.g. 12, 1, 0.5).`;

    const userPrompt = `Extract the shipped line items from this packing list:

${parsedContent}`;

    console.log("Calling AI Gateway (extract items)...");
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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_packing_list_items",
              description: "Extract shipped items (name/sku/quantity) from a packing list",
              parameters: {
                type: "object",
                properties: {
                  packing_list_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        sku: { type: "string" },
                        quantity: { type: "number" },
                      },
                      required: ["name", "quantity"],
                    },
                  },
                  parsing_notes: { type: "string" },
                },
                required: ["packing_list_items", "parsing_notes"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_packing_list_items" } },
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
      throw new Error("No tool call in response");
    }

    const extracted = JSON.parse(toolCall.function.arguments) as {
      packing_list_items: Array<{ name: string; sku?: string; quantity: number }>;
      parsing_notes: string;
    };

    const lines = (extracted.packing_list_items || [])
      .map((x) => ({
        name: (x.name || "").trim(),
        sku: (x.sku || "").trim(),
        quantity: Number(x.quantity),
      }))
      .filter((x) => x.name && Number.isFinite(x.quantity) && x.quantity > 0);

    console.log(`Extracted ${lines.length} line items from packing list`);

    // Deterministic matching (SKU first, then strict fuzzy name match)
    const confidenceRankToStr = (r: number): "high" | "medium" | "low" => (r >= 3 ? "high" : r === 2 ? "medium" : "low");

    const matchedAgg = new Map<
      string,
      { qty: number; names: Set<string>; confidenceRank: number }
    >();

    const unmatched: Array<{ name: string; quantity: number }> = [];

    for (const line of lines) {
      const skuNorm = normalizeSku(line.sku || "");
      const nameNorm = normalizeText(line.name);

      // 1) SKU exact match
      if (skuNorm && orderBySku.has(skuNorm)) {
        const orderItem = orderBySku.get(skuNorm);
        const prev = matchedAgg.get(orderItem.id) || { qty: 0, names: new Set<string>(), confidenceRank: 3 };
        prev.qty += line.quantity;
        prev.names.add(line.name);
        prev.confidenceRank = Math.min(prev.confidenceRank, 3);
        matchedAgg.set(orderItem.id, prev);
        continue;
      }

      // 2) Name fuzzy match with threshold
      const lineTokens = tokenize(line.name);
      if (!nameNorm || lineTokens.length === 0) {
        unmatched.push({ name: line.name || "(unknown)", quantity: line.quantity });
        continue;
      }

      let best: { item: any; score: number } | null = null;
      for (const item of orderItemsList) {
        const base = jaccard(lineTokens, item._name_tokens);
        const substringBoost = item._name_norm && (item._name_norm.includes(nameNorm) || nameNorm.includes(item._name_norm)) ? 0.15 : 0;
        const score = Math.min(1, base + substringBoost);
        if (!best || score > best.score) best = { item, score };
      }

      const bestScore = best?.score ?? 0;
      if (!best || bestScore < 0.55) {
        // Below threshold = don't match
        unmatched.push({ name: line.name, quantity: line.quantity });
        continue;
      }

      const rank = bestScore >= 0.8 ? 3 : bestScore >= 0.7 ? 2 : 1;
      const prev = matchedAgg.get(best.item.id) || { qty: 0, names: new Set<string>(), confidenceRank: rank };
      prev.qty += line.quantity;
      prev.names.add(line.name);
      prev.confidenceRank = Math.min(prev.confidenceRank, rank);
      matchedAgg.set(best.item.id, prev);
    }

    const matched_items = [...matchedAgg.entries()].map(([order_item_id, v]) => ({
      order_item_id,
      shipped_quantity: v.qty,
      packing_list_name: [...v.names].join("; "),
      match_confidence: confidenceRankToStr(v.confidenceRank),
    }));

    const result = {
      matched_items,
      unmatched_items: unmatched,
      parsing_notes: `Extracted ${lines.length} packing list rows. Matched ${matched_items.length} order items (SKU-first + strict name matching). ${unmatched.length} rows unmatched. ${extracted.parsing_notes || ""}`.trim(),
    };

    console.log(`Matched ${matched_items.length} items, ${unmatched.length} unmatched`);

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

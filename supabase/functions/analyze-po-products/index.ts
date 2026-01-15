import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized: Invalid token');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check content type to determine input mode
    const contentType = req.headers.get('content-type') || '';
    let companyId: string;
    let analysisHint: string | null = null;
    let extractedText: string;
    let inputSource: string;

    // Helper to extract state from filename or PO number patterns like:
    // "Purchase_Order_NY-122325-APION_4.pdf" -> "NY"
    // "WA-122225-APION" -> "WA"
    const STATE_CODES_SET = new Set([
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
    ]);

    const extractStateFromSource = (source: string, text: string): string | null => {
      // Try to extract from filename first (e.g., "Purchase_Order_NY-..." or "PO_WA-...")
      const fileMatch = source.match(/(?:Purchase_Order_|PO_)?([A-Z]{2})[-_]/i);
      if (fileMatch) {
        const st = fileMatch[1].toUpperCase();
        if (STATE_CODES_SET.has(st)) {
          console.log(`Extracted state '${st}' from filename: ${source}`);
          return st;
        }
      }
      
      // Try to extract from beginning of filename
      const startMatch = source.match(/^([A-Z]{2})[-_]/i);
      if (startMatch) {
        const st = startMatch[1].toUpperCase();
        if (STATE_CODES_SET.has(st)) {
          console.log(`Extracted state '${st}' from filename start: ${source}`);
          return st;
        }
      }

      // Try to find PO number pattern in text like "NY-122325-APION" at the start
      const poNumberMatch = text.match(/(?:PO|Purchase Order|Order)[:\s#]*([A-Z]{2})[-]/i);
      if (poNumberMatch) {
        const st = poNumberMatch[1].toUpperCase();
        if (STATE_CODES_SET.has(st)) {
          console.log(`Extracted state '${st}' from PO number in text`);
          return st;
        }
      }

      // Look for standalone state code pattern at very beginning of text lines
      const lineMatch = text.match(/^([A-Z]{2})[-]\d+/m);
      if (lineMatch) {
        const st = lineMatch[1].toUpperCase();
        if (STATE_CODES_SET.has(st)) {
          console.log(`Extracted state '${st}' from PO number line in text`);
          return st;
        }
      }

      return null;
    };

    if (contentType.includes('application/json')) {
      // Text mode - parse JSON body
      const jsonBody = await req.json();
      companyId = jsonBody.company_id;
      analysisHint = jsonBody.analysis_hint || null;
      extractedText = jsonBody.text_content || '';
      inputSource = 'text input';
      
      if (!extractedText.trim()) {
        throw new Error('No text content provided');
      }
      
      console.log(`Analyzing text input for products, company_id: ${companyId}, text length: ${extractedText.length}, hint: ${analysisHint || 'none'}`);
    } else {
      // PDF mode - parse form data
      const formData = await req.formData();
      const file = formData.get('file') as File;
      companyId = formData.get('company_id') as string;
      analysisHint = formData.get('analysis_hint') as string | null;

      if (!file) {
        throw new Error('No file provided');
      }

      console.log(`Analyzing PO for products, company_id: ${companyId}, file: ${file.name}, hint: ${analysisHint || 'none'}`);
      inputSource = file.name;

      // Read file content
      const arrayBuffer = await file.arrayBuffer();
      
      // Use pdf-parse library to extract text
      console.log('Extracting text from PDF...');
      const pdfParse = (await import('npm:pdf-parse@1.1.1')).default;
      
      try {
        const pdfData = await pdfParse(new Uint8Array(arrayBuffer));
        extractedText = pdfData.text;
        console.log('Successfully extracted text, length:', extractedText.length);
      } catch (parseError) {
        console.error('PDF parse error:', parseError);
        throw new Error('Failed to parse PDF. Please ensure it is a valid PDF file.');
      }
    }

    // Extract the PO-level state from filename or document
    const poLevelState = extractStateFromSource(inputSource, extractedText);
    console.log(`PO-level state detected: ${poLevelState || 'none'}`);

    // Validate user has access to this company
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      throw new Error('Unauthorized: No user role found');
    }

    if (userRole.role !== 'vibe_admin' && userRole.company_id !== companyId) {
      throw new Error('Unauthorized: User does not have access to this company');
    }

    // Fetch existing templates for this company (plus global templates) to help with matching
    const { data: templates } = await supabase
      .from('product_templates')
      .select('id, name, description, state, price, cost, company_id')
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order('name');

    const templateNames = templates?.map(t => `- "${t.name}" (${t.state || 'no state'})`).join('\n') || 'No templates found';

    // --- Deterministic template matching (post-processing) ---
    // The AI may return a "suggested_template" that is close-but-not-exact, or miss it entirely.
    // We apply lightweight normalization + scoring to consistently map extracted products to template IDs.
    const normalizeLoose = (value: string): string => {
      return (value || '')
        .toLowerCase()
        .replace(/\b(sleeves)\b/g, 'sleeve')
        .replace(/\b(bags)\b/g, 'bag')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    };

    const tokenize = (value: string): string[] => {
      const n = normalizeLoose(value);
      return n ? n.split(/\s+/).filter(Boolean) : [];
    };

    const STATE_CODES = new Set([
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
    ]);

    const extractStateFromName = (name: string): string | null => {
      // Matches end "- AZ" / " - AZ" or standalone last token "AZ"
      const match = (name || '').trim().match(/(?:-|\s)([A-Z]{2})\s*$/i);
      if (!match) return null;
      const st = match[1].toUpperCase();
      return STATE_CODES.has(st) ? st : null;
    };

    // Extended product types for template matching
    type ProductType = 'sleeve' | 'ion_bag' | 'fatty_bag_5pk' | 'fatty_bag_2pk' | 'vape_bag' | 'live_line_bag' | 'bag' | null;
    
    const detectProductType = (str: string): ProductType => {
      if (!str) return null;
      const lower = str.toLowerCase();
      // More specific types first
      if (/\bion\b/i.test(str) && /\bbags?\b/i.test(str)) return 'ion_bag';
      if (/\bion\b/i.test(str)) return 'ion_bag'; // "BAG - Ion" pattern
      if (/\bfatty\b/i.test(str) && /\(5\s*x/i.test(str)) return 'fatty_bag_5pk';
      if (/\bfatty\b/i.test(str) && /\(2\s*x/i.test(str)) return 'fatty_bag_2pk';
      if (/\bvape\s*bags?\b/i.test(str)) return 'vape_bag';
      if (/\blive\s*line\b/i.test(str)) return 'live_line_bag';
      if (/\bsleeves?\b/i.test(str)) return 'sleeve';
      if (/\bbags?\b/i.test(str)) return 'bag';
      return null;
    };

    const typeMatchesTemplate = (type: ProductType, templateName: string): boolean => {
      if (!type || !templateName) return true;
      const tLower = templateName.toLowerCase();
      switch (type) {
        case 'ion_bag': return tLower.includes('ion') && tLower.includes('bag');
        case 'fatty_bag_5pk': return tLower.includes('5pk') && tLower.includes('fatty');
        case 'fatty_bag_2pk': return tLower.includes('2pk') && tLower.includes('fatty');
        case 'vape_bag': return tLower.includes('vape') && tLower.includes('bag');
        case 'live_line_bag': return tLower.includes('live') && tLower.includes('line');
        case 'sleeve': return tLower.includes('sleeve');
        case 'bag': return tLower.includes('bag') && !tLower.includes('ion') && !tLower.includes('fatty') && !tLower.includes('vape');
        default: return true;
      }
    };
    
    const parseAnalysisHint = (hint: string | null): { forcedState: string | null; forcedType: ProductType } => {
      if (!hint) return { forcedState: null, forcedType: null };

      const upper = String(hint).toUpperCase();
      const foundStates = Array.from(new Set((upper.match(/\b[A-Z]{2}\b/g) || []).filter(s => STATE_CODES.has(s))));
      const forcedState = foundStates.length === 1 ? foundStates[0] : null;

      // Detect product type from hint
      const forcedType = detectProductType(hint);

      return { forcedState, forcedType };
    };

    const extractMeaningfulPartsFromPoLine = (rawName: string): string[] => {
      // For lines like:
      // "BAG - Ion - 1g (1 x 1g) - Super Fog - Twisted - Wild Watermelon - Ind"
      // we want to keep: ["Ion", "Twisted", "Wild Watermelon"] (product line + strain identifiers)
      // 
      // "SLEEVE - E2.5 XL - 2g (1 x 2g) - Super Fog - Fire - ATF - Citrus - Sat - AZ"
      // we want to keep: ["Fire", "ATF"] (strain/flavor identifiers)
      const parts = (rawName || '').split(/\s*[-–—]\s*/).map(p => p.trim()).filter(Boolean);

      // IMPORTANT: These are key product line identifiers that must NEVER be dropped
      const IMPORTANT_PRODUCT_LINES = ['ion', 'fatty', 'vape', 'live line', 'fire', 'atf'];
      
      // Common strain/flavor words that should be kept
      const STRAIN_WORDS = [
        'twisted', 'wild', 'watermelon', 'watermellon', 'strawberry', 'lemon', 'grape',
        'mango', 'blueberry', 'cherry', 'orange', 'apple', 'peach', 'melon', 'banana',
        'pineapple', 'raspberry', 'blackberry', 'mint', 'vanilla', 'chocolate', 'coffee',
        'og', 'kush', 'haze', 'diesel', 'cookies', 'gelato', 'runtz', 'zkittlez',
        'widow', 'dream', 'jack', 'gorilla', 'glue', 'cake', 'biscotti', 'sherbet'
      ];

      const isImportantIdentifier = (p: string) => {
        const v = p.toLowerCase().trim();
        // Check if it's a known product line
        for (const line of IMPORTANT_PRODUCT_LINES) {
          if (v === line || v.includes(line)) return true;
        }
        // Check if it contains strain words
        for (const strain of STRAIN_WORDS) {
          if (v.includes(strain)) return true;
        }
        // Multi-word identifiers like "Wild Watermelon"
        const words = v.split(/\s+/);
        for (const word of words) {
          if (STRAIN_WORDS.includes(word)) return true;
        }
        return false;
      };

      const dropPart = (p: string) => {
        const v = p.toLowerCase().trim();
        if (!v) return true;
        
        // NEVER drop important identifiers like "Ion", "Twisted", "Wild Watermelon"
        if (isImportantIdentifier(p)) return false;
        
        if (v.includes('super fog')) return true;
        // Only drop standalone "bag"/"sleeve", not "Ion" which is a product line!
        if (/^(bag|bags|sleeve|sleeves)$/i.test(v)) return true;
        if (/^e\d+(?:\.\d+)?/.test(v)) return true; // e2.5, e3.0, etc
        if (/\d+(?:\.\d+)?\s*g/.test(v)) return true; // 2g, 1g, 2.5g
        if (/\(\s*\d+\s*x\s*\d+(?:\.\d+)?\s*g\s*\)/.test(v)) return true; // (1 x 2g)
        // Generic flavor CATEGORIES (not specific flavors) - be careful not to remove strain names
        if (/^(citrus|dessert|sweet|fruity|earthy|gas)$/i.test(v)) return true;
        // Strain type indicators
        if (/^(sat|hyb|ind|sativa|hybrid|indica|tbd)$/i.test(v)) return true;
        // Drop state codes
        if (/^(az|wa|md|mo|ca|or|ny|nj|il|co|nv|mi|ma|pa|tx|fl)$/i.test(v)) return true;
        // Drop size codes like "XL", "SM", "LG", "XXL", "E2.5 XL"
        if (/^(xs|sm|md|lg|xl|xxl|xxxl)$/i.test(v)) return true;
        if (/^e\d+(?:\.\d+)?\s*(xs|sm|md|lg|xl|xxl|xxxl)$/i.test(v)) return true;
        // Drop multiplier patterns like "1 x 2g"
        if (/^\d+\s*x\s*\d+/i.test(v)) return true;
        return false;
      };

      return parts.filter(p => !dropPart(p));
    };

    const extractMeaningfulTokensFromPoLine = (rawName: string): string[] => {
      const kept = extractMeaningfulPartsFromPoLine(rawName);
      // If nothing kept, fall back to full tokenization (still better than nothing)
      return kept.length ? tokenize(kept.join(' ')) : tokenize(rawName);
    };

    const buildVariantLabelFromPoLine = (rawName: string): string => {
      const kept = extractMeaningfulPartsFromPoLine(rawName);
      if (!kept.length) return '';

      // Keep order, uppercase, and strip weird punctuation
      return kept
        .join(' ')
        .replace(/[^A-Za-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    };

    const templateMatchesState = (t: any, state: string | null): boolean => {
      if (!state) return true;
      if (t?.state && String(t.state).toUpperCase() === state) return true;
      const toks = tokenize(t?.name || '');
      return toks.includes(state.toLowerCase());
    };

    const templateMatchesType = (t: any, poName: string): boolean => {
      const poType = detectProductType(poName);
      if (!poType) return true; // No type requirement, any template is fine
      
      const tName = t?.name || '';
      return typeMatchesTemplate(poType, tName);
    };

    const jaccardScore = (a: string[], b: string[]): number => {
      const sa = new Set(a);
      const sb = new Set(b);
      const inter = [...sa].filter(x => sb.has(x)).length;
      const union = new Set([...sa, ...sb]).size;
      return union === 0 ? 0 : inter / union;
    };

    // Measures "did we cover all the important tokens from the PO line?"
    // This is better than Jaccard for cases like:
    //   PO tokens: [fire, atf]
    //   Template tokens: [az, sleeve, fire, atf]
    // Jaccard=0.5 but coverage=1.0 (which is what we want).
    const coverageScore = (needles: string[], haystack: string[]): number => {
      const n = new Set(needles);
      const h = new Set(haystack);
      const inter = [...n].filter(x => h.has(x)).length;
      return n.size === 0 ? 0 : inter / n.size;
    };

    const bestTemplateByName = (wantedName: string, state: string | null): any | null => {
      const wanted = normalizeLoose(wantedName);
      if (!wanted) return null;

      let best: { t: any; score: number } | null = null;
      for (const t of (templates || [])) {
        if (!templateMatchesState(t, state)) continue;
        const cand = normalizeLoose(t.name);
        // Strong preference for near-equality/containment
        let score = 0;
        if (cand === wanted) score = 1;
        else if (cand.includes(wanted) || wanted.includes(cand)) score = 0.85;
        else score = jaccardScore(tokenize(wanted), tokenize(cand));

        if (!best || score > best.score) best = { t, score };
      }

      if (!best) return null;
      // Guardrail: avoid random matches
      if (best.score < 0.5) return null;
      return best.t;
    };

    const bestTemplateByPoLine = (poName: string, state: string | null): any | null => {
      const poTokens = extractMeaningfulTokensFromPoLine(poName);
      if (poTokens.length === 0) return null;

      let best: { t: any; score: number; coverage: number } | null = null;

      for (const t of (templates || [])) {
        if (!templateMatchesState(t, state)) continue;
        if (!templateMatchesType(t, poName)) continue;

        const tTokens = tokenize(t.name);
        const coverage = coverageScore(poTokens, tTokens);
        const jacc = jaccardScore(poTokens, tTokens);

        // Primary signal: coverage. Tie-breaker: jaccard.
        const score = coverage * 0.9 + jacc * 0.1;

        if (!best || score > best.score) best = { t, score, coverage };
      }

      if (!best) return null;

      // For short token lists (like "fire atf"), we need 100% coverage.
      // For longer lists, allow some slack.
      const minCoverage = poTokens.length <= 2 ? 1.0 : (poTokens.length <= 4 ? 0.75 : 0.6);
      return best.coverage >= minCoverage ? best.t : null;
    };

    // Analyze with Lovable AI to extract products
    console.log('Sending to AI for product extraction...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing purchase orders and extracting product information. You also match products to existing templates when possible.'
          },
          {
            role: 'user',
             content: `Analyze this content and extract ALL product/item information. For each product found, extract:

1. name: The product name/description as shown in the PO
2. description: Additional description if available
3. state: The US state code if mentioned (e.g., "WA", "CA", "OR", "MO", "AZ") - often embedded in SKU or product name
4. cost: The unit price/rate as a decimal number (if available)
5. product_type: Infer from context (e.g., "packaging", "label", "bag", "box", "jar", "sleeve", etc.)
6. suggested_template: Match to one of the existing templates below


${analysisHint ? `
***** CRITICAL: USER-PROVIDED MATCHING INSTRUCTIONS *****
The user has provided these EXACT instructions for how to match products. FOLLOW THEM PRECISELY:

${analysisHint}

This hint takes PRIORITY over all other matching rules below. Apply these instructions first!
*********************************************************
` : ''}

EXISTING TEMPLATES IN SYSTEM:
${templateNames}

TEMPLATE MATCHING RULES:
1. **USER HINT PRIORITY**: If the user provided a hint above, follow it EXACTLY. The user knows their products best.
2. STATE CODE: Look for 2-letter state code at the END of product names (e.g., "- AZ", "- MD", "- MO")
3. PRODUCT TYPE PATTERNS:
   - "SLEEVE" patterns = Sleeves (match to sleeve templates)
   - "BAG - Fatty - 2.5g (5 x 0.5g)" = 5pk Fatty Bags
   - "BAG - Fatty - 1g (2 x 0.5g)" = 2pk Fatty Bags  
4. COMBINE STATE + TYPE: If product ends with "- AZ" and is "SLEEVE", match to "AZ Sleeve" templates
5. MATCHING PRIORITY:
   a. Apply user hint instructions first if provided
   b. Extract state code from end of product name (after last dash)
   c. Identify product type from pattern
   d. Find template with matching state and type
6. When matching to templates, look for templates that contain the STATE and the PRODUCT TYPE
7. The state code is almost always at the VERY END after the last dash (e.g., "... - Sat - AZ" means state is AZ)

IMPORTANT:
- Extract ALL line items/products from the text
- Even simple text lists of product names should be parsed
- DO NOT include SKUs or item IDs - we will generate our own
- cost should be a number (e.g., 0.113) or null if not found
- Be thorough - don't miss any products
- For suggested_template, return the EXACT template name from the list above if you find a good match, or null if no match

CONTENT TO ANALYZE:
${extractedText}

Return ONLY valid JSON in this format:
{
  "products": [
    {
      "name": "Product Name",
      "description": "Optional description",
      "state": "XX or null",
      "cost": 0.00,
      "product_type": "packaging",
      "suggested_template": "Exact Template Name or null"
    }
  ],
  "customer_name": "Main Company Name Only or null"
}`
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('Failed to analyze with AI');
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices[0].message.content;
    console.log('Raw AI response:', content.substring(0, 500));
    
    // Remove markdown code blocks if present
    content = content.replace(/^```(?:json)?\s*\n/m, '').replace(/\n```\s*$/m, '');
    
    const extractedData = JSON.parse(content);
    console.log('Extracted products count:', extractedData.products?.length || 0);

    const hintCtx = parseAnalysisHint(analysisHint);

    // Post-process template matching so the UI can reliably pre-select templates.
    const processedProducts = (extractedData.products || []).map((p: any) => {
      const poName = String(p?.name || '');

      // STATE PRIORITY ORDER:
      // 1. PO-level state (from filename like "Purchase_Order_NY-...") - THIS IS THE PRIMARY SOURCE
      // 2. Hint-provided state (from user's analysis hint)
      // 3. Item-level state (if AI extracted it from product line)
      // 4. State embedded in product name (fallback)
      const itemState = (p?.state ? String(p.state).toUpperCase() : null) || extractStateFromName(poName);
      const state = poLevelState || hintCtx.forcedState || itemState;
      
      console.log(`[state-resolution] PO-level: ${poLevelState}, hint: ${hintCtx.forcedState}, item: ${itemState}, final: ${state}`);

      // If the AI shortened the name and removed the type keyword (SLEEVE/BAG), re-inject it from the hint
      // so deterministic matching can still filter to the right template family.
      const poNameForType = (() => {
        if (!hintCtx.forcedType) return poName;
        const lower = poName.toLowerCase();
        if (lower.includes('sleeve') || lower.includes('bag')) return poName;
        return `${hintCtx.forcedType.toUpperCase()} - ${poName}`;
      })();

      // Tokens from the *actual* PO-derived name (not the suggested template)
      const poTokens = extractMeaningfulTokensFromPoLine(poNameForType);
      const minCoverage = poTokens.length <= 2 ? 1.0 : (poTokens.length <= 4 ? 0.75 : 0.6);

      const templatePassesCoverage = (t: any | null): boolean => {
        if (!t) return false;
        if (poTokens.length === 0) return false;
        const tTokens = tokenize(String(t.name || ''));
        const coverage = coverageScore(poTokens, tTokens);
        return coverage >= minCoverage;
      };

      // 1) If AI suggested a template name, fuzzy-match it to a real template.
      // Guardrail: ignore generic/over-broad suggestions like "AZ Sleeves" unless it actually covers the PO identifiers.
      const fromAiSuggestionRaw = p?.suggested_template
        ? bestTemplateByName(String(p.suggested_template), state)
        : null;
      const fromAiSuggestion = templatePassesCoverage(fromAiSuggestionRaw) ? fromAiSuggestionRaw : null;

      // 2) Otherwise, infer from the PO line itself.
      const inferred = bestTemplateByPoLine(poNameForType, state);

      // Prefer deterministic inference (it uses token coverage), otherwise accept a vetted AI suggestion.
      const matched = inferred || fromAiSuggestion;

      // Helpful debug logs to understand mismatches
      try {
        console.log('[template-match]', {
          poName: poName.substring(0, 140),
          state,
          poTokens,
          minCoverage,
          aiSuggested: p?.suggested_template ?? null,
          aiSuggestionAccepted: Boolean(fromAiSuggestion),
          matchedTemplate: matched?.name ?? null,
        });
      } catch (_) {
        // ignore logging issues
      }

      // Build the final product name with template prefix when matched
      let finalName = poName;
      if (matched) {
        // Extract variant label from PO line (e.g., "Fire - Blue Dream" from "BAG - Ion - Fire - Blue Dream")
        const variantLabel = buildVariantLabelFromPoLine(poName);
        // Build full name: "WA Ion Bags - Fire - Blue Dream" (Template Name + Variant)
        if (variantLabel && !variantLabel.toLowerCase().includes(matched.name.toLowerCase())) {
          // Format variant label with proper casing (Title Case)
          const formattedVariant = variantLabel
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
          finalName = `${matched.name} - ${formattedVariant}`;
        } else {
          // Variant already contains template name or is empty, just use template name + cleaned variant
          finalName = variantLabel ? `${matched.name} - ${variantLabel.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}` : matched.name;
        }
      }

      return {
        ...p,
        // Use the full product name with template prefix and variant
        name: finalName,
        state: state || p?.state || null,
        suggested_template: matched ? matched.name : (p?.suggested_template ?? null),
        template_id: matched ? matched.id : null,
      };
    });

    return new Response(JSON.stringify({
      success: true,
      products: processedProducts,
      customer_name: extractedData.customer_name || null,
      source: inputSource,
      templates: templates || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-po-products:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

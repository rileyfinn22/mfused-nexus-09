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
    // Extract and verify JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Create client with user's JWT for authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized: Invalid token');
    }

    // Create service client for operations that need elevated privileges
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { pdfPath, companyId, filename, orderType = 'pull_ship', returnProductsOnly = false, textContent, analysisHint } = await req.json();
    
    console.log(`Processing PO for company_id: ${companyId}, returnProductsOnly: ${returnProductsOnly}, hasTextContent: ${!!textContent}, hasHint: ${!!analysisHint}`);
    
    // Validate user has access to this company
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      throw new Error('Unauthorized: No user role found');
    }

    console.log(`User role: ${userRole.role}, User's company: ${userRole.company_id}`);

    // Vibe admins have access to all companies, others must match company_id
    if (userRole.role !== 'vibe_admin' && userRole.company_id !== companyId) {
      throw new Error('Unauthorized: User does not have access to this company');
    }
    console.log('Analyzing PO from path:', pdfPath || 'N/A (text input)', 'for order type:', orderType);

    let extractedText = '';
    
    // If textContent is provided, use it directly instead of parsing PDF
    if (textContent) {
      console.log('Using provided text content, length:', textContent.length);
      extractedText = textContent;
    } else if (pdfPath) {
      // Download PDF from storage
      console.log('Downloading PDF from storage...');
      const { data: pdfBlob, error: downloadError } = await supabase
        .storage
        .from('po-documents')
        .download(pdfPath);

      if (downloadError) {
        console.error('Download error:', JSON.stringify(downloadError, null, 2));
        throw new Error(`Failed to download PDF: ${downloadError.message || 'Unknown error'}`);
      }
      
      if (!pdfBlob) {
        throw new Error('No PDF data received');
      }
      
      console.log('PDF downloaded, size:', pdfBlob.size);
      
      // Convert to array buffer for PDF parsing
      const pdfArrayBuffer = await pdfBlob.arrayBuffer();
      
      // Use pdf-parse library to extract text
      console.log('Extracting text from PDF with pdf-parse...');
      
      // Import pdf-parse for Deno
      const pdfParse = (await import('npm:pdf-parse@1.1.1')).default;
      
      try {
        const pdfData = await pdfParse(new Uint8Array(pdfArrayBuffer));
        extractedText = pdfData.text;
        console.log('Successfully extracted text, length:', extractedText.length);
        console.log('First 500 chars:', extractedText.substring(0, 500));
      } catch (parseError) {
        console.error('PDF parse error:', parseError);
        extractedText = `Failed to parse PDF: ${filename}. Please enter data manually.`;
      }
    } else {
      throw new Error('Either pdfPath or textContent must be provided');
    }

    // --- Extract PO-level state from filename or document ---
    // This is the PRIMARY state source - e.g., "Purchase_Order_NY-122325-APION_4.pdf" -> "NY"
    const extractStateFromSource = (source: string, text: string): string | null => {
      const STATE_CODES_SET = new Set([
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
      ]);

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

      // Try to find PO number pattern in text like "NY-122325-APION"
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

    const poLevelState = extractStateFromSource(filename || pdfPath || '', extractedText);
    console.log(`PO-level state detected: ${poLevelState || 'none'}`);

    // --- Hint-based canonical naming (keeps AI from collapsing to generic names like "AZ Sleeves") ---
    const US_STATES = [
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
    ] as const;
    const STATE_CODES = new Set<string>(US_STATES);

    // All product types we support - ORDER MATTERS: more specific types first!
    // "ion_bag" must come before "bag" since Ion Bags are a distinct product family
    type ProductType = 'sleeve' | 'ion_bag' | 'bag' | 'pouch' | 'box' | 'tin' | 'merch_pack' | 'fatty' | 'fatty_bag_5pk' | 'fatty_bag_2pk' | 'vape_bag' | 'live_line_bag' | 'pen_pouch' | '7g_pouch' | '14g_pouch' | 'label' | 'jar' | null;
    const PRODUCT_TYPE_PATTERNS: { type: ProductType; patterns: RegExp[] }[] = [
      // Combined product families (most specific first)
      { type: 'ion_bag', patterns: [/\bion\s*bags?\b/i, /\bbag\s*-?\s*ion\b/i, /\bion\b.*\bbag\b/i, /\bbag\b.*\bion\b/i] },
      { type: 'fatty_bag_5pk', patterns: [/\bfatty.*5\s*(?:pk|pack)\b/i, /\b5\s*(?:pk|pack).*fatty\b/i, /\bfatty.*\(5\s*x/i] },
      { type: 'fatty_bag_2pk', patterns: [/\bfatty.*2\s*(?:pk|pack)\b/i, /\b2\s*(?:pk|pack).*fatty\b/i, /\bfatty.*\(2\s*x/i] },
      { type: 'vape_bag', patterns: [/\bvape\s*bags?\b/i] },
      { type: 'live_line_bag', patterns: [/\blive\s*line\s*bags?\b/i] },
      // Specific pouch types (must come before generic pouch)
      { type: 'pen_pouch', patterns: [/\bpen\s*pouch\b/i, /\bpouch\b.*\bpen\b/i] },
      { type: '7g_pouch', patterns: [/\b7g?\s*pouch\b/i, /\bpouch\b.*\b7g?\b/i, /\b7\s*g\s*pouch\b/i] },
      { type: '14g_pouch', patterns: [/\b14g?\s*pouch\b/i, /\bpouch\b.*\b14g?\b/i, /\b14\s*g\s*pouch\b/i, /\bflower.*label.*pouch\b/i] },
      // Base types
      { type: 'sleeve', patterns: [/\bsleeves?\b/i] },
      { type: 'pouch', patterns: [/\bpouch(?:es)?\b/i] },
      { type: 'bag', patterns: [/\bbags?\b/i] },
      { type: 'box', patterns: [/\bbox(?:es)?\b/i] },
      { type: 'tin', patterns: [/\btins?\b/i] },
      { type: 'jar', patterns: [/\bjars?\b/i] },
      { type: 'label', patterns: [/\blabels?\b/i] },
      { type: 'merch_pack', patterns: [/\bmerch\s*packs?\b/i, /\bmerchandise\s*packs?\b/i, /\bion\s*merch\b/i] },
      { type: 'fatty', patterns: [/\bfatty\b/i, /\bfattys\b/i, /\bfatties\b/i] },
    ];

    const detectProductType = (str: string): ProductType => {
      if (!str) return null;
      for (const { type, patterns } of PRODUCT_TYPE_PATTERNS) {
        if (patterns.some(p => p.test(str))) return type;
      }
      return null;
    };

    // Map product type to template name pattern for matching
    const typeToTemplatePattern = (type: ProductType): string | null => {
      const map: Record<string, string> = {
        'ion_bag': 'ion bags',
        'fatty_bag_5pk': '5pk fatty bags',
        'fatty_bag_2pk': '2pk fatty bags',
        'vape_bag': 'vape bags',
        'live_line_bag': 'live line bags',
        'pen_pouch': 'pen pouch',
        '7g_pouch': '7g pouch',
        '14g_pouch': '14g pouch',
        'sleeve': 'sleeve',
        'pouch': 'pouch',
        'bag': 'bag',
        'box': 'box',
        'tin': 'tin',
        'jar': 'jar',
        'label': 'label',
        'merch_pack': 'merch pack',
        'fatty': 'fatty',
      };
      return map[type || ''] || null;
    };
    
    // Check if two product types are compatible (e.g., bag and pouch are often used interchangeably)
    const areTypesCompatible = (type1: ProductType, type2: ProductType): boolean => {
      if (!type1 || !type2) return true; // No type = compatible with anything
      if (type1 === type2) return true; // Exact match
      
      // Define type equivalence groups - bag/pouch are HIGHLY interchangeable in cannabis packaging
      const bagPouchTypes = ['bag', 'pouch', '7g_pouch', '14g_pouch'];
      const penPouchTypes = ['pen_pouch', 'pouch'];
      
      // Generic bag and pouch variants are fully compatible (7G Bag = 7G Pouch in practice)
      if (bagPouchTypes.includes(type1) && bagPouchTypes.includes(type2)) return true;
      
      // Pen pouch is compatible with generic pouch
      if (penPouchTypes.includes(type1) && penPouchTypes.includes(type2)) return true;
      
      // ion_bag matches bag/pouch types
      if (type1 === 'ion_bag' && (type2 === 'bag' || type2 === 'pouch')) return true;
      if (type2 === 'ion_bag' && (type1 === 'bag' || type1 === 'pouch')) return true;
      
      return false;
    };

    const parseAnalysisHint = (hint: string | undefined | null): { forcedState: string | null; forcedType: ProductType } => {
      if (!hint) return { forcedState: null, forcedType: null };

      const upper = String(hint).toUpperCase();
      const foundStates = Array.from(new Set((upper.match(/\b[A-Z]{2}\b/g) || []).filter(s => STATE_CODES.has(s))));
      const forcedState = foundStates.length === 1 ? foundStates[0] : null;
      const forcedType = detectProductType(hint);

      return { forcedState, forcedType };
    };

    // Extract state from any string (beginning, end, or standalone)
    const extractStateFromAny = (str: string): string | null => {
      if (!str) return null;
      // Look for state codes at beginning, end, or as standalone word
      const matches = str.toUpperCase().match(/\b([A-Z]{2})\b/g) || [];
      for (const m of matches) {
        if (STATE_CODES.has(m)) return m;
      }
      return null;
    };

    // Extract type from any string
    const extractTypeFromAny = (str: string): ProductType => {
      return detectProductType(str);
    };

    // IMPORTANT: These are key product line identifiers that must NEVER be dropped
    const IMPORTANT_PRODUCT_LINES = ['ion', 'fatty', 'vape', 'live', 'line', 'fire', 'atf', 'anthos', 'frx', 'rebel', 'cc'];
    
    // Color variants - CRITICAL for matching different color products
    const COLOR_WORDS = ['blue', 'green', 'orange', 'red', 'purple', 'pink', 'black', 'white', 'yellow', 'gold', 'silver', 'brown', 'grey', 'gray'];
    
    // Common strain/flavor words that should be kept
    const STRAIN_WORDS = [
      'twisted', 'wild', 'watermelon', 'watermellon', 'strawberry', 'lemon', 'grape',
      'mango', 'blueberry', 'cherry', 'orange', 'apple', 'peach', 'melon', 'banana',
      'pineapple', 'raspberry', 'blackberry', 'mint', 'vanilla', 'chocolate', 'coffee',
      'og', 'kush', 'haze', 'diesel', 'cookies', 'gelato', 'runtz', 'zkittlez',
      'widow', 'dream', 'jack', 'gorilla', 'glue', 'cake', 'biscotti', 'sherbet'
    ];

    const isImportantToken = (t: string): boolean => {
      const v = t.toLowerCase().trim();
      // Check if it's a known product line
      if (IMPORTANT_PRODUCT_LINES.includes(v)) return true;
      // Check if it's a color word - CRITICAL for matching color variants
      if (COLOR_WORDS.includes(v)) return true;
      // Check if it's a strain word
      if (STRAIN_WORDS.includes(v)) return true;
      return false;
    };

    // Extract meaningful identifier tokens (strain names, brand names, etc.)
    // Drops: state codes, sizes, weights, flavor categories - but KEEPS product line identifiers!
    const extractIdentifierTokens = (rawName: string): string[] => {
      const parts = (rawName || '').split(/[\s\-–—,;:]+/).map(p => p.trim().toLowerCase()).filter(Boolean);

      const dropToken = (t: string): boolean => {
        if (t.length < 2) return true;
        
        // NEVER drop important tokens like "ion", "twisted", "wild", "watermelon"
        if (isImportantToken(t)) return false;
        
        // State codes
        if (t.length === 2 && STATE_CODES.has(t.toUpperCase())) return true;
        // Only drop standalone type keywords, NOT product line identifiers like "ion", "fire", "twisted"
        if (/^(sleeve|sleeves|bag|bags|box|boxes|tin|tins|merch|pack|packs)$/.test(t)) return true;
        // Size codes
        if (/^(xs|sm|md|lg|xl|xxl|xxxl)$/.test(t)) return true;
        // Weight patterns
        if (/^\d+(?:\.\d+)?g?$/.test(t)) return true;
        // E-size codes like e2.5
        if (/^e\d+(?:\.\d+)?/.test(t)) return true;
        // Generic flavor categories (not strain names!)
        if (/^(citrus|dessert|sweet|fruity|earthy|gas)$/.test(t)) return true;
        // Strain type indicators
        if (/^(sat|sativa|hyb|hybrid|ind|indica|tbd)$/.test(t)) return true;
        // Common noise that isn't product-identifying
        if (/^(super|fog|cart|cartridge|pre|roll|preroll)$/.test(t)) return true;
        // Multipliers like "1x", "2x"
        if (/^\d+x$/.test(t)) return true;
        // Parenthetical content
        if (/^\(.*\)$/.test(t)) return true;
        return false;
      };

      return parts.filter(p => !dropToken(p));
    };

    // Type label mapping for canonical names  
    const typeToLabel = (type: ProductType): string => {
      const map: Record<string, string> = {
        'sleeve': 'Sleeve',
        'ion_bag': 'Ion Bags',
        'bag': 'Bag',
        'pouch': 'Pouch',
        'pen_pouch': 'Pen Pouch',
        '7g_pouch': '7G Pouch',
        '14g_pouch': '14G Pouch',
        'box': 'Box',
        'tin': 'Tin',
        'jar': 'Jar',
        'label': 'Label',
        'merch_pack': 'Merch Pack',
        'fatty': 'Fatty',
        'fatty_bag_5pk': '5pk Fatty Bags',
        'fatty_bag_2pk': '2pk Fatty Bags',
        'vape_bag': 'Vape Bags',
        'live_line_bag': 'Live Line Bags',
      };
      return map[type || ''] || type || '';
    };

    const buildVariantLabelFromPoLine = (rawName: string): string => {
      const tokens = extractIdentifierTokens(rawName);
      if (!tokens.length) return '';
      // Capitalize each token
      return tokens.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
    };

    const canonicalizeItemNameFromHint = (rawLine: string, hint: string | undefined | null): string | null => {
      const ctx = parseAnalysisHint(hint);
      // Try to get state from hint, fallback to extracting from raw line
      const state = ctx.forcedState || extractStateFromAny(rawLine);
      // Try to get type from hint, fallback to extracting from raw line
      const type = ctx.forcedType || extractTypeFromAny(rawLine);

      if (!state || !type) return null;

      const variant = buildVariantLabelFromPoLine(rawLine);
      if (!variant) return null;

      return `${state} ${typeToLabel(type)} - ${variant}`;
    };

    // Analyze with Lovable AI
    console.log('Sending to AI for analysis...');

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
            content: 'You are an expert at analyzing purchase orders. Use reasoning to understand document structure.'
          },
          {
            role: 'user',
            content: `You are an expert at analyzing purchase orders and product lists. Extract data carefully.

ANALYSIS INSTRUCTIONS:

1. IDENTIFY THE STRUCTURE:
The input may be a formal PO table OR a simple text list of products. Adapt accordingly.

For formal POs with tables, look for columns like:
- Item/SKU/Product Code: Contains the SKU NUMBER
- Description/Product Name: Contains the PRODUCT NAME
- Qty/Quantity: Numeric quantities
- Rate/Unit Price: Price per unit (extract as decimal number)

For simple text lists, each line typically contains:
- Product identifier/name
- Quantity (often at end after a dash or colon)

2. FOR EACH LINE ITEM, EXTRACT:
- sku: The SKU code if present
- item_id: Same as sku
- name: The FULL product name/description as shown in the PO (do NOT replace it with a category like "AZ Sleeves")
- description: If you normalize/shorten the name for matching, put the ORIGINAL raw PO line here; otherwise null
- quantity: The numeric quantity
- unit_price: The rate/price per unit - MUST be a decimal number

CRITICAL:
- Return ONE item per PO line item. Do NOT merge/aggregate items.
- Do NOT output generic names like "AZ Sleeves" / "WA Sleeves".
- Preserve key identifiers like "Fire" and "ATF" in either name or description so matching can work.

CRITICAL FOR STATE-BASED PRODUCTS:
If the input groups products by state (like "AZ", "WA", "NY", "MD"), you MUST include the state in the name.
For example, if you see:
AZ
Red Card - Vape 2g - Sleeve - 8000

Extract as:
{
  "name": "Red Card - Vape 2g - Sleeve - AZ",  // Include state!
  "quantity": 8000
}

3. PRODUCT TYPE KEYWORDS TO PRESERVE:
- "Sleeve" or "Sleeves" = sleeve/cartridge packaging
- "Ion" = Ion vape products
- "Fatty" or "Fattys" = Fatty pre-roll products
- "Bag" = bag packaging
Keep these in the name for matching.

4. FOR ORDER INFO:
- po_number: Look for "PO #", "Order #"
- po_total: The GRAND TOTAL / TOTAL amount shown on the PO document (as a number, e.g. 1234.56). Look for "Total", "Grand Total", "Amount Due", etc.
- due_date: Format as YYYY-MM-DD if found
- customer_name: Customer/Vendor name

${analysisHint ? `5. ADDITIONAL CONTEXT FROM USER:\n${analysisHint}\n\nThis context is CRITICAL - follow it exactly for product naming and matching.\n` : ''}
PURCHASE ORDER TEXT:
${extractedText}

CRITICAL: unit_price MUST be a number (0.218), NOT a string or formatted currency ("$0.218")

Return ONLY valid JSON:
{
  "po_number": "...",
  "po_total": 0.0,
  "customer_name": "...",
  "customer_email": null,
  "customer_phone": null,
  "shipping_name": "...",
  "shipping_street": "...",
  "shipping_city": "...",
  "shipping_state": "XX",
  "shipping_zip": "...",
  "billing_name": null,
  "billing_street": null,
  "billing_city": null,
  "billing_state": null,
  "billing_zip": null,
  "due_date": "YYYY-MM-DD",
  "memo": null,
  "items": [
    {"sku": "...", "item_id": "...", "name": "...", "description": null, "quantity": 0, "unit_price": 0.0}
  ]
}`
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('Failed to analyze with AI');
    }

    const aiData = await aiResponse.json();
    
    // Strip markdown code blocks if present
    let content = aiData.choices[0].message.content;
    console.log('Raw AI response:', content.substring(0, 200));
    
    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    content = content.replace(/^```(?:json)?\s*\n/m, '').replace(/\n```\s*$/m, '');
    
    const extractedData = JSON.parse(content);
    console.log('Extracted data:', JSON.stringify(extractedData, null, 2));

    // Hint-based normalization pass: if the hint implies a canonical naming convention like
    // "AZ Sleeve - FIRE ATF", compute it from the raw PO line so matching does not collapse
    // to generic buckets like "AZ Sleeves".
    if (extractedData?.items && Array.isArray(extractedData.items) && analysisHint) {
      const before = extractedData.items.slice(0, 5).map((i: any) => i?.name);

      extractedData.items = extractedData.items.map((item: any) => {
        const name = String(item?.name || '');
        const desc = item?.description ? String(item.description) : '';
        const rawLine = desc || name;

        const canonical = canonicalizeItemNameFromHint(rawLine, analysisHint);
        if (!canonical) return item;

        // Preserve the raw PO line for troubleshooting / later reference.
        return {
          ...item,
          description: item?.description ?? name ?? null,
          name: canonical,
        };
      });

      const after = extractedData.items.slice(0, 5).map((i: any) => i?.name);
      console.log('[hint-normalize]', {
        hint: String(analysisHint).substring(0, 140),
        sample_before: before,
        sample_after: after,
      });
    }
    
    // Log first few items with prices
    if (extractedData.items && extractedData.items.length > 0) {
      console.log('First item details:', JSON.stringify(extractedData.items[0], null, 2));
      console.log('Unit price type:', typeof extractedData.items[0].unit_price);
      console.log('Unit price value:', extractedData.items[0].unit_price);
    }


    // Fetch products to try matching SKUs and names
    console.log(`\n========== FETCHING PRODUCTS ==========`);
    console.log(`Querying products with company_id: ${companyId}`);
    
    const { data: products, error: productsError } = await supabase
      .from('products')
      // Include template name so matching can use template identity (brand/line) even when product name is a color variant.
      .select('id, item_id, name, description, preferred_vendor_id, cost, state, template_id, product_templates(name)')
      .eq('company_id', companyId);

    if (productsError) {
      console.error('Error fetching products:', productsError);
    }

    console.log(`Found ${products?.length || 0} products for matching`);

    // Function to find matching product using State + Type + Identifiers
    // Returns the full product object (not just ID) so we can access vendor_id, cost, etc.
    const findMatchingProduct = (poItem: any, hintCtx?: { forcedState: string | null; forcedType: ProductType }) => {
      if (!products || products.length === 0) {
        console.log('No products available for matching');
        return null;
      }

      const poItemId = poItem.item_id || '';
      const poSku = poItem.sku || '';
      const poName = poItem.name || '';
      const poDesc = poItem.description || '';
      const rawLine = poDesc || poName; // Use description if available (often has original PO line)

      console.log(`\n========== MATCHING ATTEMPT ==========`);
      console.log(`PO: "${poName}"`);

      // Helper to normalize strings for exact matching
      const normalize = (str: string): string => {
        if (!str) return '';
        return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      };

      // STEP 0: Try exact/alphanumeric name match first (fast path)
      // Match against product name OR template name.
      const exactMatch = products.find((p: any) => {
        const productName = p?.name || '';
        const templateName = p?.product_templates?.name || '';
        return (
          (productName && normalize(productName) === normalize(poName)) ||
          (templateName && normalize(templateName) === normalize(poName))
        );
      });
      if (exactMatch) {
        console.log(`✓ EXACT MATCH: "${poName}" -> "${exactMatch.name}"`);
        return exactMatch;
      }

      // STEP 1: Extract State, Type, and Identifier tokens from PO item
      // STATE PRIORITY ORDER:
      // 1. PO-level state (from filename like "Purchase_Order_NY-...") - THIS IS THE PRIMARY SOURCE
      // 2. Hint-provided state (from user's analysis hint)
      // 3. State extracted from the item line itself (fallback)
      const poState = poLevelState || hintCtx?.forcedState || extractStateFromAny(rawLine) || extractStateFromAny(poName);
      const poType = hintCtx?.forcedType || extractTypeFromAny(rawLine) || extractTypeFromAny(poName);
      const poTokens = extractIdentifierTokens(rawLine);

      console.log(`  PO-level state: ${poLevelState}, Hint state: ${hintCtx?.forcedState}, Final state: ${poState || 'none'}, Type: ${poType || 'none'}, Tokens: [${poTokens.join(', ')}]`);

      if (!poState && !poType && poTokens.length === 0) {
        console.log(`  No state/type/tokens extracted, falling back to fuzzy match`);
      }

      // STEP 2: Score each product based on State + Type + Token overlap + Brand
      let bestMatch: typeof products[0] | null = null;
      let bestScore = 0;

      for (const p of products as any[]) {
        if (!p?.name) continue;

        let score = 0;
        const templateName = p?.product_templates?.name || '';
        const productTextForMatch = `${p.name || ''} ${templateName}`.trim();

        const productState = p.state?.toUpperCase() || extractStateFromAny(productTextForMatch);
        const productType = extractTypeFromAny(productTextForMatch);
        const productTokens = extractIdentifierTokens(productTextForMatch);

        // State matching (required if PO has state)
        if (poState) {
          if (productState?.toUpperCase() === poState.toUpperCase()) {
            score += 30; // Strong boost for state match
          } else if (productState) {
            continue; // Wrong state = skip this product entirely
          }
        }

        // Type matching - must be compatible types (using improved areTypesCompatible function)
        if (poType) {
          if (areTypesCompatible(poType, productType)) {
            score += productType === poType ? 25 : 15; // Full boost for exact, partial for compatible
          } else {
            continue; // Incompatible type = skip this product entirely
          }
        }
        
        // Extra boost for specific type matches (pen_pouch vs 7g_pouch differentiation)
        if (poType && productType && poType === productType) {
          score += 10; // Extra boost for exact type match
        }

        // Brand/product line matching - CRITICAL for correct matching
        // Check if the key brand identifiers match (anthos, frx, rebel, cc, etc.)
        const poBrands = poTokens.filter(t => IMPORTANT_PRODUCT_LINES.includes(t.toLowerCase()));
        const productBrands = productTokens.filter(t => IMPORTANT_PRODUCT_LINES.includes(t.toLowerCase()));
        
        if (poBrands.length > 0) {
          // ALL PO brand tokens must match — prevents "Fire ATF" matching a product with just "Fire"
          const allBrandsMatch = poBrands.every(pb => productBrands.includes(pb));
          const anyBrandMatch = poBrands.some(pb => productBrands.includes(pb));
          if (allBrandsMatch) {
            score += 40; // STRONG boost for matching all brands
            console.log(`    Brand match (all): ${poBrands.join(',')} matches ${productBrands.join(',')}`);
          } else if (anyBrandMatch && productBrands.length > 0) {
            // Partial brand match — some overlap but not complete. Penalise rather than skip
            // to allow it as a last-resort candidate, but strongly prefer full matches.
            score -= 20;
            console.log(`    Brand PARTIAL match: PO wants ${poBrands.join(',')} but product only has ${productBrands.join(',')}`);
          } else if (productBrands.length > 0) {
            // No brand overlap at all — skip
            console.log(`    Brand MISMATCH (skipping): PO wants ${poBrands.join(',')} but product is ${productBrands.join(',')}`);
            continue;
          } else {
            // PO has a brand but product doesn't — allow, but don't boost.
            score -= 10;
          }
        }

        // Token matching - this is the key differentiator (excluding brands already counted)
        const poNonBrandTokens = poTokens.filter(t => !IMPORTANT_PRODUCT_LINES.includes(t.toLowerCase()));
        const productNonBrandTokens = productTokens.filter(t => !IMPORTANT_PRODUCT_LINES.includes(t.toLowerCase()));
        
        if (poNonBrandTokens.length > 0 && productNonBrandTokens.length > 0) {
          const matchingTokens = poNonBrandTokens.filter(pt => productNonBrandTokens.includes(pt));
          const tokenCoverage = matchingTokens.length / Math.max(productNonBrandTokens.length, 1);
          const tokenScore = matchingTokens.length * 10 + (tokenCoverage * 20);
          score += tokenScore;
          
          // Extra boost for color matches - colors are critical for variant differentiation
          const poColors = poTokens.filter(t => COLOR_WORDS.includes(t.toLowerCase()));
          const productColors = productTokens.filter(t => COLOR_WORDS.includes(t.toLowerCase()));
          if (poColors.length > 0 && productColors.length > 0) {
            const colorMatch = poColors.some(pc => productColors.includes(pc));
            if (colorMatch) {
              score += 25; // Strong boost for matching color
              console.log(`    Color match: ${poColors.join(',')} matches ${productColors.join(',')}`);
            } else {
              score -= 40; // Strong penalty for mismatched color - wrong color variant
              console.log(`    Color MISMATCH: PO wants ${poColors.join(',')} but product is ${productColors.join(',')}`);
            }
          } else if (productColors.length > 0 && poColors.length === 0) {
            // Product has a specific color but PO doesn't specify.
            // Prefer non-color (base) products for ambiguous POs.
            score -= 20;
          }
        } else if (productNonBrandTokens.length > 0 && poNonBrandTokens.length === 0) {
          // PO has no extra tokens but product does - slight penalty
          score -= 5;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = p;
          console.log(`  Candidate: "${p.name}" (score: ${score})`);
        }
      }

      // Require minimum score threshold
      if (bestMatch && bestScore >= 30) {
        console.log(`✓ SMART MATCH: "${poName}" -> "${bestMatch.name}" (score: ${bestScore})`);
        return bestMatch;
      }

      // STEP 3: Fallback - Try exact match on item_id/SKU
      if (poItemId || poSku) {
        const idToMatch = poItemId || poSku;
        const idNorm = String(idToMatch || '').toLowerCase().trim();

        // Guard: AI sometimes puts color words in SKU. Don't use that as an ID match.
        if (!idNorm || idNorm.length < 3 || COLOR_WORDS.includes(idNorm)) {
          console.log(`  Skipping item_id/SKU match (not an ID): "${idToMatch}"`);
        } else {
          console.log(`  Trying item_id/SKU match: "${idToMatch}"`);
        const match = products.find(p => 
          p.item_id && p.item_id.toLowerCase().trim() === idToMatch.toLowerCase().trim()
        );
        if (match) {
          console.log(`✓ ITEM_ID MATCH: "${idToMatch}" -> "${match.name}"`);
          return match;
        }
        }
      }

      console.log(`✗ NO MATCH for: "${poName}"`);
      console.log(`  Sample products: ${products.slice(0, 3).map(p => p.name).join(', ')}`);
      return null;
    };

    // If returnProductsOnly is true, just return the extracted items with product matching
    // This is used when combining multiple POs into a single order
    if (returnProductsOnly) {
      console.log('returnProductsOnly mode - returning extracted items without creating order');
      
      // Parse hint for matching context
      const hintCtx = parseAnalysisHint(analysisHint);
      
      const matchedItems = (extractedData.items || []).map((item: any) => {
        const matchedProduct = findMatchingProduct(item, hintCtx);
        return {
          product_id: matchedProduct?.id || null,
          sku: item.sku || 'UNKNOWN',
          name: item.name || item.description || 'Unknown Item',
          description: matchedProduct?.description || item.description || null,
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          item_id: matchedProduct?.item_id || item.sku || null,
          vendor_id: matchedProduct?.preferred_vendor_id || null,
          vendor_cost: matchedProduct?.cost || null,
        };
      });
      
      console.log(`Returning ${matchedItems.length} items, ${matchedItems.filter((i: any) => i.product_id).length} matched`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          items: matchedItems,
          poNumber: extractedData.po_number || null,
          customerName: extractedData.customer_name || null,
          shippingAddress: {
            name: extractedData.shipping_name,
            street: extractedData.shipping_street,
            city: extractedData.shipping_city,
            state: extractedData.shipping_state,
            zip: extractedData.shipping_zip,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate sequential order number by finding the max existing order number
    const { data: maxOrderData } = await supabase
      .from('orders')
      .select('order_number')
      .order('created_at', { ascending: false })
      .limit(100);
    
    let orderNum = 10703; // Starting number (after existing Mfused orders)
    if (maxOrderData && maxOrderData.length > 0) {
      // Find the highest numeric order number
      for (const order of maxOrderData) {
        const orderNumStr = order.order_number;
        // Extract trailing digits from order number
        const match = orderNumStr.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num >= orderNum) {
            orderNum = num + 1;
          }
        }
      }
    }
    const orderNumber = String(orderNum);

    // Calculate totals - no tax for pull_ship orders
    let subtotal = 0;
    if (extractedData.items && Array.isArray(extractedData.items)) {
      subtotal = extractedData.items.reduce((sum: number, item: any) => {
        return sum + ((item.quantity || 0) * (item.unit_price || 0));
      }, 0);
    }
    const tax = 0; // No tax on pull & ship orders
    const total = subtotal;

    // Create order with the specified order_type
    const orderStatus = orderType === 'pull_ship' ? 'pending_pull' : 'draft';
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        company_id: companyId,
        order_number: orderNumber,
        order_type: orderType,
        po_number: extractedData.po_number || null,
        po_pdf_path: pdfPath,
        customer_name: extractedData.customer_name || 'Unknown Customer',
        customer_email: extractedData.customer_email || null,
        customer_phone: extractedData.customer_phone || null,
        shipping_name: extractedData.shipping_name || extractedData.customer_name || 'Unknown',
        shipping_street: extractedData.shipping_street || '',
        shipping_city: extractedData.shipping_city || '',
        shipping_state: extractedData.shipping_state || '',
        shipping_zip: extractedData.shipping_zip || '',
        billing_name: extractedData.billing_name || extractedData.customer_name,
        billing_street: extractedData.billing_street || extractedData.shipping_street,
        billing_city: extractedData.billing_city || extractedData.shipping_city,
        billing_state: extractedData.billing_state || extractedData.shipping_state,
        billing_zip: extractedData.billing_zip || extractedData.shipping_zip,
        due_date: extractedData.due_date || null,
        memo: extractedData.memo || `Pull & Ship order from PO: ${filename}`,
        subtotal,
        tax,
        total,
        status: orderStatus,
        terms: 'Net 30'
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      throw new Error('Failed to create order');
    }

    // Create order items with product matching
    if (extractedData.items && Array.isArray(extractedData.items)) {
      // Parse hint for matching context
      const hintCtx = parseAnalysisHint(analysisHint);
      
      const orderItems = extractedData.items.map((item: any) => {
        const matchedProduct = findMatchingProduct(item, hintCtx);
        
        // ALWAYS use PO unit_price, never pull from product cost
        const unitPrice = item.unit_price || 0;
        const quantity = item.quantity || 1;
        
        console.log(`Item "${item.name}": unit_price=${item.unit_price}, type=${typeof item.unit_price}`);
        
        // If product matched, use its full identity including vendor assignment
        const orderItem: any = {
          order_id: order.id,
          product_id: matchedProduct?.id || null,
          sku: item.sku || 'UNKNOWN',
          name: item.name || item.description || 'Unknown Item',
          description: matchedProduct?.description || item.description || null,
          quantity: quantity,
          unit_price: unitPrice, // PO price overrides product cost
          total: quantity * unitPrice,
          shipped_quantity: 0, // Initialize as 0 for new orders
          item_id: matchedProduct?.item_id || item.sku || null
        };
        
        // If product has a preferred vendor, assign it to the order item
        if (matchedProduct?.preferred_vendor_id) {
          orderItem.vendor_id = matchedProduct.preferred_vendor_id;
          orderItem.vendor_cost = matchedProduct.cost || null;
          console.log(`✓ Assigned vendor ${matchedProduct.preferred_vendor_id} to item "${item.name}"`);
        }
        
        return orderItem;
      });

      console.log(`Creating ${orderItems.length} order items, ${orderItems.filter(i => i.product_id).length} matched to products`);
      console.log('Sample order item:', JSON.stringify(orderItems[0], null, 2));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('Error creating order items:', itemsError);
        // Clean up the order since items failed
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error(`Failed to create order items: ${itemsError.message}`);
      }
      
      if (orderItems.length === 0) {
        console.warn('No items extracted from PO');
        // Clean up the order
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error('No items could be extracted from the PO. Please check the document format and try again, or create the order manually.');
      }
      
      console.log(`Successfully created ${orderItems.length} order items`);
    } else {
      console.error('No items array in extracted data');
      // Clean up the order
      await supabase.from('orders').delete().eq('id', order.id);
      throw new Error('No items found in the PO. Please verify the document format.');
    }

    console.log('Order created:', order.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        orderId: order.id,
        orderNumber: orderNumber,
        extractedData 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

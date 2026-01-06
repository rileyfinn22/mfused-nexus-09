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

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const companyId = formData.get('company_id') as string;
    const analysisHint = formData.get('analysis_hint') as string | null;

    if (!file) {
      throw new Error('No file provided');
    }

    console.log(`Analyzing PO for products, company_id: ${companyId}, file: ${file.name}, hint: ${analysisHint || 'none'}`);


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

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    
    // Use pdf-parse library to extract text
    console.log('Extracting text from PDF...');
    const pdfParse = (await import('npm:pdf-parse@1.1.1')).default;
    
    let extractedText = '';
    try {
      const pdfData = await pdfParse(new Uint8Array(arrayBuffer));
      extractedText = pdfData.text;
      console.log('Successfully extracted text, length:', extractedText.length);
    } catch (parseError) {
      console.error('PDF parse error:', parseError);
      throw new Error('Failed to parse PDF. Please ensure it is a valid PDF file.');
    }

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
            content: `Analyze this purchase order and extract ALL product/item information. For each product found, extract:

1. name: The product name/description
2. description: Additional description if available
3. state: The US state code if mentioned (e.g., "WA", "CA", "OR", "MO", "AZ") - often embedded in SKU or product name
4. cost: The unit price/rate as a decimal number
5. product_type: Infer from context (e.g., "packaging", "label", "bag", "box", "jar", "sleeve", etc.)
6. suggested_template: Match to one of the existing templates below

EXISTING TEMPLATES IN SYSTEM:
${templateNames}

${analysisHint ? `USER HINT FOR TEMPLATE MATCHING:
${analysisHint}

Use this hint to better match products to templates. The user knows their products best.
` : ''}
TEMPLATE MATCHING RULES (CRITICAL - FOLLOW STRICTLY):
1. STATE CODE: Look for 2-letter state code at the END of product names (e.g., "- MD", "- MO", "- AZ")
2. PRODUCT TYPE PATTERNS:
   - "BAG - Fatty - 2.5g (5 x 0.5g)" = 5pk Fatty Bags
   - "BAG - Fatty - 1g (2 x 0.5g)" = 2pk Fatty Bags  
   - "SLEEVE - E2.5 - 1g (1 x 1g)" = Sleeves 1G
   - "SLEEVE - E3.0" patterns = Sleeves (check gram size)
   - "BAG" with quantities = Bags
3. COMBINE STATE + TYPE: If product ends with "- MD" and is "BAG - Fatty - 2.5g (5 x 0.5g)", match to "MD 5pk Fatty Bags"
4. MATCHING PRIORITY:
   a. Extract state code from end of product name
   b. Identify product type from pattern (Fatty 5pk, Fatty 2pk, Sleeve 1G, etc.)
   c. Find template with format "[STATE] [TYPE]" (e.g., "MD 5pk Fatty Bags")
5. NEVER match to generic templates if state-specific template exists
6. The state code is almost always at the VERY END after the last dash (e.g., "... - Sat - MD" means state is MD)

IMPORTANT:
- Extract ALL line items from the PO
- DO NOT include SKUs or item IDs - we will generate our own
- cost should be a number (e.g., 0.218), not a formatted string
- Be thorough - don't miss any products
- For suggested_template, return the EXACT template name if you find a good match, or null if no match
- Pay attention to any user hints provided above for template matching
- For customer_name, extract ONLY the main company/brand name (e.g., "Mfused" not "Mfused - Arizona")

PURCHASE ORDER TEXT:
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
  "customer_name": "Main Company Name Only"
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

    return new Response(JSON.stringify({
      success: true,
      products: extractedData.products || [],
      customer_name: extractedData.customer_name || null,
      filename: file.name,
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

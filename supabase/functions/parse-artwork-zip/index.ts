import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface FileInfo {
  filename: string;
  size: number;
  extension: string;
}

interface Product {
  id: string;
  name: string;
  item_id: string | null;
  state: string | null;
  company_id: string;
}

interface MatchResult {
  filename: string;
  suggestedProductId: string | null;
  suggestedProductName: string | null;
  suggestedSku: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const zipFile = formData.get('zipFile') as File;
    const companyId = formData.get('companyId') as string;

    if (!zipFile) {
      return new Response(
        JSON.stringify({ error: 'No zip file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: 'No company ID provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing zip file: ${zipFile.name}, size: ${zipFile.size} bytes`);

    // Create Supabase client
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Fetch all products for this company
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, item_id, state, company_id')
      .eq('company_id', companyId);

    if (productsError) {
      console.error('Error fetching products:', productsError);
      throw new Error('Failed to fetch products');
    }

    console.log(`Found ${products?.length || 0} products for company`);

    // Extract zip contents
    const zipData = await zipFile.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(zipData);

    // Get all files from zip (excluding directories and hidden files)
    const files: FileInfo[] = [];
    const fileContents: { [key: string]: Uint8Array } = {};

    for (const [path, file] of Object.entries(zip.files)) {
      const zipEntry = file as JSZip.JSZipObject;
      
      // Skip directories and hidden files
      if (zipEntry.dir || path.startsWith('.') || path.startsWith('__MACOSX')) {
        continue;
      }

      // Get just the filename without directory path
      const filename = path.split('/').pop() || path;
      
      // Skip hidden files
      if (filename.startsWith('.')) {
        continue;
      }

      const extension = filename.split('.').pop()?.toLowerCase() || '';
      
      // Only include valid artwork file types
      const validExtensions = ['pdf', 'ai', 'eps', 'psd', 'jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'svg'];
      if (!validExtensions.includes(extension)) {
        continue;
      }

      // Get file contents
      const content = await zipEntry.async('uint8array');
      
      files.push({
        filename,
        size: content.length,
        extension,
      });
      
      fileContents[filename] = content;
    }

    console.log(`Extracted ${files.length} valid artwork files from zip`);

    if (files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid artwork files found in zip', files: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build product list for AI context
    const productList = products?.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.item_id,
      state: p.state,
    })) || [];

    // Use AI to match files to products
    const matchPrompt = `You are helping match artwork files to products. 

Here are the products available (each has id, name, sku, and state):
${JSON.stringify(productList, null, 2)}

Here are the artwork filenames to match:
${files.map(f => f.filename).join('\n')}

For each filename, determine which product it most likely belongs to based on:
1. Product name appearing in the filename
2. State/version appearing in the filename (like "OH", "CA", "TX" for US states)
3. SKU appearing in the filename

Return a JSON array with one object per file:
{
  "matches": [
    {
      "filename": "exact filename",
      "productId": "matching product id or null if no match",
      "confidence": "high" | "medium" | "low" | "none",
      "reason": "brief explanation"
    }
  ]
}

Rules:
- "high" confidence: Clear match on product name + state, or exact SKU match
- "medium" confidence: Partial name match or state match
- "low" confidence: Very weak match, user should verify
- "none": No reasonable match found

Return ONLY valid JSON, no other text.`;

    console.log('Calling AI for file matching...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: matchPrompt }
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('AI matching failed');
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('AI response:', aiContent);

    // Parse AI response
    let aiMatches: { matches: Array<{ filename: string; productId: string | null; confidence: string; reason: string }> };
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = aiContent;
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      aiMatches = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback: return files without matches
      aiMatches = { matches: files.map(f => ({ filename: f.filename, productId: null, confidence: 'none', reason: 'AI parsing failed' })) };
    }

    // Build final match results with product details
    const matchResults: MatchResult[] = files.map(file => {
      const aiMatch = aiMatches.matches.find(m => m.filename === file.filename);
      const matchedProduct = aiMatch?.productId ? products?.find(p => p.id === aiMatch.productId) : null;

      return {
        filename: file.filename,
        suggestedProductId: matchedProduct?.id || null,
        suggestedProductName: matchedProduct?.name || null,
        suggestedSku: matchedProduct?.item_id || null,
        confidence: (aiMatch?.confidence as 'high' | 'medium' | 'low' | 'none') || 'none',
        reason: aiMatch?.reason || 'No match found',
      };
    });

    // Encode file contents as base64 for transfer (using chunked approach for efficiency)
    const fileData: { [key: string]: string } = {};
    for (const [filename, content] of Object.entries(fileContents)) {
      // Convert Uint8Array to base64 in chunks to avoid CPU timeout
      const CHUNK_SIZE = 32768; // 32KB chunks
      let binary = '';
      for (let i = 0; i < content.length; i += CHUNK_SIZE) {
        const chunk = content.subarray(i, Math.min(i + CHUNK_SIZE, content.length));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      fileData[filename] = btoa(binary);
    }

    console.log(`Returning ${matchResults.length} match results`);

    return new Response(
      JSON.stringify({
        success: true,
        matches: matchResults,
        fileData,
        totalFiles: files.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing zip:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process zip file' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

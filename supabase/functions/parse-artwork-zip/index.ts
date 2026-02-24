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
  product_type: string | null;
  company_id: string;
}

interface MatchResult {
  filename: string;
  suggestedProductId: string | null;
  suggestedProductName: string | null;
  suggestedSku: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
  tempStoragePath?: string;
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
    const templateId = formData.get('templateId') as string | null;

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

    console.log(`Processing zip file: ${zipFile.name}, size: ${zipFile.size} bytes, templateId: ${templateId}`);

    // Create Supabase client with service role for storage access
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Fetch products filtered by template if provided
    let productQuery = supabase
      .from('products')
      .select('id, name, item_id, state, product_type, company_id')
      .eq('company_id', companyId);
    
    if (templateId) {
      productQuery = productQuery.eq('template_id', templateId);
    }

    const { data: products, error: productsError } = await productQuery;

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
    const fileEntries: { filename: string; zipEntry: JSZip.JSZipObject }[] = [];

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

      files.push({
        filename,
        size: 0, // Will be set after extraction
        extension,
      });
      
      fileEntries.push({ filename, zipEntry });
    }

    console.log(`Found ${files.length} valid artwork files in zip`);

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
      type: p.product_type,
    })) || [];

    // Use AI to match files to products
    const matchPrompt = `You are an expert at matching artwork filenames to the correct product in a packaging/merchandise catalog.

Here are the products available (each has id, name, sku, and state):
${JSON.stringify(productList, null, 2)}

Here are the artwork filenames to match:
${files.map(f => f.filename).join('\n')}

For each filename, determine which product it most likely belongs to.

CRITICAL MATCHING RULES (in priority order):
1. **Product Type MUST match.** The filename's product type (bag, pouch, sleeve, box, jar, tube, label, pen, etc.) MUST match the product name's type. NEVER match a "bag" file to a "sleeve" product or vice versa. "bag" and "pouch" are synonyms, but "bag" ≠ "sleeve" ≠ "box" ≠ "jar" ≠ "tube". If the product types don't match, return "none" confidence.
2. **Brand/product name** appearing in the filename should match the product name. Look for brand keywords (e.g. "Anthos", "FRX", "Vape") in both the filename and product name.
3. **State** appearing in the filename (like "AZ", "OH", "CA", "TX", "NY" for US states) should match the product's state field.
4. **SKU** appearing in the filename is a strong signal.
5. **Flavor/variant** names (e.g. "Blue Razz", "Mango", "Watermelon") should match if present.

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

Confidence levels:
- "high": Product type matches + clear name/brand match + state or SKU match
- "medium": Product type matches + partial name match
- "low": Product type matches but weak overall match, user should verify
- "none": Product type mismatch, no reasonable match, or not enough info to match confidently

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
    
    console.log('AI response received, parsing...');

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

    // Generate a unique batch ID for temp storage
    const batchId = crypto.randomUUID();
    const tempFolder = `temp-bulk-upload/${companyId}/${batchId}`;

    console.log(`Uploading ${fileEntries.length} files to temp storage: ${tempFolder}`);

    // Upload files to temp storage and build match results
    const matchResults: MatchResult[] = [];
    const uploadedPaths: { [filename: string]: string } = {};

    // Process files one at a time to avoid CPU overload
    for (const { filename, zipEntry } of fileEntries) {
      try {
        const content = await zipEntry.async('uint8array');
        const tempPath = `${tempFolder}/${filename}`;
        
        // Get content type based on extension
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const contentTypes: { [key: string]: string } = {
          'pdf': 'application/pdf',
          'ai': 'application/illustrator',
          'eps': 'application/postscript',
          'psd': 'image/vnd.adobe.photoshop',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'tif': 'image/tiff',
          'tiff': 'image/tiff',
          'svg': 'image/svg+xml',
        };

        const { error: uploadError } = await supabase.storage
          .from('artwork')
          .upload(tempPath, content, {
            contentType: contentTypes[ext] || 'application/octet-stream',
            upsert: true,
          });

        if (uploadError) {
          console.error(`Failed to upload ${filename}:`, uploadError);
        } else {
          uploadedPaths[filename] = tempPath;
          console.log(`Uploaded: ${filename}`);
        }
      } catch (err) {
        console.error(`Error processing ${filename}:`, err);
      }
    }

    // Build final match results with product details and temp paths
    for (const file of files) {
      const aiMatch = aiMatches.matches.find(m => m.filename === file.filename);
      const matchedProduct = aiMatch?.productId ? products?.find(p => p.id === aiMatch.productId) : null;

      matchResults.push({
        filename: file.filename,
        suggestedProductId: matchedProduct?.id || null,
        suggestedProductName: matchedProduct?.name || null,
        suggestedSku: matchedProduct?.item_id || null,
        confidence: (aiMatch?.confidence as 'high' | 'medium' | 'low' | 'none') || 'none',
        reason: aiMatch?.reason || 'No match found',
        tempStoragePath: uploadedPaths[file.filename] || null,
      });
    }

    console.log(`Returning ${matchResults.length} match results`);

    return new Response(
      JSON.stringify({
        success: true,
        matches: matchResults,
        batchId,
        tempFolder,
        totalFiles: files.length,
        uploadedFiles: Object.keys(uploadedPaths).length,
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

import { supabase } from "@/integrations/supabase/client";
import { clearCached } from "@/lib/pageCache";

export async function convertProductToTemplate(productId: string, templateName: string): Promise<string> {
  const name = templateName.trim();
  if (!name) throw new Error("Template name is required");
  const { data, error } = await supabase.rpc("convert_product_to_template", {
    p_product_id: productId,
    p_template_name: name,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The template could not be created. Please try again.");
  clearCached("products:");
  return data;
}
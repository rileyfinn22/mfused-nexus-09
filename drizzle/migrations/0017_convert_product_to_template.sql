CREATE OR REPLACE FUNCTION public.convert_product_to_template(p_product_id uuid, p_template_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_product public.products%ROWTYPE;
  v_template_id uuid;
  v_name text;
  v_cost numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'vibe_admin') THEN
    RAISE EXCEPTION 'Only VibePKG staff can convert products to templates' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_product.template_id IS NOT NULL THEN
    RETURN v_product.template_id;
  END IF;
  v_name := btrim(COALESCE(p_template_name, v_product.name));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Template name is required' USING ERRCODE = '22023';
  END IF;
  SELECT cost INTO v_cost FROM public.product_costs WHERE product_id = p_product_id;
  INSERT INTO public.product_templates (company_id, name, description, price, cost, thumbnail_url, state, brand_id, product_type)
  VALUES (v_product.company_id, v_name, v_product.description, v_product.price, v_cost, v_product.image_url, v_product.state, v_product.brand_id, v_product.product_type)
  RETURNING id INTO v_template_id;
  UPDATE public.products SET template_id = v_template_id WHERE id = p_product_id;
  RETURN v_template_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.convert_product_to_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_product_to_template(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.convert_product_to_template(uuid, text) IS 'Staff-only atomic conversion: retain the original product and its historical references as the first SKU; repeat calls return its existing template.';
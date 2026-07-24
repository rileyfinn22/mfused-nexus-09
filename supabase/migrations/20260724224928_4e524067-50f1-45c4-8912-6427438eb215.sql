
-- Helper: print-files access
CREATE OR REPLACE FUNCTION public.can_access_print_file(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[] := string_to_array(_object_name, '/');
  root text := parts[1];
  seg2 uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'vibe_admin'::app_role) OR public.has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  -- public marketing/demo assets
  IF root = 'demo' THEN
    RETURN true;
  END IF;

  BEGIN
    seg2 := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    seg2 := NULL;
  END;

  IF root = 'templates' AND seg2 IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.print_templates t
      WHERE t.id = seg2
        AND (
          t.is_global
          OR (t.company_id IS NOT NULL AND public.user_has_company_access(_user_id, t.company_id))
          OR EXISTS (
            SELECT 1 FROM public.print_template_companies ptc
            WHERE ptc.template_id = t.id
              AND public.user_has_company_access(_user_id, ptc.company_id)
          )
        )
    );
  END IF;

  IF root = 'saved-designs' AND seg2 IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.design_saves d
      WHERE d.id = seg2
        AND (d.created_by = _user_id OR public.user_has_company_access(_user_id, d.company_id))
    );
  END IF;

  IF root = 'orders' AND seg2 IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.workshop_orders w
      WHERE w.id = seg2
        AND (w.created_by = _user_id OR public.user_has_company_access(_user_id, w.company_id))
    ) OR EXISTS (
      SELECT 1 FROM public.vendors v WHERE v.user_id = _user_id
    );
  END IF;

  IF root = 'thumbnails' OR root = 'artwork' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.design_saves d
      WHERE (d.thumbnail_url LIKE '%' || _object_name OR d.print_file_url LIKE '%' || _object_name
             OR d.source_pdf_path = _object_name)
        AND (d.created_by = _user_id OR public.user_has_company_access(_user_id, d.company_id))
    ) OR EXISTS (
      SELECT 1 FROM public.print_orders po
      WHERE (po.thumbnail_url LIKE '%' || _object_name OR po.print_file_url LIKE '%' || _object_name)
        AND (po.created_by = _user_id OR public.user_has_company_access(_user_id, po.company_id))
    ) OR EXISTS (
      SELECT 1 FROM public.print_templates t
      WHERE (t.thumbnail_url LIKE '%' || _object_name OR t.source_pdf_path = _object_name)
        AND (
          t.is_global
          OR (t.company_id IS NOT NULL AND public.user_has_company_access(_user_id, t.company_id))
          OR EXISTS (
            SELECT 1 FROM public.print_template_companies ptc
            WHERE ptc.template_id = t.id AND public.user_has_company_access(_user_id, ptc.company_id)
          )
        )
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_print_file(uuid, text) FROM PUBLIC, anon, authenticated;

-- Helper: production-images access (object name is "<production_stage_id>-<timestamp>.<ext>")
CREATE OR REPLACE FUNCTION public.can_access_production_image(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text := split_part(_object_name, '/', array_length(string_to_array(_object_name, '/'), 1));
  stage_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'vibe_admin'::app_role) OR public.has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  BEGIN
    stage_id := substring(base from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')::uuid;
  EXCEPTION WHEN others THEN
    stage_id := NULL;
  END;

  IF stage_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.production_stages ps
    JOIN public.orders o ON o.id = ps.order_id
    WHERE ps.id = stage_id
      AND public.user_has_company_access(_user_id, o.company_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.production_stages ps
    JOIN public.vendors v ON v.id = ps.vendor_id
    WHERE ps.id = stage_id AND v.user_id = _user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_production_image(uuid, text) FROM PUBLIC, anon, authenticated;

-- Replace broad SELECT policies
DROP POLICY IF EXISTS "Authenticated users can view print files" ON storage.objects;
CREATE POLICY "Scoped users can view print files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'print-files' AND public.can_access_print_file(auth.uid(), name));

DROP POLICY IF EXISTS "Authenticated users can view product images" ON storage.objects;
CREATE POLICY "Scoped users can view product images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    public.has_role(auth.uid(), 'vibe_admin'::app_role)
    OR (storage.foldername(name))[1] = 'template-thumbnails'
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.user_has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can view production images" ON storage.objects;
CREATE POLICY "Scoped users can view production images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'production-images' AND public.can_access_production_image(auth.uid(), name));

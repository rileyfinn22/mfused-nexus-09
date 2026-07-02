
-- ========== STORAGE: tighten write policies ==========

-- product-images: path convention is "<company_id>/..."
DROP POLICY IF EXISTS "Users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their company product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their company product images" ON storage.objects;

CREATE POLICY "Company users can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND user_has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
    OR (storage.foldername(name))[1] = 'template-thumbnails'
  )
);

CREATE POLICY "Company users can update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND user_has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

CREATE POLICY "Company users can delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND user_has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

-- production-images: restrict uploads to vibe_admin or the assigned vendor for at least one active stage
DROP POLICY IF EXISTS "Authenticated users can upload production images" ON storage.objects;
CREATE POLICY "Admins and assigned vendors can upload production images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'production-images'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.production_stages ps
      JOIN public.vendors v ON v.id = ps.vendor_id
      WHERE v.user_id = auth.uid()
    )
  )
);

-- project-documents: require order/company ownership on INSERT
DROP POLICY IF EXISTS "Authenticated users can upload project documents" ON storage.objects;
CREATE POLICY "Company users can upload project document files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-documents'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE user_has_company_access(auth.uid(), o.company_id)
        AND (storage.foldername(name))[1] = o.id::text
    )
    OR EXISTS (
      SELECT 1 FROM public.production_stages ps
      JOIN public.vendors v ON v.id = ps.vendor_id
      WHERE v.user_id = auth.uid()
        AND (storage.foldername(name))[1] = ps.order_id::text
    )
  )
);

-- quote-documents: require access to related quote
DROP POLICY IF EXISTS "Users can upload quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete quote documents" ON storage.objects;

CREATE POLICY "Company users can upload quote document files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'quote-documents'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE user_has_company_access(auth.uid(), q.company_id)
        AND (storage.foldername(name))[1] = q.id::text
    )
  )
);

CREATE POLICY "Company users can delete quote document files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'quote-documents'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.quote_documents qd
      JOIN public.quotes q ON q.id = qd.quote_id
      WHERE qd.file_path = objects.name
        AND user_has_company_access(auth.uid(), q.company_id)
    )
  )
);

-- artwork bucket: tighten SELECT via join to artwork_files.company_id
DROP POLICY IF EXISTS "Anyone can view artwork" ON storage.objects;
CREATE POLICY "Company users can view artwork files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'artwork'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.artwork_files af
      WHERE user_has_company_access(auth.uid(), af.company_id)
        AND af.artwork_url LIKE '%/artwork/' || objects.name
    )
  )
);

-- print-files bucket: restrict SELECT to authenticated (was public)
DROP POLICY IF EXISTS "Anyone can view print files" ON storage.objects;
CREATE POLICY "Authenticated users can view print files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'print-files');

-- production-images bucket: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Production images are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated users can view production images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'production-images');

-- product-images bucket: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Users can view product images" ON storage.objects;
CREATE POLICY "Authenticated users can view product images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images');

-- ========== print_templates & print_presets ==========
DROP POLICY IF EXISTS "Authenticated users can view print templates" ON public.print_templates;
CREATE POLICY "Users can view global or assigned print templates"
ON public.print_templates FOR SELECT TO authenticated
USING (
  is_global = true
  OR has_role(auth.uid(), 'vibe_admin'::app_role)
  OR (company_id IS NOT NULL AND user_has_company_access(auth.uid(), company_id))
  OR EXISTS (
    SELECT 1 FROM public.print_template_companies ptc
    WHERE ptc.template_id = print_templates.id
      AND user_has_company_access(auth.uid(), ptc.company_id)
  )
);

DROP POLICY IF EXISTS "Anyone can read active presets" ON public.print_presets;
CREATE POLICY "Authenticated users can read active presets"
ON public.print_presets FOR SELECT TO authenticated
USING (is_active = true);

-- ========== SECURITY DEFINER function EXECUTE hardening ==========
-- Trigger-only functions (never called via API)
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_customers_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_production_stages_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_po_submissions_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_published_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_invoice_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_order_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_vendor_po_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_invoice_payment_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_vendor_po_payment_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_financed_invoice_repayment_total() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_order_item_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_template_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_vendor_po_items_shipped_qty() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_signup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_complete_order_on_progress() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_order_status_from_stages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_item_line_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_workshop_order_number() FROM PUBLIC, anon, authenticated;

-- Admin-only helpers that should never be reachable from clients
REVOKE EXECUTE ON FUNCTION public.exec_sql_admin(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_qb_token_encrypted(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_qb_token_decrypted(uuid, text) FROM PUBLIC, anon, authenticated;

-- Revoke anon access to auth-only RPCs (still callable by authenticated)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_company_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_in_company(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_company(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_companies(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vibe_admins() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_all_portal_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_company_users(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_chat_user_info(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_child_order(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_packing_list_file(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.associate_customer_with_invoice(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vendor_update_po_status(uuid, text, date, boolean, text, text) FROM anon;

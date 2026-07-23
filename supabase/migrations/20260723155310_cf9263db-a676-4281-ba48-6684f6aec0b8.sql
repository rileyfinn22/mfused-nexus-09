
-- Financed invoices: scope forwarders to companies they belong to
DROP POLICY IF EXISTS "Forwarders can view financed invoices" ON public.financed_invoices;
CREATE POLICY "Forwarders can view financed invoices"
ON public.financed_invoices FOR SELECT
USING (
  has_role(auth.uid(), 'forwarder'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = financed_invoices.invoice_id
      AND public.user_has_company_access(auth.uid(), i.company_id)
  )
);

-- Vendors: scope finance role to their own companies
DROP POLICY IF EXISTS "Finance can view vendors" ON public.vendors;
CREATE POLICY "Finance can view vendors"
ON public.vendors FOR SELECT
USING (
  has_role(auth.uid(), 'finance'::app_role)
  AND public.user_has_company_access(auth.uid(), vendors.company_id)
);

-- PO documents: require a real user_roles entry, not just any authenticated UUID folder
DROP POLICY IF EXISTS "Users can upload their own PO documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own PO documents" ON storage.objects;

CREATE POLICY "Users can upload their own PO documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'po-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
);

CREATE POLICY "Users can view their own PO documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'po-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
);

-- Reconciliation view: run with caller's permissions
ALTER VIEW public.invoice_subtotal_reconciliation SET (security_invoker = true);

-- Revoke EXECUTE on internal helpers/triggers that should not be callable from PostgREST
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'auto_complete_order_on_progress()',
    'handle_new_user_signup()',
    'log_invoice_changes()',
    'protect_published_fields()',
    'recalculate_vendor_po_totals()',
    'revert_shipped_on_child_invoice_delete()',
    'set_order_item_line_number()',
    'sync_order_item_cost()',
    'sync_product_cost()',
    'sync_product_template_cost()',
    'sync_vendor_po_items_shipped_qty()',
    'update_customers_updated_at()',
    'update_financed_invoice_repayment_total()',
    'update_invoice_payment_status()',
    'update_order_status_from_stages()',
    'update_po_submissions_updated_at()',
    'update_production_stages_updated_at()',
    'update_updated_at_column()',
    'update_vendor_po_payment_status()',
    'validate_child_invoice_subtotal()',
    'recalculate_order_totals()',
    'generate_workshop_order_number()',
    'store_qb_token_encrypted(uuid,text,text)',
    'get_qb_token_decrypted(uuid,text)',
    'exec_sql_admin(text)',
    'associate_customer_with_invoice(uuid,text)',
    'get_all_portal_users()',
    'get_chat_user_info(uuid)',
    'get_company_users(uuid)',
    'get_vibe_admins()',
    'can_view_child_order(uuid,uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;

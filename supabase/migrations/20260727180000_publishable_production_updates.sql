-- Vibe admin curates what customers see: each production note (vendor- or
-- admin-authored) can be published. Customers see published notes only.
-- Applied live via claude-admin.

ALTER TABLE public.vendor_po_production_updates
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Publishing = an UPDATE; only vibe admins may update rows.
DROP POLICY IF EXISTS "Vibe admins update production updates" ON public.vendor_po_production_updates;
CREATE POLICY "Vibe admins update production updates"
ON public.vendor_po_production_updates
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE OR REPLACE FUNCTION public.customer_po_production_detail(p_po_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when not exists (
      select 1 from public.vendor_pos p
      join public.orders o on o.id = p.order_id
      where p.id = p_po_id
        and public.user_has_company_access(auth.uid(), o.company_id)
    )
    then json_build_object('success', false, 'error', 'Not authorized')
    else (
      select json_build_object(
        'success', true,
        'production_percent', p.production_percent,
        'updates', coalesce(
          (select json_agg(json_build_object(
              'id', u.id,
              'kind', u.kind,
              'note', u.note,
              'attachment_name', u.attachment_name,
              'attachment_url', u.attachment_url,
              'percent_at_time', u.percent_at_time,
              'created_at', u.created_at
            ) order by u.created_at desc)
           from public.vendor_po_production_updates u
           where u.vendor_po_id = p.id
             and u.kind = 'update'
             and u.published_at is not null),
          '[]'::json
        )
      )
      from public.vendor_pos p where p.id = p_po_id
    )
  end;
$function$;

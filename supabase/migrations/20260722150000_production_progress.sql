-- Vendor PO detail rework: % complete progress bar + production notes with
-- attachments. Percent lives on vendor_pos; notes/attachments in a dedicated
-- table; files go to the (public) production-images bucket under vendor-updates/.

ALTER TABLE public.vendor_pos ADD COLUMN IF NOT EXISTS production_percent integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.vendor_po_production_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_po_id uuid NOT NULL REFERENCES public.vendor_pos(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  note text,
  attachment_url text,
  attachment_name text,
  percent_at_time integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_po_production_updates_po
  ON public.vendor_po_production_updates (vendor_po_id, created_at DESC);

ALTER TABLE public.vendor_po_production_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors and admins view production updates" ON public.vendor_po_production_updates;
CREATE POLICY "Vendors and admins view production updates"
ON public.vendor_po_production_updates
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.vendor_pos p
    JOIN public.vendors v ON v.id = p.vendor_id
    WHERE p.id = vendor_po_id AND v.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Vendors and admins add production updates" ON public.vendor_po_production_updates;
CREATE POLICY "Vendors and admins add production updates"
ON public.vendor_po_production_updates
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.vendor_pos p
      JOIN public.vendors v ON v.id = p.vendor_id
      WHERE p.id = vendor_po_id AND v.user_id = auth.uid()
    )
  )
);

-- Attachments: no new storage policy needed (and the admin SQL proxy can't own
-- storage.objects anyway). Files go to the existing private po-documents bucket
-- under <auth.uid()>/vendor-updates/<po_id>/ — covered by the existing
-- "Users can upload their own PO documents" INSERT policy, readable by
-- vendor/admin roles, served via signed URLs.

-- Signature changes (new param) — drop the old overload first.
DROP FUNCTION IF EXISTS public.vendor_update_po_details(uuid, text, text, text, text, text, text, text, text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.vendor_update_po_details(
  p_po_id uuid,
  p_tracking_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_notes text default null,
  p_completion_date text default null,
  p_vendor_invoice_number text default null,
  p_sheet_description text default null,
  p_ship_to_name text default null,
  p_ship_to_street text default null,
  p_ship_to_city text default null,
  p_ship_to_state text default null,
  p_ship_to_zip text default null,
  p_sheet_completed boolean default null,
  p_production_percent integer default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_synced_date date;
begin
  -- Caller must own this PO (vendor linked via vendors.user_id) or be a vibe admin.
  perform 1
  from public.vendor_pos p
  join public.vendors v on v.id = p.vendor_id
  where p.id = p_po_id and v.user_id = auth.uid();

  if not found and not public.has_role(auth.uid(), 'vibe_admin'::public.app_role) then
    return json_build_object('success', false, 'error', 'Not authorized for this PO');
  end if;

  if p_completion_date is not null and length(trim(p_completion_date)) > 0 then
    begin
      v_synced_date := trim(p_completion_date)::date;
    exception when others then
      v_synced_date := null;
    end;
  end if;

  -- Convention for every text param: null = leave as-is, '' = clear, else set.
  update public.vendor_pos set
    tracking_carrier = case when p_tracking_carrier is null then tracking_carrier
                            when p_tracking_carrier = '' then null
                            else p_tracking_carrier end,
    tracking_number  = case when p_tracking_number is null then tracking_number
                            when p_tracking_number = '' then null
                            else p_tracking_number end,
    tracking_url     = case when p_tracking_url is null then tracking_url
                            when p_tracking_url = '' then null
                            else p_tracking_url end,
    notes            = case when p_notes is null then notes
                            when p_notes = '' then null
                            else p_notes end,
    completion_date  = case when p_completion_date is null then completion_date
                            when trim(p_completion_date) = '' then null
                            else p_completion_date end,
    vendor_invoice_number = case when p_vendor_invoice_number is null then vendor_invoice_number
                                 when trim(p_vendor_invoice_number) = '' then null
                                 else p_vendor_invoice_number end,
    sheet_description = case when p_sheet_description is null then sheet_description
                             when trim(p_sheet_description) = '' then null
                             else p_sheet_description end,
    ship_to_name   = case when p_ship_to_name is null then ship_to_name
                          when p_ship_to_name = '' then null
                          else p_ship_to_name end,
    ship_to_street = case when p_ship_to_street is null then ship_to_street
                          when p_ship_to_street = '' then null
                          else p_ship_to_street end,
    ship_to_city   = case when p_ship_to_city is null then ship_to_city
                          when p_ship_to_city = '' then null
                          else p_ship_to_city end,
    ship_to_state  = case when p_ship_to_state is null then ship_to_state
                          when p_ship_to_state = '' then null
                          else p_ship_to_state end,
    ship_to_zip    = case when p_ship_to_zip is null then ship_to_zip
                          when p_ship_to_zip = '' then null
                          else p_ship_to_zip end,
    sheet_completed_at = case when p_sheet_completed is null then sheet_completed_at
                              when p_sheet_completed then coalesce(sheet_completed_at, now())
                              else null end,
    production_percent = case when p_production_percent is null then production_percent
                              else greatest(0, least(100, p_production_percent)) end,
    vendor_committed_ship_date = coalesce(v_synced_date, vendor_committed_ship_date),
    updated_at = now()
  where id = p_po_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.vendor_update_po_details(uuid, text, text, text, text, text, text, text, text, text, text, text, text, boolean, integer) to authenticated;

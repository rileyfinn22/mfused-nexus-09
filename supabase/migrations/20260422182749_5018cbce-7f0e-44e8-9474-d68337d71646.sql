ALTER TABLE public.production_stages DISABLE TRIGGER USER;

UPDATE public.production_stages
SET published_status = 'completed',
    published_at = COALESCE(published_at, now()),
    updated_at = now()
WHERE status = 'completed'
  AND published_status = 'pending'
  AND stage_name NOT IN ('estimate_sent','art_approved','deposit_paid','order_confirmed','po_sent','proof_approved','vendor_deposit');

ALTER TABLE public.production_stages ENABLE TRIGGER USER;
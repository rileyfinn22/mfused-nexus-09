-- Backfill missing stages for all existing orders
DO $$
DECLARE
  r RECORD;
  all_stages TEXT[] := ARRAY['estimate_sent','art_approved','deposit_paid','order_confirmed','po_sent','materials_ordered','pre_press','proof_approved','vendor_deposit','production_complete','in_transit','delivered'];
  s_name TEXT;
  i INT;
BEGIN
  FOR r IN SELECT DISTINCT order_id FROM production_stages LOOP
    FOR i IN 1..array_length(all_stages, 1) LOOP
      s_name := all_stages[i];
      IF NOT EXISTS (
        SELECT 1 FROM production_stages ps 
        WHERE ps.order_id = r.order_id AND ps.stage_name = s_name
      ) THEN
        INSERT INTO production_stages (order_id, stage_name, sequence_order, status)
        VALUES (r.order_id, s_name, i - 1, 'pending');
      END IF;
    END LOOP;
    -- Fix sequence_order for all stages of this order
    UPDATE production_stages ps
    SET sequence_order = idx.new_order
    FROM (
      SELECT id, 
        CASE ps2.stage_name
          WHEN 'estimate_sent' THEN 0
          WHEN 'art_approved' THEN 1
          WHEN 'deposit_paid' THEN 2
          WHEN 'order_confirmed' THEN 3
          WHEN 'po_sent' THEN 4
          WHEN 'materials_ordered' THEN 5
          WHEN 'pre_press' THEN 6
          WHEN 'proof_approved' THEN 7
          WHEN 'vendor_deposit' THEN 8
          WHEN 'production_complete' THEN 9
          WHEN 'in_transit' THEN 10
          WHEN 'delivered' THEN 11
        END as new_order
      FROM production_stages ps2
      WHERE ps2.order_id = r.order_id
    ) idx
    WHERE ps.id = idx.id;
  END LOOP;
END $$;
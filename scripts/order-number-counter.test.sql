-- Live regression check: rejects the previously observed poisoned counter.
-- Execute with a database query; raises an error if the counter is unhealthy.
SELECT 1 / CASE
  WHEN (SELECT last_value FROM public.order_number_seq) BETWEEN
       (SELECT max(order_number::bigint) FROM public.orders WHERE order_number ~ '^[0-9]{5,6}$')
       AND 999999
  THEN 1
  ELSE 0
END AS healthy_counter;
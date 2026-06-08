-- Fix 10717-05 subtotal/total: was capped to $0 by deposit double-counting bug
UPDATE public.invoices
SET subtotal = 54200, total = 54200 + COALESCE(shipping_cost,0) + COALESCE(tax,0),
    billed_percentage = NULL
WHERE id = '8ef4c02b-b2d2-4582-9f71-8415a6342bf8';

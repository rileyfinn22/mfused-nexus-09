
-- Recalculate blanket invoice totals: subtotal = sum of shipped_quantity × unit_price
-- This fixes invoices where totals were based on ordered qty instead of shipped qty
UPDATE invoices i
SET 
  subtotal = COALESCE(calc.new_subtotal, 0),
  total = COALESCE(calc.new_subtotal, 0) + COALESCE(i.tax, 0) + COALESCE(i.shipping_cost, 0)
FROM (
  SELECT 
    inv.id as invoice_id,
    SUM(COALESCE(oi.shipped_quantity, 0) * COALESCE(oi.unit_price, 0)) as new_subtotal
  FROM invoices inv
  JOIN orders o ON o.id = inv.order_id
  JOIN order_items oi ON oi.order_id = o.id
  WHERE inv.invoice_type = 'full'
    AND inv.shipment_number = 1
    AND inv.deleted_at IS NULL
  GROUP BY inv.id
) calc
WHERE i.id = calc.invoice_id
  AND i.invoice_type = 'full'
  AND i.shipment_number = 1
  AND i.deleted_at IS NULL;

-- Recalculate partial invoice totals: subtotal = sum of quantity_allocated × unit_price
UPDATE invoices i
SET 
  subtotal = COALESCE(calc.new_subtotal, 0),
  total = COALESCE(calc.new_subtotal, 0) + COALESCE(i.tax, 0) + COALESCE(i.shipping_cost, 0)
FROM (
  SELECT 
    ia.invoice_id,
    SUM(COALESCE(ia.quantity_allocated, 0) * COALESCE(oi.unit_price, 0)) as new_subtotal
  FROM inventory_allocations ia
  JOIN order_items oi ON oi.id = ia.order_item_id
  JOIN invoices inv ON inv.id = ia.invoice_id
  WHERE inv.invoice_type = 'partial'
    AND inv.deleted_at IS NULL
  GROUP BY ia.invoice_id
) calc
WHERE i.id = calc.invoice_id
  AND i.invoice_type = 'partial'
  AND i.deleted_at IS NULL;

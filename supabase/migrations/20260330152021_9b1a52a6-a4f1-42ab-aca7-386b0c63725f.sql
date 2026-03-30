-- Delete order items for Brightside orders
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE customer_name ILIKE '%brightside%'
);

-- Delete invoice audit logs
DELETE FROM invoice_audit_log WHERE invoice_id IN (
  SELECT i.id FROM invoices i JOIN orders o ON i.order_id = o.id WHERE o.customer_name ILIKE '%brightside%'
);

-- Delete invoices for Brightside orders
DELETE FROM invoices WHERE order_id IN (
  SELECT id FROM orders WHERE customer_name ILIKE '%brightside%'
);

-- Delete the Brightside orders themselves
DELETE FROM orders WHERE customer_name ILIKE '%brightside%';
-- Make product_id nullable in order_items table since PO uploads may not have matching products yet
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;
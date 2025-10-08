-- Update unit_price and total columns to support 3 decimal places
ALTER TABLE order_items 
ALTER COLUMN unit_price TYPE numeric(10,3),
ALTER COLUMN total TYPE numeric(10,3);

-- Also update orders table money columns to support 3 decimal places
ALTER TABLE orders
ALTER COLUMN subtotal TYPE numeric(10,3),
ALTER COLUMN tax TYPE numeric(10,3),
ALTER COLUMN total TYPE numeric(10,3);
-- Add new fields to products table for detailed product information
ALTER TABLE products 
ADD COLUMN product_type TEXT,
ADD COLUMN units_per_case INTEGER,
ADD COLUMN cases_per_pallet INTEGER,
ADD COLUMN weight_per_case NUMERIC,
ADD COLUMN volume_per_case NUMERIC;
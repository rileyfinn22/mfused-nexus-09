-- Add category column to vendors table
ALTER TABLE vendors ADD COLUMN category text;

-- Add check constraint to ensure category is either 'fulfillment' or 'production'
ALTER TABLE vendors ADD CONSTRAINT vendors_category_check 
  CHECK (category IN ('fulfillment', 'production'));

-- Set default category based on existing is_fulfillment_vendor flag
UPDATE vendors SET category = CASE 
  WHEN is_fulfillment_vendor = true THEN 'fulfillment'
  ELSE 'production'
END;

-- Make category NOT NULL after setting defaults
ALTER TABLE vendors ALTER COLUMN category SET NOT NULL;

-- Set default for new rows
ALTER TABLE vendors ALTER COLUMN category SET DEFAULT 'production';
-- Add artwork_type column to distinguish between customer artwork and Vibe proof
ALTER TABLE artwork_files 
ADD COLUMN artwork_type TEXT NOT NULL DEFAULT 'customer' CHECK (artwork_type IN ('customer', 'vibe_proof'));

-- Add index for better performance
CREATE INDEX idx_artwork_files_type ON artwork_files(artwork_type);

-- Add comment for documentation
COMMENT ON COLUMN artwork_files.artwork_type IS 'Type of artwork: customer (uploaded by customer) or vibe_proof (proofed/edited by Vibe)';
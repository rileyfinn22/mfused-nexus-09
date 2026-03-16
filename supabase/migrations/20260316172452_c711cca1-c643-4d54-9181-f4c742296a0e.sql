-- Soft-delete all existing stale draft orders
UPDATE orders SET deleted_at = now() WHERE status = 'draft' AND deleted_at IS NULL;
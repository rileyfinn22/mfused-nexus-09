-- Recreate pg_net so the extension itself is installed under schema "extensions" (not public)
-- pg_net's objects (net.http_*) are still created in schema "net" by the extension.

DROP EXTENSION IF EXISTS pg_net;
DROP SCHEMA IF EXISTS net CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Ensure cron runner roles can use the net schema
GRANT USAGE ON SCHEMA net TO postgres;
GRANT USAGE ON SCHEMA net TO service_role;
// Claude Code admin proxy - full backend access via single-token auth.
// SECURITY: requests authed only by x-admin-token header. Never expose token client-side.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TOKEN = Deno.env.get("CLAUDE_ADMIN_TOKEN")!;

async function pgRest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
  });
  return res;
}

async function runSql(query: string) {
  // Use Supabase Postgres Meta API via PostgREST RPC -- we expose a SECURITY DEFINER fn `exec_sql_admin`.
  const res = await pgRest(`/rest/v1/rpc/exec_sql_admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const token = req.headers.get("x-admin-token");
  if (!token || token !== ADMIN_TOKEN) return json({ error: "unauthorized" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const action = payload?.action;

  try {
    switch (action) {
      case "sql": {
        if (typeof payload.query !== "string") return json({ error: "query required" }, 400);
        const out = await runSql(payload.query);
        return json(out, out.status >= 400 ? 400 : 200);
      }

      case "storage_list": {
        const bucket = payload.bucket;
        const prefix = payload.prefix ?? "";
        const limit = payload.limit ?? 100;
        if (!bucket) return json({ error: "bucket required" }, 400);
        const r = await pgRest(`/storage/v1/object/list/${bucket}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix, limit, offset: payload.offset ?? 0 }),
        });
        return json(await r.json(), r.status);
      }

      case "storage_download": {
        const { bucket, path } = payload;
        if (!bucket || !path) return json({ error: "bucket + path required" }, 400);
        const r = await pgRest(`/storage/v1/object/${bucket}/${path}`);
        if (!r.ok) return json({ error: "download failed", status: r.status }, r.status);
        const buf = new Uint8Array(await r.arrayBuffer());
        // base64 encode
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        return json({
          content_type: r.headers.get("content-type"),
          size: buf.length,
          base64: btoa(bin),
        });
      }

      case "storage_signed_url": {
        const { bucket, path, expires_in = 3600 } = payload;
        if (!bucket || !path) return json({ error: "bucket + path required" }, 400);
        const r = await pgRest(`/storage/v1/object/sign/${bucket}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn: expires_in }),
        });
        const body = await r.json();
        if (body?.signedURL) body.full_url = `${SUPABASE_URL}/storage/v1${body.signedURL}`;
        return json(body, r.status);
      }

      case "storage_upload": {
        const { bucket, path, base64, content_type = "application/octet-stream", upsert = true } = payload;
        if (!bucket || !path || !base64) return json({ error: "bucket + path + base64 required" }, 400);
        const bin = atob(base64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        const r = await pgRest(`/storage/v1/object/${bucket}/${path}`, {
          method: "POST",
          headers: { "Content-Type": content_type, "x-upsert": String(upsert) },
          body: buf,
        });
        return json(await r.json().catch(() => ({})), r.status);
      }

      case "storage_delete": {
        const { bucket, paths } = payload;
        if (!bucket || !Array.isArray(paths)) return json({ error: "bucket + paths[] required" }, 400);
        const r = await pgRest(`/storage/v1/object/${bucket}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: paths }),
        });
        return json(await r.json().catch(() => ({})), r.status);
      }

      case "invoke": {
        const { function: fn, body, headers = {} } = payload;
        if (!fn) return json({ error: "function required" }, 400);
        const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
            "Content-Type": "application/json",
            ...headers,
          },
          body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
        });
        const text = await r.text();
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch { /* */ }
        return json({ status: r.status, body: parsed });
      }

      case "list_buckets": {
        const r = await pgRest(`/storage/v1/bucket`);
        return json(await r.json(), r.status);
      }

      case "snapshot": {
        // Trigger full DB + storage manifest backup
        const r = await fetch(`${SUPABASE_URL}/functions/v1/db-backup`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        const text = await r.text();
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch { /* */ }
        return json({ status: r.status, body: parsed });
      }

      case "help":
      case undefined:
        return json({
          actions: {
            sql: "{ query: string } -- full SQL via service role, bypasses RLS",
            storage_list: "{ bucket, prefix?, limit?, offset? }",
            storage_download: "{ bucket, path } -> { base64, content_type, size }",
            storage_signed_url: "{ bucket, path, expires_in? }",
            storage_upload: "{ bucket, path, base64, content_type?, upsert? }",
            storage_delete: "{ bucket, paths: string[] }",
            list_buckets: "{}",
            invoke: "{ function: string, body?: object|string, headers?: object }",
          },
        });

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

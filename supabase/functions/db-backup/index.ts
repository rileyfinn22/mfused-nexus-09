// On-demand + scheduled full DB + storage-manifest backup.
// Auth: x-admin-token header matching CLAUDE_ADMIN_TOKEN, OR called with service role (cron).
// Writes a single .json.gz file to private bucket `db-backups`.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TOKEN = Deno.env.get("CLAUDE_ADMIN_TOKEN")!;

async function pg(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
  });
}

async function rpc(query: string) {
  const r = await pg(`/rest/v1/rpc/exec_sql_admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Auth: admin token OR service role bearer (for cron)
  const token = req.headers.get("x-admin-token");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authed = (token && token === ADMIN_TOKEN) || (bearer && bearer === SERVICE_ROLE);
  if (!authed) return json({ error: "unauthorized" }, 401);

  const started = Date.now();
  try {
    // 1. List all public tables
    const tablesRes = await rpc(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
    );
    const tables: string[] = (tablesRes?.rows ?? []).map((r: any) => r.tablename);

    const data: Record<string, any[]> = {};
    const counts: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const t of tables) {
      try {
        const r = await rpc(`SELECT to_jsonb(x) AS row FROM public."${t}" x`);
        if (r?.error) {
          errors[t] = r.error;
          continue;
        }
        const rows = (r?.rows ?? []).map((x: any) => x.row);
        data[t] = rows;
        counts[t] = rows.length;
      } catch (e) {
        errors[t] = String((e as any)?.message ?? e);
      }
    }

    // 2. Storage manifest — list every file in every bucket
    const bucketsRes = await pg(`/storage/v1/bucket`);
    const buckets = await bucketsRes.json();
    const storage: Record<string, any[]> = {};
    for (const b of buckets) {
      const all: any[] = [];
      // recursive list using prefix walk
      const walk = async (prefix: string) => {
        let offset = 0;
        while (true) {
          const r = await pg(`/storage/v1/object/list/${b.name}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix, limit: 1000, offset }),
          });
          const items = await r.json();
          if (!Array.isArray(items) || items.length === 0) break;
          for (const it of items) {
            if (it.id === null || it.metadata === null) {
              // folder
              await walk(prefix ? `${prefix}/${it.name}` : it.name);
            } else {
              all.push({
                path: prefix ? `${prefix}/${it.name}` : it.name,
                size: it.metadata?.size,
                mime: it.metadata?.mimetype,
                etag: it.metadata?.eTag,
                updated_at: it.updated_at,
              });
            }
          }
          if (items.length < 1000) break;
          offset += 1000;
        }
      };
      await walk("");
      storage[b.name] = all;
    }

    const snapshot = {
      version: 1,
      created_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      project_ref: "spxdyqdygsmzyngrqxni",
      table_counts: counts,
      table_errors: errors,
      storage_file_counts: Object.fromEntries(
        Object.entries(storage).map(([k, v]) => [k, v.length]),
      ),
      tables: data,
      storage,
    };

    // 3. gzip + upload
    const raw = new TextEncoder().encode(JSON.stringify(snapshot));
    const cs = new CompressionStream("gzip");
    const gz = new Response(new Blob([raw]).stream().pipeThrough(cs));
    const gzBuf = new Uint8Array(await gz.arrayBuffer());

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `auto/${ts}.json.gz`;
    const up = await pg(`/storage/v1/object/db-backups/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/gzip", "x-upsert": "true" },
      body: gzBuf,
    });
    if (!up.ok) {
      const txt = await up.text();
      return json({ error: "upload failed", detail: txt }, 500);
    }

    return json({
      ok: true,
      path,
      bucket: "db-backups",
      bytes: gzBuf.length,
      raw_bytes: raw.length,
      tables: Object.keys(data).length,
      table_errors: Object.keys(errors).length,
      storage_files: Object.values(storage).reduce((a, v) => a + v.length, 0),
      duration_ms: Date.now() - started,
    });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});

// Background, chunked, resumable full DB + storage-manifest backup.
// Returns immediately with a run_id; the dump continues via EdgeRuntime.waitUntil.
// Each table is dumped in pages and uploaded as its own gzipped file under
//   db-backups/runs/<run_id>/tables/<table>.json.gz
// Storage manifest -> db-backups/runs/<run_id>/storage.json.gz
// Live progress      -> db-backups/runs/<run_id>/status.json
//
// Auth: x-admin-token header OR service role bearer.
// GET (or POST with action=status) ?run_id=... -> returns current status.json

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TOKEN = Deno.env.get("CLAUDE_ADMIN_TOKEN")!;

const PAGE_SIZE = 2000; // rows per RPC page

function pg(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
  });
}

async function rpc(query: string): Promise<any> {
  const r = await pg(`/rest/v1/rpc/exec_sql_admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return await r.json();
}

async function gzipBytes(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const resp = new Response(new Blob([raw]).stream().pipeThrough(cs));
  return new Uint8Array(await resp.arrayBuffer());
}

async function uploadJsonGz(path: string, obj: unknown): Promise<void> {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  const gz = await gzipBytes(raw);
  const r = await pg(`/storage/v1/object/db-backups/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/gzip", "x-upsert": "true" },
    body: gz,
  });
  if (!r.ok) throw new Error(`upload ${path} failed: ${await r.text()}`);
}

async function uploadJson(path: string, obj: unknown): Promise<void> {
  const raw = new TextEncoder().encode(JSON.stringify(obj, null, 2));
  const r = await pg(`/storage/v1/object/db-backups/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-upsert": "true" },
    body: raw,
  });
  if (!r.ok) throw new Error(`upload ${path} failed: ${await r.text()}`);
}

async function downloadJson(path: string): Promise<any | null> {
  const r = await pg(`/storage/v1/object/db-backups/${path}`);
  if (!r.ok) return null;
  return await r.json();
}

function sqlIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

async function runBackup(runId: string) {
  const startedAt = Date.now();
  const basePath = `runs/${runId}`;
  const status: any = {
    run_id: runId,
    state: "running",
    started_at: new Date(startedAt).toISOString(),
    updated_at: new Date(startedAt).toISOString(),
    tables_total: 0,
    tables_done: 0,
    tables_failed: 0,
    current_table: null,
    table_counts: {} as Record<string, number>,
    table_errors: {} as Record<string, string>,
    storage_done: false,
    storage_file_counts: {} as Record<string, number>,
  };
  const writeStatus = async () => {
    status.updated_at = new Date().toISOString();
    status.duration_ms = Date.now() - startedAt;
    try { await uploadJson(`${basePath}/status.json`, status); } catch { /* ignore */ }
  };

  try {
    await writeStatus();

    // 1. Discover tables
    const tablesRes = await rpc(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
    );
    const tables: string[] = (tablesRes?.rows ?? []).map((r: any) => r.tablename);
    status.tables_total = tables.length;
    await writeStatus();

    // 2. Dump each table in pages, then upload one .json.gz per table
    for (const t of tables) {
      status.current_table = t;
      await writeStatus();
      try {
        // Try to find a stable order key (prefer created_at, fallback id, fallback ctid)
        const colsRes = await rpc(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name='${t.replace(/'/g, "''")}'`,
        );
        const cols: string[] = (colsRes?.rows ?? []).map((r: any) => r.column_name);
        const orderKey = cols.includes("created_at")
          ? sqlIdent("created_at") + " NULLS FIRST"
          : cols.includes("id")
            ? sqlIdent("id")
            : "ctid";

        const allRows: any[] = [];
        let offset = 0;
        // hard safety cap: 5M rows per table
        while (offset < 5_000_000) {
          const page = await rpc(
            `SELECT to_jsonb(x) AS row FROM public.${sqlIdent(t)} x ORDER BY ${orderKey} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
          );
          if (page?.error) throw new Error(page.error);
          const rows = (page?.rows ?? []).map((r: any) => r.row);
          if (rows.length === 0) break;
          allRows.push(...rows);
          if (rows.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        await uploadJsonGz(`${basePath}/tables/${t}.json.gz`, {
          table: t,
          row_count: allRows.length,
          dumped_at: new Date().toISOString(),
          rows: allRows,
        });
        status.table_counts[t] = allRows.length;
      } catch (e) {
        status.table_errors[t] = String((e as any)?.message ?? e);
        status.tables_failed += 1;
      }
      status.tables_done += 1;
      await writeStatus();
    }

    status.current_table = null;

    // 3. Storage manifest
    try {
      const bucketsRes = await pg(`/storage/v1/bucket`);
      const buckets = await bucketsRes.json();
      const storage: Record<string, any[]> = {};
      for (const b of buckets) {
        const all: any[] = [];
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
        status.storage_file_counts[b.name] = all.length;
      }
      await uploadJsonGz(`${basePath}/storage.json.gz`, {
        created_at: new Date().toISOString(),
        storage,
      });
      status.storage_done = true;
    } catch (e) {
      status.storage_error = String((e as any)?.message ?? e);
    }

    status.state = status.tables_failed > 0 ? "completed_with_errors" : "completed";
    status.completed_at = new Date().toISOString();
    await writeStatus();
  } catch (e) {
    status.state = "failed";
    status.fatal_error = String((e as any)?.message ?? e);
    status.completed_at = new Date().toISOString();
    await writeStatus();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Auth
  const token = req.headers.get("x-admin-token");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authed = (token && token === ADMIN_TOKEN) || (bearer && bearer === SERVICE_ROLE);
  if (!authed) return json({ error: "unauthorized" }, 401);

  // Parse body / query
  const url = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /* allow empty */ }
  }
  const action = body.action ?? url.searchParams.get("action") ?? "start";
  const runIdParam = body.run_id ?? url.searchParams.get("run_id");

  if (action === "status") {
    if (!runIdParam) return json({ error: "run_id required" }, 400);
    const s = await downloadJson(`runs/${runIdParam}/status.json`);
    if (!s) return json({ error: "not found", run_id: runIdParam }, 404);
    return json(s);
  }

  if (action === "list") {
    // List recent runs
    const r = await pg(`/storage/v1/object/list/db-backups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "runs", limit: 100, sortBy: { column: "name", order: "desc" } }),
    });
    return json(await r.json(), r.status);
  }

  // Start a new run in the background
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  // @ts-ignore - EdgeRuntime is provided by Supabase Edge Runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runBackup(runId));
  } else {
    // Fallback: fire-and-forget
    runBackup(runId).catch(() => {});
  }

  return json({
    ok: true,
    run_id: runId,
    state: "started",
    poll: { action: "status", run_id: runId },
    bucket: "db-backups",
    base_path: `runs/${runId}`,
  }, 202);
});

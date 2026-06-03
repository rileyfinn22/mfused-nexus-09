// Incremental file mirror: copies bytes from source buckets into `db-backups/files/{bucket}/...`.
// Skips files already present with matching size. Time-boxed per invocation; call repeatedly until done=true.
// Auth: x-admin-token header matching CLAUDE_ADMIN_TOKEN, OR service role bearer.

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

const DEFAULT_BUCKETS = ["artwork", "print-files"];
const MIRROR_BUCKET = "db-backups";
const TIME_BUDGET_MS = 50_000; // leave headroom under 60s edge timeout
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB per-file cap

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

async function listAll(bucket: string): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  const walk = async (prefix: string) => {
    let offset = 0;
    while (true) {
      const r = await pg(`/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      });
      const items = await r.json();
      if (!Array.isArray(items) || items.length === 0) break;
      for (const it of items) {
        const full = prefix ? `${prefix}/${it.name}` : it.name;
        if (it.id === null || it.metadata === null) {
          await walk(full);
        } else {
          out.push({ path: full, size: it.metadata?.size ?? 0 });
        }
      }
      if (items.length < 1000) break;
      offset += 1000;
    }
  };
  await walk("");
  return out;
}

async function existsInMirror(mirrorPath: string, expectedSize: number): Promise<boolean> {
  // HEAD the object; storage returns content-length
  const r = await pg(`/storage/v1/object/info/${MIRROR_BUCKET}/${mirrorPath}`);
  if (!r.ok) return false;
  try {
    const meta = await r.json();
    const sz = meta?.metadata?.size ?? meta?.size;
    return typeof sz === "number" && sz === expectedSize;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const token = req.headers.get("x-admin-token");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authed = (token && token === ADMIN_TOKEN) || (bearer && bearer === SERVICE_ROLE);
  if (!authed) return json({ error: "unauthorized" }, 401);

  let payload: any = {};
  try { payload = await req.json(); } catch { /* */ }
  const buckets: string[] = Array.isArray(payload.buckets) && payload.buckets.length ? payload.buckets : DEFAULT_BUCKETS;

  const started = Date.now();
  const stats: Record<string, any> = {};
  let copied = 0;
  let skipped = 0;
  let bytesCopied = 0;
  let skippedTooLarge = 0;
  const errors: { bucket: string; path: string; error: string }[] = [];
  let done = true;

  for (const bucket of buckets) {
    if (Date.now() - started > TIME_BUDGET_MS) { done = false; break; }
    const files = await listAll(bucket);
    let bCopied = 0, bSkipped = 0, bBytes = 0;

    for (const f of files) {
      if (Date.now() - started > TIME_BUDGET_MS) { done = false; break; }
      const mirrorPath = `files/${bucket}/${f.path}`;

      if (f.size > MAX_FILE_BYTES) { skippedTooLarge++; continue; }
      if (await existsInMirror(mirrorPath, f.size)) { skipped++; bSkipped++; continue; }

      try {
        const dl = await pg(`/storage/v1/object/${bucket}/${encodeURI(f.path)}`);
        if (!dl.ok) { errors.push({ bucket, path: f.path, error: `download ${dl.status}` }); continue; }
        const ct = dl.headers.get("content-type") ?? "application/octet-stream";
        const buf = new Uint8Array(await dl.arrayBuffer());
        const up = await pg(`/storage/v1/object/${MIRROR_BUCKET}/${encodeURI(mirrorPath)}`, {
          method: "POST",
          headers: { "Content-Type": ct, "x-upsert": "true" },
          body: buf,
        });
        if (!up.ok) { errors.push({ bucket, path: f.path, error: `upload ${up.status}` }); continue; }
        copied++; bCopied++; bytesCopied += buf.length; bBytes += buf.length;
      } catch (e) {
        errors.push({ bucket, path: f.path, error: String((e as any)?.message ?? e) });
      }
    }

    stats[bucket] = { total_files: files.length, copied: bCopied, skipped: bSkipped, bytes_copied: bBytes };
    if (!done) break;
  }

  return json({
    ok: true,
    done,
    duration_ms: Date.now() - started,
    buckets: stats,
    totals: { copied, skipped, bytes_copied: bytesCopied, skipped_too_large: skippedTooLarge },
    errors: errors.slice(0, 50),
    error_count: errors.length,
    note: done ? "mirror complete" : "time budget hit — call again to continue (incremental, safe to re-run)",
  });
});

import { supabase } from "@/integrations/supabase/client";
import { normalizeStorageObjectPath, resolveStorageSignedUrl } from "@/lib/storageUrl";

const PRIVATE_BUCKETS = ["artwork", "print-files", "product-images", "production-images"];
const SIGN_TTL_SECONDS = 3600;
const CACHE_TTL_MS = (SIGN_TTL_SECONDS - 300) * 1000; // refresh 5 min before expiry
const SESSION_KEY = "signed-artwork-url-cache-v1";
const SIGN_BATCH_SIZE = 20;

type CacheEntry = { url: string; expires: number };
const cache = new Map<string, CacheEntry>();

// Hydrate cache from sessionStorage so navigating between pages doesn't re-sign.
try {
  const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (v?.expires > now + 60_000) cache.set(k, v);
    }
  }
} catch {
  /* ignore */
}

let persistTimer: number | null = null;
function persist() {
  if (typeof sessionStorage === "undefined") return;
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      const obj: Record<string, CacheEntry> = {};
      cache.forEach((v, k) => {
        obj[k] = v;
      });
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
    } catch {
      /* quota exceeded — ignore */
    }
  }, 500);
}

function detectBucket(url: string): string | null {
  for (const bucket of PRIVATE_BUCKETS) {
    if (
      url.includes(`/storage/v1/object/public/${bucket}/`) ||
      url.includes(`/storage/v1/object/sign/${bucket}/`) ||
      url.includes(`/storage/v1/object/authenticated/${bucket}/`)
    ) {
      return bucket;
    }
  }
  return null;
}

// Per-bucket batch queue. Requests within the same microtask/macrotask tick
// are combined into a single `createSignedUrls` call.
type PendingItem = {
  originalUrl: string;
  path: string;
  resolve: (url: string) => void;
};
const queues = new Map<string, PendingItem[]>();
const scheduled = new Map<string, boolean>();
const inflight = new Map<string, Promise<string>>();

async function signPathBatch(bucket: string, paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, SIGN_TTL_SECONDS);

  if (error) {
    throw error;
  }

  const signedByPath = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) {
      signedByPath.set(entry.path, resolveStorageSignedUrl(entry.signedUrl));
    }
  }

  return signedByPath;
}

async function signPathsResiliently(bucket: string, paths: string[]): Promise<Map<string, string>> {
  try {
    return await signPathBatch(bucket, paths);
  } catch {
    if (paths.length <= 1) {
      return new Map();
    }

    const midpoint = Math.ceil(paths.length / 2);
    const [left, right] = await Promise.all([
      signPathsResiliently(bucket, paths.slice(0, midpoint)),
      signPathsResiliently(bucket, paths.slice(midpoint)),
    ]);

    return new Map([...left, ...right]);
  }
}

function scheduleFlush(bucket: string) {
  if (scheduled.get(bucket)) return;
  scheduled.set(bucket, true);
  // Use setTimeout(0) instead of microtask so all synchronous <SignedImage>
  // mounts in a render batch land in the same request.
  window.setTimeout(() => flush(bucket), 0);
}

async function flush(bucket: string) {
  scheduled.set(bucket, false);
  const items = queues.get(bucket) ?? [];
  queues.set(bucket, []);
  if (items.length === 0) return;

  // Dedupe by path
  const uniquePaths = Array.from(new Set(items.map((i) => i.path)));

  try {
    for (let from = 0; from < uniquePaths.length; from += SIGN_BATCH_SIZE) {
      const batch = uniquePaths.slice(from, from + SIGN_BATCH_SIZE);
      const signedBatch = await signPathsResiliently(bucket, batch);
      const now = Date.now();

      for (const item of items) {
        if (!batch.includes(item.path)) continue;

        const signed = signedBatch.get(item.path);
        if (signed) {
          cache.set(item.originalUrl, { url: signed, expires: now + CACHE_TTL_MS });
          item.resolve(signed);
        } else {
          item.resolve(item.originalUrl); // best-effort fallback
        }
        inflight.delete(item.originalUrl);
      }
    }

    persist();
  } catch {
    for (const item of items) {
      item.resolve(item.originalUrl);
      inflight.delete(item.originalUrl);
    }
  }
}

/**
 * Given a stored artwork/preview URL (which may still be the legacy public URL),
 * return a fresh signed URL that works even though the bucket is now private.
 * Requests are batched per bucket and cached in sessionStorage.
 */
export async function getSignedArtworkUrl(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  const bucket = detectBucket(url);
  if (!bucket) return url;

  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expires > now + 60_000) return cached.url;

  const existing = inflight.get(url);
  if (existing) return existing;

  const path = normalizeStorageObjectPath(url, bucket);
  const promise = new Promise<string>((resolve) => {
    const queue = queues.get(bucket) ?? [];
    queue.push({ originalUrl: url, path, resolve });
    queues.set(bucket, queue);
    scheduleFlush(bucket);
  });
  inflight.set(url, promise);
  return promise;
}

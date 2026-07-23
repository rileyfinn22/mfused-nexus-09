import { supabase } from "@/integrations/supabase/client";
import { normalizeStorageObjectPath, resolveStorageSignedUrl } from "@/lib/storageUrl";

const PRIVATE_BUCKETS = ["artwork", "print-files", "product-images", "production-images"];

const cache = new Map<string, { url: string; expires: number }>();
const inflight = new Map<string, Promise<string>>();

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

/**
 * Given a stored artwork/preview URL (which may still be the legacy public URL),
 * return a fresh signed URL that works even though the bucket is now private.
 * Falls back to the original URL for anything not in a known private bucket.
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

  const promise = (async () => {
    const path = normalizeStorageObjectPath(url, bucket);
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      inflight.delete(url);
      return url; // best-effort fallback
    }
    const resolved = resolveStorageSignedUrl(data.signedUrl);
    cache.set(url, { url: resolved, expires: now + 3600_000 });
    inflight.delete(url);
    return resolved;
  })();

  inflight.set(url, promise);
  return promise;
}

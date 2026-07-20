import { supabase } from "@/integrations/supabase/client";
import { getFreshAuthSession } from "@/lib/authSession";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const STORAGE_PATH_PREFIX = "/storage/v1";
const STORAGE_OBJECT_PATH_PATTERN = /\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/;
const STORAGE_SIGN_TIMEOUT_MS = 10000;
const STORAGE_SIGN_BATCH_SIZE = 500;
const STORAGE_SIGN_MAX_PARALLEL = 6;
const STORAGE_SIGN_CACHE_TTL_MS = 55 * 60 * 1000; // signed URLs last 60m; cache slightly less

type SignedCacheEntry = { url: string; expiresAt: number };
const signedUrlCache = new Map<string, SignedCacheEntry>();

const cacheKey = (bucket: string, path: string) => `${bucket}::${path}`;

const getCachedSignedUrl = (bucket: string, path: string) => {
  const entry = signedUrlCache.get(cacheKey(bucket, path));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    signedUrlCache.delete(cacheKey(bucket, path));
    return null;
  }
  return entry.url;
};

const setCachedSignedUrl = (bucket: string, path: string, url: string) => {
  signedUrlCache.set(cacheKey(bucket, path), { url, expiresAt: Date.now() + STORAGE_SIGN_CACHE_TTL_MS });
};

const stripStoragePathDecorators = (value: string) => value.split("#")[0].split("?")[0];

const stripBucketPrefix = (value: string, bucketName?: string) => {
  if (!bucketName) return value;
  return value.startsWith(`${bucketName}/`) ? value.slice(bucketName.length + 1) : value;
};

const isDirectHttpUrl = (value: string) => /^https?:\/\//i.test(value);

export const resolveStorageSignedUrl = (signedUrl: string) => {
  if (!signedUrl) return signedUrl;
  if (signedUrl.startsWith("http")) return signedUrl;

  if (signedUrl.startsWith(STORAGE_PATH_PREFIX)) {
    return `${SUPABASE_URL}${signedUrl}`;
  }

  const normalizedPath = signedUrl.startsWith("/") ? signedUrl : `/${signedUrl}`;
  return `${SUPABASE_URL}${STORAGE_PATH_PREFIX}${normalizedPath}`;
};

export const normalizeStorageObjectPath = (filePath: string, bucketName?: string) => {
  if (!filePath) return filePath;

  const trimmedPath = stripStoragePathDecorators(filePath.trim());

  if (isDirectHttpUrl(trimmedPath)) {
    try {
      const url = new URL(trimmedPath);
      const storageMatch = url.pathname.match(STORAGE_OBJECT_PATH_PATTERN);

      if (storageMatch) {
        const [, detectedBucket, objectPath] = storageMatch;
        if (!bucketName || detectedBucket === bucketName) {
          return decodeURIComponent(objectPath);
        }
      }
    } catch {
      return stripBucketPrefix(trimmedPath, bucketName);
    }
  }

  const normalizedCandidate = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
  const storageMatch = normalizedCandidate.match(STORAGE_OBJECT_PATH_PATTERN);

  if (storageMatch) {
    const [, detectedBucket, objectPath] = storageMatch;
    if (!bucketName || detectedBucket === bucketName) {
      return decodeURIComponent(objectPath);
    }
  }

  return stripBucketPrefix(trimmedPath.replace(/^\/+/, ""), bucketName);
};

export const sanitizeStorageFileName = (name: string) => {
  const trimmedName = name.trim();
  const lastDot = trimmedName.lastIndexOf(".");
  const ext = lastDot > 0 ? trimmedName.slice(lastDot).toLowerCase() : "";
  const baseName = lastDot > 0 ? trimmedName.slice(0, lastDot) : trimmedName;

  const sanitizedBaseName = baseName
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);

  return `${sanitizedBaseName || "file"}${ext}`;
};

export const triggerSignedFileDownload = async (signedUrl: string, fileName: string) => {
  const resolvedUrl = resolveStorageSignedUrl(signedUrl);

  try {
    const response = await fetch(resolvedUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    const fallbackLink = document.createElement("a");
    fallbackLink.href = resolvedUrl;
    fallbackLink.download = fileName;
    fallbackLink.rel = "noopener noreferrer";
    document.body.appendChild(fallbackLink);
    fallbackLink.click();
    document.body.removeChild(fallbackLink);
  }
};

export const triggerBlobFileDownload = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener noreferrer";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

const createSignedStorageUrl = async (
  bucketName: string,
  filePath: string,
  options?: { download?: string },
) => {
  const normalizedFilePath = normalizeStorageObjectPath(filePath, bucketName);

  if (!normalizedFilePath) {
    throw new Error("Missing storage file path");
  }

  if (isDirectHttpUrl(filePath.trim()) && normalizedFilePath === stripStoragePathDecorators(filePath.trim())) {
    return filePath;
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(normalizedFilePath, 3600, options);

  if (error || !data?.signedUrl) {
    throw error ?? new Error("Failed to create signed file URL");
  }

  return resolveStorageSignedUrl(data.signedUrl);
};

const getStoragePathForSigning = (filePath: string, bucketName: string) => {
  if (!filePath) return null;

  const strippedPath = stripStoragePathDecorators(filePath.trim());
  const normalizedFilePath = normalizeStorageObjectPath(filePath, bucketName);

  if (!normalizedFilePath) return null;

  // External, non-storage URLs cannot be signed by our storage API.
  if (isDirectHttpUrl(strippedPath) && normalizedFilePath === strippedPath) {
    return null;
  }

  return normalizedFilePath;
};

export const createSignedStorageUrlMap = async (bucketName: string, filePaths: string[]) => {
  const result: Record<string, string> = {};
  const pathToOriginals = new Map<string, string[]>();

  filePaths.forEach((filePath) => {
    if (!filePath) return;

    const normalizedPath = getStoragePathForSigning(filePath, bucketName);
    if (!normalizedPath) {
      result[filePath] = filePath;
      return;
    }

    const originals = pathToOriginals.get(normalizedPath) || [];
    originals.push(filePath);
    pathToOriginals.set(normalizedPath, originals);
  });

  const paths = Array.from(pathToOriginals.keys());
  if (paths.length === 0) return result;

  const session = await getFreshAuthSession();
  if (!session?.access_token) {
    paths.forEach((path) => {
      (pathToOriginals.get(path) || []).forEach((original) => {
        result[original] = original;
      });
    });
    return result;
  }

  for (let i = 0; i < paths.length; i += STORAGE_SIGN_BATCH_SIZE) {
    const chunk = paths.slice(i, i + STORAGE_SIGN_BATCH_SIZE);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), STORAGE_SIGN_TIMEOUT_MS);

    try {
      const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucketName}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 3600, paths: chunk }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Storage signing failed (${response.status})`);

      const signedRows = (await response.json()) as Array<{ signedURL?: string; signedUrl?: string; path?: string }>;
      chunk.forEach((path, index) => {
        const signedUrl = signedRows?.[index]?.signedUrl || signedRows?.[index]?.signedURL;
        const resolvedUrl = signedUrl ? resolveStorageSignedUrl(signedUrl) : null;

        (pathToOriginals.get(path) || []).forEach((original) => {
          result[original] = resolvedUrl || original;
        });
      });
    } catch (error) {
      console.error("Error signing storage URLs:", error);
      chunk.forEach((path) => {
        (pathToOriginals.get(path) || []).forEach((original) => {
          result[original] = original;
        });
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return result;
};

export const signStorageUrl = async (bucketName: string, filePath: string) => {
  const signedMap = await createSignedStorageUrlMap(bucketName, [filePath]);
  return signedMap[filePath] || filePath;
};

export const signStorageUrlsInRows = async <T extends Record<string, any>>(
  bucketName: string,
  rows: T[] | null | undefined,
  urlKeys: string[],
): Promise<T[]> => {
  const rowList = rows || [];
  const values = rowList.flatMap((row) =>
    urlKeys
      .map((key) => row[key])
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );

  if (values.length === 0) return rowList;

  const signedMap = await createSignedStorageUrlMap(bucketName, values);

  return rowList.map((row) => {
    let changed = false;
    const next: Record<string, any> = { ...row };

    urlKeys.forEach((key) => {
      const value = next[key];
      if (typeof value === "string" && signedMap[value] && signedMap[value] !== value) {
        next[key] = signedMap[value];
        changed = true;
      }
    });

    return changed ? (next as T) : row;
  });
};

export const getStoragePreviewUrl = async (bucketName: string, filePath: string) => {
  return createSignedStorageUrl(bucketName, filePath);
};

export const downloadStorageObject = async (bucketName: string, filePath: string, fileName: string) => {
  const signedUrl = await createSignedStorageUrl(bucketName, filePath, { download: fileName });
  await triggerSignedFileDownload(signedUrl, fileName);
};

export const openStorageObjectInNewTab = async (bucketName: string, filePath: string) => {
  const signedUrl = await createSignedStorageUrl(bucketName, filePath);
  await openSignedFileInNewTab(signedUrl);
};

export const openSignedFileInNewTab = async (signedUrl: string) => {
  const resolvedUrl = resolveStorageSignedUrl(signedUrl);
  const response = await fetch(resolvedUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const popup = window.open(objectUrl, "_blank");

  if (!popup) {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};
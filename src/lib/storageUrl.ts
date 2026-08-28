import { supabase } from "@/integrations/supabase/client";

const STORAGE_PATH_PREFIX = "/storage/v1";
const STORAGE_OBJECT_PATH_PATTERN = /\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/;

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
    return `${import.meta.env.VITE_SUPABASE_URL}${signedUrl}`;
  }

  const normalizedPath = signedUrl.startsWith("/") ? signedUrl : `/${signedUrl}`;
  return `${import.meta.env.VITE_SUPABASE_URL}${STORAGE_PATH_PREFIX}${normalizedPath}`;
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
  // The signed URL already carries `?download=<fileName>`, so let the browser
  // stream directly instead of buffering the whole file into a blob first.
  // Buffering added a multi-second delay before the download prompt appeared.
  const resolvedUrl = resolveStorageSignedUrl(signedUrl);
  const link = document.createElement("a");
  link.href = resolvedUrl;
  link.download = fileName;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

export const getStoragePreviewUrl = async (bucketName: string, filePath: string) => {
  return createSignedStorageUrl(bucketName, filePath);
};

/** The name is appended to the signed URL as `?download=…`, and supabase-js runs
 *  the whole URL through encodeURI, which leaves '#', '?' and '&' untouched. A
 *  '#' therefore starts a fragment and the server only ever sees the part before
 *  it — Content-Disposition comes back as `filename=PACKING%20LIST-`, so the file
 *  saves with no extension and the OS can't open it. Neutralise those three
 *  characters; everything else (spaces, case, dots) is preserved. */
const toDownloadParamName = (name: string) => name.replace(/[#?&]/g, "-");

export const downloadStorageObject = async (bucketName: string, filePath: string, fileName: string) => {
  const downloadName = toDownloadParamName(fileName);
  const signedUrl = await createSignedStorageUrl(bucketName, filePath, { download: downloadName });
  await triggerSignedFileDownload(signedUrl, downloadName);
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
export const resolveStorageSignedUrl = (signedUrl: string) => {
  if (!signedUrl) return signedUrl;
  if (signedUrl.startsWith("http")) return signedUrl;

   if (signedUrl.startsWith("/storage/v1/")) {
    return `${import.meta.env.VITE_SUPABASE_URL}${signedUrl}`;
  }

  const normalizedPath = signedUrl.startsWith("/") ? signedUrl : `/${signedUrl}`;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${normalizedPath}`;
};

export const normalizeStorageObjectPath = (filePath: string) => {
  if (!filePath) return filePath;
  return filePath.split("#")[0];
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
    URL.revokeObjectURL(objectUrl);
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
export const resolveStorageSignedUrl = (signedUrl: string) => {
  if (!signedUrl) return signedUrl;
  if (signedUrl.startsWith("http")) return signedUrl;

  const normalizedPath = signedUrl.startsWith("/") ? signedUrl : `/${signedUrl}`;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${normalizedPath}`;
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
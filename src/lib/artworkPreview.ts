import { supabase } from "@/integrations/supabase/client";
import { generatePdfThumbnailFromArrayBuffer, generatePdfThumbnailFromFile } from "@/lib/pdfThumbnail";

const PDF_PREVIEW_OPTIONS = {
  maxWidth: 1400,
  scale: 1.5,
};

const FLAT_ARTWORK_PREVIEW_PREFIX = "flat-preview-";
const MANUAL_ARTWORK_PREVIEW_PREFIX = "manual-preview-";

const getFileExtension = (filename: string) => filename.split(".").pop()?.toLowerCase() ?? "";

const isPdfFile = (filename: string) => getFileExtension(filename) === "pdf";
const IMAGE_PREVIEW_URL_PATTERN = /\.(png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i;

export function buildManualArtworkPreviewPath(sku: string, extension?: string): string {
  const normalizedExtension = extension?.replace(/^\./, "").toLowerCase() || "png";
  return `${sku}/${MANUAL_ARTWORK_PREVIEW_PREFIX}${Date.now()}.${normalizedExtension}`;
}

export function isUsableArtworkPreviewUrl(
  filename: string,
  previewUrl: string | null | undefined,
): previewUrl is string {
  if (!previewUrl || !IMAGE_PREVIEW_URL_PATTERN.test(previewUrl)) {
    return false;
  }

  if (!isPdfFile(filename)) {
    return true;
  }

  return (
    previewUrl.includes(`/${FLAT_ARTWORK_PREVIEW_PREFIX}`) ||
    previewUrl.includes(`/${MANUAL_ARTWORK_PREVIEW_PREFIX}`) ||
    (!isLegacyGeneratedTemplateMockupUrl(previewUrl) && previewUrl.includes("/artwork/"))
  );
}

export function isLegacyGeneratedTemplateMockupUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  return /(?:-v3|-v4)\.(?:png|jpe?g|webp|gif)$/i.test(url) || /mockup/i.test(url);
}

async function uploadPreviewBlob(sku: string, blob: Blob): Promise<string> {
  const previewPath = `${sku}/${FLAT_ARTWORK_PREVIEW_PREFIX}${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from("artwork")
    .upload(previewPath, blob, { contentType: "image/png" });

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("artwork").getPublicUrl(previewPath);

  return publicUrl;
}

/**
 * Generate a simple PDF screenshot thumbnail from a File and upload it.
 * Keeps the same function signature for backward compat (contextLabel is ignored).
 */
export async function createFlatArtworkPreviewFromFile({
  file,
  sku,
}: {
  file: File;
  sku: string;
  contextLabel?: string;
}): Promise<string> {
  const thumbnailBlob = await generatePdfThumbnailFromFile(file, PDF_PREVIEW_OPTIONS);
  return await uploadPreviewBlob(sku, thumbnailBlob);
}

/**
 * Generate a simple PDF screenshot thumbnail from an artwork URL and upload it.
 * For non-PDF files, returns the artwork URL directly.
 */
export async function createFlatArtworkPreviewFromArtwork({
  artworkUrl,
  filename,
  sku,
}: {
  artworkUrl: string;
  filename: string;
  sku: string;
  contextLabel?: string;
}): Promise<string> {
  if (!isPdfFile(filename)) {
    return artworkUrl;
  }

  const response = await fetch(artworkUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load proof (${response.status})`);
  }

  const thumbnailBlob = await generatePdfThumbnailFromArrayBuffer(
    await response.arrayBuffer(),
    PDF_PREVIEW_OPTIONS,
  );

  return await uploadPreviewBlob(sku, thumbnailBlob);
}

import { supabase } from "@/integrations/supabase/client";
import { generatePdfThumbnailFromArrayBuffer, generatePdfThumbnailFromFile } from "@/lib/pdfThumbnail";

const FLAT_ARTWORK_PREVIEW_PROMPT = [
  "Extract a clean flat artwork preview from this packaging proof.",
  "Preserve the original artwork exactly: same colors, text, logos, layout, proportions, and art.",
  "Do not redesign, restyle, rewrite, sharpen into new art, add mockup lighting, or create a 3D package rendering.",
  "Remove only non-art technical proofing elements such as measurements, dimensions, dielines, cut lines, fold guides, registration marks, notes, white ink markers, varnish/gloss indicators, and surrounding page background.",
  "If the proof contains multiple panels, isolate the main customer-facing art panel; for box and sleeve proofs this is usually the far-left panel, while merch packs usually use the full flat layout.",
  "Return a centered, front-on, clean flat file on a plain light or transparent background.",
].join(" ");

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

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read preview image"));
    };

    reader.onerror = () => reject(reader.error ?? new Error("Failed to read preview image"));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error("Failed to prepare generated preview");
  }

  return await response.blob();
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

async function requestFlatArtworkPreview(referenceImage: string, contextLabel?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-design-image", {
    body: {
      prompt: FLAT_ARTWORK_PREVIEW_PROMPT,
      reference_image: referenceImage,
      generation_mode: "flat_artwork_preview",
      context_label: contextLabel ?? null,
    },
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.image_url || typeof data.image_url !== "string") {
    throw new Error("No preview image returned");
  }

  return data.image_url;
}

async function getReferenceImageFromFile(file: File): Promise<string> {
  if (isPdfFile(file.name)) {
    const thumbnailBlob = await generatePdfThumbnailFromFile(file, PDF_PREVIEW_OPTIONS);
    return await blobToDataUrl(thumbnailBlob);
  }

  return await blobToDataUrl(file);
}

async function getReferenceImageFromArtworkUrl(artworkUrl: string, filename: string): Promise<string> {
  if (isPdfFile(filename)) {
    const response = await fetch(artworkUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Failed to load proof (${response.status})`);
    }

    const thumbnailBlob = await generatePdfThumbnailFromArrayBuffer(
      await response.arrayBuffer(),
      PDF_PREVIEW_OPTIONS,
    );

    return await blobToDataUrl(thumbnailBlob);
  }

  return artworkUrl;
}

export async function createFlatArtworkPreviewFromFile({
  file,
  sku,
  contextLabel,
}: {
  file: File;
  sku: string;
  contextLabel?: string;
}): Promise<string> {
  const referenceImage = await getReferenceImageFromFile(file);
  const generatedPreview = await requestFlatArtworkPreview(referenceImage, contextLabel);
  return await uploadPreviewBlob(sku, await dataUrlToBlob(generatedPreview));
}

export async function createFlatArtworkPreviewFromArtwork({
  artworkUrl,
  filename,
  sku,
  contextLabel,
}: {
  artworkUrl: string;
  filename: string;
  sku: string;
  contextLabel?: string;
}): Promise<string> {
  const referenceImage = await getReferenceImageFromArtworkUrl(artworkUrl, filename);
  const generatedPreview = await requestFlatArtworkPreview(referenceImage, contextLabel);
  return await uploadPreviewBlob(sku, await dataUrlToBlob(generatedPreview));
}

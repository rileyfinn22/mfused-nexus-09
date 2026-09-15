import { supabase } from "@/integrations/supabase/client";
import {
  buildManualArtworkPreviewPath,
  createFlatArtworkPreviewFromArtwork,
  createFlatArtworkPreviewFromFile,
} from "@/lib/artworkPreview";

export type ArtworkType = "customer" | "vibe_proof";

export interface UploadArtworkArgs {
  file: File;
  /** The product's item_id. Stored verbatim: every lookup matches on it exactly. */
  sku: string;
  companyId: string;
  artworkType: ArtworkType;
  notes?: string;
  /** Optional hand-made preview image; a flat preview is generated for PDFs when absent. */
  previewFile?: File | null;
}

/**
 * Uploads one artwork file to the `artwork` bucket and creates its artwork_files row.
 *
 * This is the one place that knows the storage layout (`<SKU>/<timestamp>.<ext>`) and the row
 * shape. The Add Art dialog and the per-product "+" button both go through it, so a customer
 * dropping a file on a tile and an admin filling in the dialog produce identical records.
 *
 * Throws on failure; callers own the toast.
 */
export async function uploadArtworkFile(args: UploadArtworkArgs): Promise<void> {
  const { file, companyId, artworkType, notes, previewFile } = args;
  const sku = args.sku.trim();
  if (!sku) throw new Error("This product has no SKU, so artwork cannot be attached to it.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please log in to upload artwork.");

  const fileExt = file.name.split(".").pop();
  const fileName = `${sku}/${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from("artwork").upload(fileName, file);
  if (uploadError) throw uploadError;

  const { data: { publicUrl: artworkUrl } } = supabase.storage.from("artwork").getPublicUrl(fileName);

  let previewUrl: string | null = null;
  if (previewFile) {
    const previewExt = previewFile.name.split(".").pop();
    const previewName = buildManualArtworkPreviewPath(sku, previewExt);
    const { error: previewError } = await supabase.storage.from("artwork").upload(previewName, previewFile);
    if (!previewError) {
      previewUrl = supabase.storage.from("artwork").getPublicUrl(previewName).data.publicUrl;
    } else {
      console.warn("Failed to upload provided artwork preview", previewError);
    }
  }

  const isPdf = (fileExt || "").toLowerCase() === "pdf";
  if (!previewUrl && !isPdf) {
    // Images are their own thumbnail.
    previewUrl = artworkUrl;
  }

  // Save the record first so the upload always finishes promptly. PDF thumbnail
  // rendering can stall on large files; it runs after the insert and only fills in
  // preview_url when it succeeds.
  const { data: inserted, error: insertError } = await supabase
    .from("artwork_files")
    .insert({
      sku,
      artwork_url: artworkUrl,
      preview_url: previewUrl,
      filename: file.name,
      notes: notes || "",
      artwork_type: artworkType,
      is_approved: false,
      company_id: companyId,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  if (!previewUrl && isPdf && inserted?.id) {
    try {
      const generated = await withTimeout(
        (async () => {
          try {
            return await createFlatArtworkPreviewFromFile({ file, sku, contextLabel: file.name });
          } catch (e) {
            console.warn("Failed to auto-generate flat artwork preview from file", e);
            // Second attempt: render from the file we just stored (handles browsers that
            // release the local File handle before the thumbnail finishes rendering).
            return await createFlatArtworkPreviewFromArtwork({
              artworkUrl,
              filename: file.name,
              sku,
              contextLabel: file.name,
            });
          }
        })(),
        45000,
      );

      if (generated) {
        await supabase.from("artwork_files").update({ preview_url: generated }).eq("id", inserted.id);
      }
    } catch (e) {
      console.warn("Skipped artwork preview generation", e);
    }
  }
}

/** Resolves to null if the work takes longer than `ms`, so uploads never hang. */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A readable reason for the customer when an upload is refused. */
export function describeArtworkUploadError(error: unknown): string {
  const msg = String((error as any)?.message || error || "");
  if (/row-level security|violates .* policy|not authorized|permission/i.test(msg)) {
    return "You don't have permission to add artwork to this product.";
  }
  return msg || "Failed to upload artwork";
}

import { supabase } from "@/integrations/supabase/client";
import { buildManualArtworkPreviewPath, createFlatArtworkPreviewFromFile } from "@/lib/artworkPreview";

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
    }
  } else if ((fileExt || "").toLowerCase() === "pdf") {
    try {
      previewUrl = await createFlatArtworkPreviewFromFile({ file, sku, contextLabel: file.name });
    } catch (e) {
      console.warn("Failed to auto-generate flat artwork preview", e);
    }
  }

  const { error: insertError } = await supabase.from("artwork_files").insert({
    sku,
    artwork_url: artworkUrl,
    preview_url: previewUrl,
    filename: file.name,
    notes: notes || "",
    artwork_type: artworkType,
    is_approved: false,
    company_id: companyId,
  });
  if (insertError) throw insertError;
}

/** A readable reason for the customer when an upload is refused. */
export function describeArtworkUploadError(error: unknown): string {
  const msg = String((error as any)?.message || error || "");
  if (/row-level security|violates .* policy|not authorized|permission/i.test(msg)) {
    return "You don't have permission to add artwork to this product.";
  }
  return msg || "Failed to upload artwork";
}

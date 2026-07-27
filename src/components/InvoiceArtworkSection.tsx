import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Image, FileText, ExternalLink, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import SignedImage from "@/components/SignedImage";
import { getSignedArtworkUrl } from "@/lib/signedArtworkUrl";

interface ArtworkFile {
  id: string;
  sku: string;
  filename: string;
  artwork_url: string;
  preview_url: string | null;
  artwork_type: string | null;
  is_approved: boolean | null;
  notes: string | null;
}

interface OrderItemLite {
  sku: string | null;
  name: string | null;
}

/**
 * Art files connected to the invoice's products — mirrors the order page's
 * "Product Artwork" section (matched by SKU) so customers can view and
 * download the artwork behind each shipment. RLS scopes artwork_files to the
 * viewer's company; the artwork bucket is private, so links are signed.
 */
export default function InvoiceArtworkSection({ orderItems }: { orderItems: OrderItemLite[] }) {
  const [artwork, setArtwork] = useState<ArtworkFile[]>([]);

  const skus = [...new Set((orderItems || []).map((i) => i.sku).filter(Boolean))] as string[];
  const skuKey = skus.sort().join(",");

  useEffect(() => {
    if (!skuKey) {
      setArtwork([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("artwork_files")
        .select("id, sku, filename, artwork_url, preview_url, artwork_type, is_approved, notes")
        .in("sku", skuKey.split(","))
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error loading invoice artwork:", error);
        return;
      }
      setArtwork((data || []) as ArtworkFile[]);
    })();
  }, [skuKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSigned = async (url: string) => {
    window.open(await getSignedArtworkUrl(url), "_blank");
  };

  const downloadSigned = async (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = await getSignedArtworkUrl(url);
    link.download = filename;
    link.click();
  };

  return (
    <Card className="shadow-lg">
      <CardContent className="p-8">
        <div className="flex items-center gap-2 mb-4">
          <Image className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Art Files</h2>
          {artwork.length > 0 && <Badge variant="secondary">{artwork.length}</Badge>}
        </div>

        {artwork.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
            <Image className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No art files found for products on this invoice</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {artwork.map((art) => {
              const matchingItem = (orderItems || []).find((item) => item.sku === art.sku);
              const previewSrc = art.preview_url || art.artwork_url;
              const isImage = art.artwork_url?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

              return (
                <div
                  key={art.id}
                  className={cn(
                    "p-4 rounded-lg border flex items-start gap-4",
                    art.is_approved
                      ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                      : "bg-background border-border"
                  )}
                >
                  <div className="flex-shrink-0 w-16 h-16 rounded border border-border bg-muted flex items-center justify-center overflow-hidden">
                    {previewSrc && isImage ? (
                      <SignedImage src={previewSrc} alt={art.filename} className="w-full h-full object-cover" />
                    ) : art.preview_url ? (
                      <SignedImage src={art.preview_url} alt={art.filename} className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate" title={art.filename}>
                        {art.filename}
                      </p>
                      {art.is_approved && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">
                          Approved
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {art.artwork_type === "vibe_proof" ? "Vibe Proof" : "Customer"}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground mt-0.5">
                      SKU: {art.sku}
                      {matchingItem?.name && ` • ${matchingItem.name}`}
                    </p>

                    {art.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate" title={art.notes}>
                        {art.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-1 mt-2">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openSigned(art.artwork_url)}>
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => downloadSigned(art.artwork_url, art.filename)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

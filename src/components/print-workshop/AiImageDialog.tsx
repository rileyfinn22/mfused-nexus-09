import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, ImagePlus, X, SplitSquareHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TextRegion {
  text: string;
  x_percent: number;
  y_percent: number;
  font_size_percent: number;
  color: string;
  font_weight?: "bold" | "normal";
  font_style?: "italic" | "normal";
  text_align?: "left" | "center" | "right";
  suggested_font?: string;
}

interface AiImageDialogProps {
  onImageGenerated: (dataUrl: string) => void;
  onDecomposedDesign?: (backgroundUrl: string, textRegions: TextRegion[]) => void;
  canvasWidth?: number;
  canvasHeight?: number;
}

export function AiImageDialog({ onImageGenerated, onDecomposedDesign, canvasWidth, canvasHeight }: AiImageDialogProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [decomposing, setDecomposing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReferenceImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-design-image", {
        body: {
          prompt: prompt.trim(),
          reference_image: referenceImage || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.image_url) throw new Error("No image returned");
      setPreview(data.image_url);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate image");
    } finally {
      setLoading(false);
    }
  };

  const useImage = () => {
    if (preview) {
      onImageGenerated(preview);
      closeAndReset();
    }
  };

  const decompose = async () => {
    if (!preview || !onDecomposedDesign) return;
    setDecomposing(true);
    try {
      const { data, error } = await supabase.functions.invoke("decompose-design-image", {
        body: {
          image_url: preview,
          canvas_width: canvasWidth || 900,
          canvas_height: canvasHeight || 600,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      const regions: TextRegion[] = data?.text_regions || [];
      onDecomposedDesign(preview, regions);
      toast.success(`Extracted ${regions.length} text region(s) as editable elements`);
      closeAndReset();
    } catch (err: any) {
      toast.error(err.message || "Failed to decompose design");
    } finally {
      setDecomposing(false);
    }
  };

  const closeAndReset = () => {
    setOpen(false);
    setPrompt("");
    setPreview(null);
    setReferenceImage(null);
  };

  const clearRef = () => {
    setReferenceImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="text-xs">AI Generate</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Image Generator
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Reference image upload */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Optional: Upload a screenshot or reference image for the AI to recreate
            </p>
            {referenceImage ? (
              <div className="relative inline-block">
                <img
                  src={referenceImage}
                  alt="Reference"
                  className="max-h-32 rounded-lg border border-border object-contain"
                />
                <button
                  onClick={clearRef}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 w-full border-dashed"
              >
                <ImagePlus className="h-4 w-4" />
                Upload Reference Image
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              referenceImage
                ? "Describe how you want the AI to recreate this... e.g. 'Recreate this label design as a clean, print-ready vector-style graphic with the same layout'"
                : "Describe the graphic you want... e.g. 'A minimalist gold leaf pattern for a luxury candle label'"
            }
            rows={3}
            className="resize-none"
          />
          <Button onClick={generate} disabled={loading || !prompt.trim()} className="w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Generating..." : referenceImage ? "Recreate from Reference" : "Generate Image"}
          </Button>
          {preview && (
            <div className="space-y-3">
              <div className="border border-border rounded-lg overflow-hidden bg-muted/30 flex justify-center p-2">
                <img src={preview} alt="AI Generated" className="max-h-64 object-contain rounded" />
              </div>
              <div className="flex gap-2">
                <Button onClick={generate} variant="outline" disabled={loading || decomposing} className="flex-1">
                  Regenerate
                </Button>
                <Button onClick={useImage} variant="outline" disabled={decomposing} className="flex-1">
                  Add as Image
                </Button>
              </div>
              {onDecomposedDesign && (
                <Button
                  onClick={decompose}
                  disabled={decomposing || loading}
                  className="w-full gap-2"
                  variant="default"
                >
                  {decomposing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SplitSquareHorizontal className="h-4 w-4" />
                  )}
                  {decomposing ? "Extracting text regions..." : "Decompose & Add (Editable Text)"}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

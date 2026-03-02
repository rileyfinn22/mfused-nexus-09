import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Loader2, X, Wand2, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AiCleanupDialogProps {
  onImageGenerated: (dataUrl: string) => void;
}

export function AiCleanupDialog({ onImageGenerated }: AiCleanupDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
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
      setSourceImage(ev.target?.result as string);
      setPreview(null);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          setSourceImage(ev.target?.result as string);
          setPreview(null);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  const cleanup = async () => {
    if (!sourceImage) return;
    setLoading(true);
    setPreview(null);
    try {
      const defaultPrompt = "Convert this image into a clean, high-quality, print-ready graphic asset. Remove any background and make it suitable for placing on product packaging labels. Keep the main subject crisp and sharp with clean edges. Output on a transparent or white background.";
      const finalPrompt = instructions.trim()
        ? `${defaultPrompt} Additional instructions: ${instructions.trim()}`
        : defaultPrompt;

      const { data, error } = await supabase.functions.invoke("generate-design-image", {
        body: {
          prompt: finalPrompt,
          reference_image: sourceImage,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.image_url) throw new Error("No image returned");
      setPreview(data.image_url);
    } catch (err: any) {
      toast.error(err.message || "Failed to process image");
    } finally {
      setLoading(false);
    }
  };

  const useImage = () => {
    if (preview) {
      onImageGenerated(preview);
      setOpen(false);
      reset();
    }
  };

  const reset = () => {
    setSourceImage(null);
    setPreview(null);
    setInstructions("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Camera className="h-3.5 w-3.5" />
          <span className="text-xs">Screenshot → Asset</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" onPaste={handlePaste}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Screenshot / Image → Print-Ready Asset
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload a screenshot, photo, or any image — AI will clean it up into a sharp, print-ready graphic you can place on your canvas. You can also <strong>paste from clipboard</strong> (Ctrl+V / ⌘+V).
          </p>

          {sourceImage ? (
            <div className="space-y-3">
              <div className="relative">
                <div className="border border-border rounded-lg overflow-hidden bg-muted/30 flex justify-center p-2">
                  <img src={sourceImage} alt="Source" className="max-h-40 object-contain rounded" />
                </div>
                <button
                  onClick={reset}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional: Add specific instructions... e.g. 'Remove the text and keep only the logo', 'Make the colors more vibrant', 'Convert to a simple outline style'"
                rows={2}
                className="resize-none text-sm"
              />

              <Button onClick={cleanup} disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {loading ? "Processing..." : "Convert to Print Asset"}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-28 border-dashed flex flex-col gap-2"
            >
              <ImagePlus className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click to upload or paste an image
              </span>
            </Button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          {preview && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">AI-cleaned result:</p>
              <div className="border border-border rounded-lg overflow-hidden bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] flex justify-center p-2">
                <img src={preview} alt="Cleaned asset" className="max-h-64 object-contain rounded" />
              </div>
              <div className="flex gap-2">
                <Button onClick={cleanup} variant="outline" disabled={loading} className="flex-1">
                  Retry
                </Button>
                <Button onClick={useImage} className="flex-1">
                  Add to Canvas
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

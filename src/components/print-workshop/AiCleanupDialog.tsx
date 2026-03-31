import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImagePlus, X, Camera } from "lucide-react";
import { toast } from "sonner";

interface AiCleanupDialogProps {
  onImageGenerated: (dataUrl: string) => void;
}

export function AiCleanupDialog({ onImageGenerated }: AiCleanupDialogProps) {
  const [open, setOpen] = useState(false);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
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
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  const useImage = () => {
    if (sourceImage) {
      onImageGenerated(sourceImage);
      setOpen(false);
      reset();
      toast.success("Image placed on canvas");
    }
  };

  const reset = () => {
    setSourceImage(null);
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
            <ImagePlus className="h-5 w-5 text-primary" />
            Place Screenshot / Image on Canvas
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload a screenshot, photo, or any image to place directly on your canvas as a print-ready asset. You can also <strong>paste from clipboard</strong> (Ctrl+V / ⌘+V).
          </p>

          {sourceImage ? (
            <div className="space-y-3">
              <div className="relative">
                <div className="border border-border rounded-lg overflow-hidden bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] flex justify-center p-2">
                  <img src={sourceImage} alt="Source" className="max-h-64 object-contain rounded" />
                </div>
                <button
                  onClick={reset}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <Button onClick={useImage} className="w-full gap-2">
                <ImagePlus className="h-4 w-4" />
                Add to Canvas
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

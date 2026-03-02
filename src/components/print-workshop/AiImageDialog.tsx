import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AiImageDialogProps {
  onImageGenerated: (dataUrl: string) => void;
}

export function AiImageDialog({ onImageGenerated }: AiImageDialogProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-design-image", {
        body: { prompt: prompt.trim() },
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
      setOpen(false);
      setPrompt("");
      setPreview(null);
    }
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
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the graphic you want... e.g. 'A minimalist gold leaf pattern for a luxury candle label'"
            rows={3}
            className="resize-none"
          />
          <Button onClick={generate} disabled={loading || !prompt.trim()} className="w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Generating..." : "Generate Image"}
          </Button>
          {preview && (
            <div className="space-y-3">
              <div className="border border-border rounded-lg overflow-hidden bg-muted/30 flex justify-center p-2">
                <img src={preview} alt="AI Generated" className="max-h-64 object-contain rounded" />
              </div>
              <div className="flex gap-2">
                <Button onClick={generate} variant="outline" disabled={loading} className="flex-1">
                  Regenerate
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

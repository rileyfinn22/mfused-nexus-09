import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AiEditDialogProps {
  /** Called to capture current canvas/selection as a data URL */
  getCanvasImage: () => string | null;
  onImageGenerated: (dataUrl: string) => void;
}

export function AiEditDialog({ getCanvasImage, onImageGenerated }: AiEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Capture the canvas when dialog opens
      const img = getCanvasImage();
      setSourceImage(img);
      if (!img) {
        toast.error("Could not capture canvas image");
      }
    } else {
      setPreview(null);
      setPrompt("");
      setSourceImage(null);
    }
  };

  const generate = async () => {
    if (!prompt.trim() || !sourceImage) return;
    setLoading(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-design-image", {
        body: {
          prompt: prompt.trim(),
          reference_image: sourceImage,
          edit_mode: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.image_url) throw new Error("No image returned");
      setPreview(data.image_url);
    } catch (err: any) {
      toast.error(err.message || "Failed to edit image");
    } finally {
      setLoading(false);
    }
  };

  const useImage = () => {
    if (preview) {
      onImageGenerated(preview);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Wand2 className="h-3.5 w-3.5" />
          <span className="text-xs">Edit with AI</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Edit with AI
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {sourceImage && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Current canvas snapshot:</p>
              <div className="border border-border rounded-lg overflow-hidden bg-muted/30 flex justify-center p-2">
                <img src={sourceImage} alt="Current canvas" className="max-h-40 object-contain rounded" />
              </div>
            </div>
          )}

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what to change... e.g. 'Change the background color to navy blue', 'Add a gold border around the text', 'Make the logo larger and centered'"
            rows={3}
            className="resize-none"
          />

          <Button onClick={generate} disabled={loading || !prompt.trim() || !sourceImage} className="w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {loading ? "Editing..." : "Apply AI Edit"}
          </Button>

          {preview && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">AI-edited result:</p>
              <div className="border border-border rounded-lg overflow-hidden bg-muted/30 flex justify-center p-2">
                <img src={preview} alt="AI Edited" className="max-h-64 object-contain rounded" />
              </div>
              <div className="flex gap-2">
                <Button onClick={generate} variant="outline" disabled={loading} className="flex-1">
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

import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shapes, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface IconPickerDialogProps {
  onIconSelected: (svgDataUrl: string) => void;
}

interface IconResult {
  prefix: string;
  name: string;
}

export function IconPickerDialog({ onIconSelected }: IconPickerDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [icons, setIcons] = useState<IconResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingIcon, setLoadingIcon] = useState<string | null>(null);

  const searchIcons = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.iconify.design/search?query=${encodeURIComponent(query.trim())}&limit=60`
      );
      const data = await res.json();
      if (data.icons && Array.isArray(data.icons)) {
        setIcons(
          data.icons.map((icon: string) => {
            const [prefix, ...rest] = icon.split(":");
            return { prefix, name: rest.join(":") };
          })
        );
      }
    } catch {
      toast.error("Failed to search icons");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const selectIcon = async (icon: IconResult) => {
    const key = `${icon.prefix}:${icon.name}`;
    setLoadingIcon(key);
    try {
      const res = await fetch(
        `https://api.iconify.design/${icon.prefix}/${icon.name}.svg?width=512&height=512`
      );
      const svgText = await res.text();
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      onIconSelected(dataUrl);
      setOpen(false);
      setQuery("");
      setIcons([]);
    } catch {
      toast.error("Failed to load icon");
    } finally {
      setLoadingIcon(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Shapes className="h-3.5 w-3.5" />
          <span className="text-xs">Icons</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shapes className="h-5 w-5 text-primary" />
            Icon & Clipart Library
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons... e.g. 'leaf', 'star', 'coffee'"
              onKeyDown={(e) => e.key === "Enter" && searchIcons()}
            />
            <Button onClick={searchIcons} disabled={loading} size="icon" variant="outline">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {icons.length > 0 && (
            <div className="grid grid-cols-8 gap-2 max-h-72 overflow-y-auto p-1">
              {icons.map((icon) => {
                const key = `${icon.prefix}:${icon.name}`;
                return (
                  <button
                    key={key}
                    onClick={() => selectIcon(icon)}
                    disabled={loadingIcon === key}
                    className="p-2 rounded-lg border border-border hover:bg-accent hover:border-primary/50 transition-colors flex items-center justify-center aspect-square"
                    title={icon.name}
                  >
                    {loadingIcon === key ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <img
                        src={`https://api.iconify.design/${icon.prefix}/${icon.name}.svg?width=32&height=32`}
                        alt={icon.name}
                        className="w-6 h-6 dark:invert"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {icons.length === 0 && !loading && query && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No results. Try different keywords.
            </p>
          )}
          <p className="text-[10px] text-muted-foreground text-center">
            200,000+ icons powered by Iconify — search by keyword
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

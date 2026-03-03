import { useState, useEffect } from "react";
import { CheckCircle2, X, FileImage } from "lucide-react";
import { cn } from "@/lib/utils";

interface SavedDesignIndicatorProps {
  thumbnailUrl: string | null;
  templateName: string;
  savedAt: Date;
  onDismiss: () => void;
}

export function SavedDesignIndicator({ thumbnailUrl, templateName, savedAt, onDismiss }: SavedDesignIndicatorProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  const timeAgo = () => {
    const diff = Date.now() - savedAt.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return savedAt.toLocaleTimeString();
  };

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 transition-all duration-300 ease-out",
        visible
          ? "translate-y-0 opacity-100 scale-100"
          : "translate-y-4 opacity-0 scale-95"
      )}
    >
      <div className="bg-card border border-border rounded-xl shadow-lg p-3 max-w-[280px] flex gap-3 items-start">
        {/* Thumbnail */}
        <div className="shrink-0 w-14 h-14 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={templateName}
              className="w-full h-full object-contain p-0.5"
            />
          ) : (
            <FileImage className="h-6 w-6 text-muted-foreground/40" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Design Saved
            </span>
          </div>
          <p className="text-xs text-foreground font-medium truncate mt-0.5">
            {templateName}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {timeAgo()} · Linked to your order
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

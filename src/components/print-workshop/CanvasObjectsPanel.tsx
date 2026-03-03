import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Lock, Unlock, Layers, MousePointerClick } from "lucide-react";
import type { Canvas as FabricCanvas, FabricObject } from "fabric";

interface CanvasObjectsPanelProps {
  canvas: FabricCanvas | null;
  onSync: () => void;
}

const INTERNAL_NAMES = new Set(["_trimGuide", "_snapGuide", "_editHighlight", "_zoneSelect", "_drawTextRect", "_unlockZone"]);

function getObjectLabel(obj: any, index: number): string {
  if (obj.name === "pdf_background") return "PDF Background";
  if (obj.name === "_ocrKnockout") return "Text Knockout";
  if (obj.name === "editable_text") return `Text: "${(obj.text || "").substring(0, 20)}${(obj.text || "").length > 20 ? "…" : ""}"`;
  if (obj.name === "locked_text") return `Text (locked): "${(obj.text || "").substring(0, 20)}${(obj.text || "").length > 20 ? "…" : ""}"`;
  if (obj.name === "editable_image") return "Image (editable)";
  if (obj.name === "locked_image") return "Image (locked)";
  
  const type = obj.type || "unknown";
  if (type === "i-text" || type === "textbox") {
    const text = (obj.text || "").substring(0, 20);
    return `Text: "${text}${(obj.text || "").length > 20 ? "…" : ""}"`;
  }
  if (type === "image") return `Image #${index + 1}`;
  if (type === "rect") return `Rectangle #${index + 1}`;
  if (type === "circle") return `Circle #${index + 1}`;
  if (type === "line") return `Line #${index + 1}`;
  return `${type} #${index + 1}`;
}

function getObjectBadge(obj: any): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } | null {
  if (obj.name === "pdf_background") return { label: "BG", variant: "secondary" };
  if (obj.name === "_ocrKnockout") return { label: "Knockout", variant: "outline" };
  if (obj.locked) return { label: "Locked", variant: "outline" };
  if (obj.editable) return { label: "Editable", variant: "default" };
  return null;
}

export function CanvasObjectsPanel({ canvas, onSync }: CanvasObjectsPanelProps) {
  const [open, setOpen] = useState(false);
  const [objects, setObjects] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refreshObjects = useCallback(() => {
    if (!canvas) return;
    const objs = canvas.getObjects().filter((o: any) => !INTERNAL_NAMES.has(o.name));
    setObjects([...objs]);
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;
    refreshObjects();
    const handler = () => refreshObjects();
    canvas.on("object:added", handler);
    canvas.on("object:removed", handler);
    canvas.on("object:modified", handler);
    canvas.on("selection:created", handler);
    canvas.on("selection:cleared", handler);
    return () => {
      canvas.off("object:added", handler);
      canvas.off("object:removed", handler);
      canvas.off("object:modified", handler);
      canvas.off("selection:created", handler);
      canvas.off("selection:cleared", handler);
    };
  }, [canvas, refreshObjects]);

  const selectObject = (obj: any, idx: number) => {
    if (!canvas) return;
    // Make it temporarily selectable so we can select it
    const wasSelectable = obj.selectable;
    obj.set({ selectable: true, evented: true });
    canvas.setActiveObject(obj);
    canvas.renderAll();
    setSelectedId(idx);
  };

  const deleteObject = (obj: any) => {
    if (!canvas) return;
    canvas.remove(obj);
    canvas.renderAll();
    onSync();
    refreshObjects();
  };

  const toggleVisibility = (obj: any) => {
    if (!canvas) return;
    obj.set({ visible: !obj.visible });
    canvas.renderAll();
    onSync();
    refreshObjects();
  };

  // Reverse so top-most objects show first
  const displayObjects = [...objects].reverse();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 w-full justify-between">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            <span className="text-xs">Objects ({objects.length})</span>
          </span>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ScrollArea className="max-h-[500px] mt-2">
          <div className="space-y-1">
            {displayObjects.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No objects on canvas</p>
            )}
            {displayObjects.map((obj, displayIdx) => {
              const realIdx = objects.length - 1 - displayIdx;
              const badge = getObjectBadge(obj);
              const isActive = canvas?.getActiveObject() === obj;
              const isBackground = obj.name === "pdf_background";
              
              return (
                <div
                  key={displayIdx}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs hover:bg-muted/70 cursor-pointer transition-colors ${
                    isActive ? "bg-primary/10 border border-primary/30" : "border border-transparent"
                  }`}
                  onClick={() => selectObject(obj, realIdx)}
                >
                  <MousePointerClick className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{getObjectLabel(obj, realIdx)}</span>
                  {badge && (
                    <Badge variant={badge.variant} className="text-[9px] px-1 py-0 h-4 shrink-0">
                      {badge.label}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleVisibility(obj); }}
                    title={obj.visible === false ? "Show" : "Hide"}
                  >
                    {obj.visible === false ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  {!isBackground && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0 text-destructive shrink-0"
                      onClick={(e) => { e.stopPropagation(); deleteObject(obj); }}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}

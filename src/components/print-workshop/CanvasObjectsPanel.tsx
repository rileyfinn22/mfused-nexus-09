import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Lock, Unlock, Layers, ChevronUp, Pencil } from "lucide-react";
import type { Canvas as FabricCanvas } from "fabric";

interface CanvasObjectsPanelProps {
  canvas: FabricCanvas | null;
  onSync: () => void;
}

// Helper / non-user objects that should never appear in the Layers panel.
const INTERNAL_NAMES = new Set([
  "_trimGuide", "_snapGuide", "_editHighlight", "_zoneSelect", "_drawTextRect",
  "_unlockZone", "_dieline", "_dielineLabel", "_perfDraft",
]);

// Names that should keep their functional meaning when toggling lock state.
function isTextObject(obj: any): boolean {
  const t = (obj?.type || "").toLowerCase();
  return t === "i-text" || t === "itext" || t === "textbox" || t === "text";
}
function isImageObject(obj: any): boolean {
  return (obj?.type || "").toLowerCase() === "image";
}

function getObjectLabel(obj: any, index: number): string {
  if (obj._displayName) return obj._displayName;
  if (obj.name === "pdf_background") return "PDF Background";
  if (obj.name === "_ocrKnockout") return "Text Knockout";
  if (obj.name === "perf_line") return "Perf line";
  if (obj.name === "mask_cover") return "Mask";
  if (obj.name === "editable_text") return `Text: "${(obj.text || "").substring(0, 20)}${(obj.text || "").length > 20 ? "…" : ""}"`;
  if (obj.name === "locked_text") return `Text (locked): "${(obj.text || "").substring(0, 20)}${(obj.text || "").length > 20 ? "…" : ""}"`;
  if (obj.name === "editable_image") return "Image (editable)";
  if (obj.name === "locked_image") return "Image (locked)";

  const type = obj.type || "unknown";
  if (isTextObject(obj)) {
    const text = (obj.text || "").substring(0, 20);
    return `Text: "${text}${(obj.text || "").length > 20 ? "…" : ""}"`;
  }
  if (type === "image") return `Image #${index + 1}`;
  if (type === "rect") return `Rectangle #${index + 1}`;
  if (type === "circle") return `Circle #${index + 1}`;
  if (type === "line") return `Line #${index + 1}`;
  if (type === "path") return `Shape #${index + 1}`;
  return `${type} #${index + 1}`;
}

function getObjectBadge(obj: any): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } | null {
  if (obj.name === "pdf_background") return { label: "BG", variant: "secondary" };
  if (obj.name === "_ocrKnockout") return { label: "Knockout", variant: "outline" };
  if (obj.name === "perf_line") return { label: "Perf", variant: "outline" };
  if (obj.locked) return { label: "Locked", variant: "outline" };
  if (obj.editable) return { label: "Editable", variant: "default" };
  return null;
}

export function CanvasObjectsPanel({ canvas, onSync }: CanvasObjectsPanelProps) {
  const [open, setOpen] = useState(false);
  const [objects, setObjects] = useState<any[]>([]);
  const [, forceTick] = useState(0);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const refreshObjects = useCallback(() => {
    if (!canvas) return;
    const objs = canvas.getObjects().filter((o: any) => !INTERNAL_NAMES.has(o.name));
    setObjects([...objs]);
    forceTick((n) => n + 1);
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;
    refreshObjects();
    const handler = () => refreshObjects();
    canvas.on("object:added", handler);
    canvas.on("object:removed", handler);
    canvas.on("object:modified", handler);
    canvas.on("selection:created", handler);
    canvas.on("selection:updated", handler);
    canvas.on("selection:cleared", handler);
    return () => {
      canvas.off("object:added", handler);
      canvas.off("object:removed", handler);
      canvas.off("object:modified", handler);
      canvas.off("selection:created", handler);
      canvas.off("selection:updated", handler);
      canvas.off("selection:cleared", handler);
    };
  }, [canvas, refreshObjects]);

  useEffect(() => {
    if (renamingKey && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingKey]);

  // Keep the auto dieline guides, perf lines and trim guide above artwork after reordering.
  const reassertTopLayers = useCallback((c: FabricCanvas) => {
    const front = (pred: (o: any) => boolean) =>
      c.getObjects().filter(pred).forEach((o: any) => c.bringObjectToFront(o));
    front((o) => o.name === "perf_line");
    front((o) => o.name === "_dieline" || o.name === "_dielineLabel");
    front((o) => o.name === "_trimGuide");
  }, []);

  const selectObject = (obj: any) => {
    if (!canvas) return;
    obj.set({ selectable: true, evented: true });
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    forceTick((n) => n + 1);
  };

  const deleteObject = (obj: any) => {
    if (!canvas) return;
    canvas.remove(obj);
    canvas.requestRenderAll();
    onSync();
    refreshObjects();
  };

  const toggleVisibility = (obj: any) => {
    if (!canvas) return;
    obj.set({ visible: !obj.visible });
    canvas.requestRenderAll();
    onSync();
    refreshObjects();
  };

  const toggleLock = (obj: any) => {
    if (!canvas) return;
    const nowLocked = !obj.locked;
    obj.locked = nowLocked;
    obj.editable = !nowLocked;
    // Keep functional name in sync so the rest of the app (use mode, export) behaves.
    if (isTextObject(obj)) obj.name = nowLocked ? "locked_text" : "editable_text";
    else if (isImageObject(obj)) obj.name = nowLocked ? "locked_image" : "editable_image";
    obj.set({
      borderColor: nowLocked ? "#94a3b8" : "#3b82f6",
      cornerColor: nowLocked ? "#94a3b8" : "#3b82f6",
    });
    canvas.requestRenderAll();
    onSync();
    refreshObjects();
  };

  const moveLayer = (obj: any, dir: "up" | "down") => {
    if (!canvas) return;
    // Panel shows top-most first, so "up" = bring forward in z-order.
    if (dir === "up") canvas.bringObjectForward(obj);
    else canvas.sendObjectBackwards(obj);
    reassertTopLayers(canvas);
    canvas.requestRenderAll();
    onSync();
    refreshObjects();
  };

  const setOpacity = (obj: any, pct: number) => {
    if (!canvas) return;
    obj.set({ opacity: Math.max(0, Math.min(1, pct / 100)) });
    canvas.requestRenderAll();
    refreshObjects();
  };

  const commitRename = (obj: any) => {
    const v = renameValue.trim();
    obj._displayName = v || undefined;
    setRenamingKey(null);
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
            <span className="text-xs">Layers ({objects.length})</span>
          </span>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 max-h-[460px] overflow-y-auto border border-border rounded-md p-1">
          <div className="space-y-1">
            {displayObjects.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No layers on canvas</p>
            )}
            {displayObjects.map((obj, displayIdx) => {
              const realIdx = objects.length - 1 - displayIdx;
              const key = `${realIdx}-${obj.name || obj.type}`;
              const badge = getObjectBadge(obj);
              const isActive = canvas?.getActiveObject() === obj;
              const isBackground = obj.name === "pdf_background";
              const isTop = displayIdx === 0;
              const isBottom = displayIdx === displayObjects.length - 1;
              const opacityPct = Math.round(((obj.opacity ?? 1) as number) * 100);
              const isRenaming = renamingKey === key;

              return (
                <div
                  key={key}
                  className={`rounded text-xs transition-colors ${
                    isActive ? "bg-primary/10 border border-primary/30" : "border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-muted/70">
                    {/* Reorder */}
                    <div className="flex flex-col -my-1 shrink-0">
                      <button
                        className="h-3.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={isTop}
                        onClick={(e) => { e.stopPropagation(); moveLayer(obj, "up"); }}
                        title="Move up"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        className="h-3.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={isBottom}
                        onClick={(e) => { e.stopPropagation(); moveLayer(obj, "down"); }}
                        title="Move down"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Name / rename */}
                    {isRenaming ? (
                      <Input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(obj)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(obj);
                          if (e.key === "Escape") setRenamingKey(null);
                        }}
                        className="h-6 text-xs flex-1"
                      />
                    ) : (
                      <span
                        className="truncate flex-1 cursor-pointer"
                        onClick={() => selectObject(obj)}
                        onDoubleClick={() => { setRenamingKey(key); setRenameValue(obj._displayName || getObjectLabel(obj, realIdx)); }}
                        title="Click to select · double-click to rename"
                      >
                        {getObjectLabel(obj, realIdx)}
                      </span>
                    )}

                    {badge && !isRenaming && (
                      <Badge variant={badge.variant} className="text-[9px] px-1 py-0 h-4 shrink-0">
                        {badge.label}
                      </Badge>
                    )}

                    {/* Controls */}
                    {!isRenaming && (
                      <>
                        <Button
                          size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0"
                          onClick={(e) => { e.stopPropagation(); setRenamingKey(key); setRenameValue(obj._displayName || getObjectLabel(obj, realIdx)); }}
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {!isBackground && (
                          <Button
                            size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0"
                            onClick={(e) => { e.stopPropagation(); toggleLock(obj); }}
                            title={obj.locked ? "Unlock (let customers edit)" : "Lock (customers can't edit)"}
                          >
                            {obj.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0"
                          onClick={(e) => { e.stopPropagation(); toggleVisibility(obj); }}
                          title={obj.visible === false ? "Show" : "Hide"}
                        >
                          {obj.visible === false ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        {!isBackground && (
                          <Button
                            size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive shrink-0"
                            onClick={(e) => { e.stopPropagation(); deleteObject(obj); }}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Opacity — only for the selected layer to keep rows compact */}
                  {isActive && !isRenaming && (
                    <div className="flex items-center gap-2 px-2 pb-2 pt-0.5">
                      <span className="text-[10px] text-muted-foreground w-12 shrink-0">Opacity</span>
                      <Slider
                        value={[opacityPct]}
                        min={0} max={100} step={1}
                        onValueChange={(v) => setOpacity(obj, v[0])}
                        onValueCommit={() => onSync()}
                        className="flex-1"
                      />
                      <span className="text-[10px] text-muted-foreground w-7 text-right shrink-0">{opacityPct}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas as FabricCanvas, IText, Rect, Image as FabricImage, FabricObject } from "fabric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bold, Italic, Type, Lock, Unlock, Plus, Trash2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TemplateEditorProps {
  canvasData?: any;
  width: number;
  height: number;
  bleed: number;
  onCanvasChange?: (data: any) => void;
  mode: "edit" | "use"; // "edit" = building template, "use" = filling in editable fields
}

export function TemplateEditor({ canvasData, width, height, bleed, onCanvasChange, mode }: TemplateEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null);
  const [fontSize, setFontSize] = useState(16);

  const DPI = 72; // screen DPI for preview
  const canvasWidth = Math.round((width + bleed * 2) * DPI);
  const canvasHeight = Math.round((height + bleed * 2) * DPI);
  const bleedPx = Math.round(bleed * DPI);

  const syncCanvas = useCallback(() => {
    if (fabricRef.current && onCanvasChange) {
      onCanvasChange(fabricRef.current.toObject(['locked', 'editable', 'name']));
    }
  }, [onCanvasChange]);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = new FabricCanvas(canvasRef.current);
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight });
    canvas.backgroundColor = "#ffffff";
    canvas.selection = mode === "edit";

    fabricRef.current = canvas;

    // Draw bleed/trim guides
    const trimRect = new Rect({
      left: bleedPx,
      top: bleedPx,
      width: canvasWidth - bleedPx * 2,
      height: canvasHeight - bleedPx * 2,
      fill: "transparent",
      stroke: "#ef4444",
      strokeWidth: 1,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
      name: "_trimGuide",
    });
    canvas.add(trimRect);

    // Load existing canvas data
    if (canvasData && canvasData.objects?.length > 0) {
      canvas.loadFromJSON(canvasData).then(() => {
        // Re-add trim guide if missing
        const hasTrim = canvas.getObjects().some((o: any) => o.name === "_trimGuide");
        if (!hasTrim) {
          canvas.add(trimRect);
        }

        if (mode === "use") {
          canvas.getObjects().forEach((obj: any) => {
            if (obj.name === "_trimGuide") return;
            if (obj.locked || !obj.editable) {
              obj.set({
                selectable: false,
                evented: false,
                hasControls: false,
                lockMovementX: true,
                lockMovementY: true,
              });
            } else {
              obj.set({
                selectable: true,
                evented: true,
                hasControls: true,
                borderColor: "#3b82f6",
                cornerColor: "#3b82f6",
                cornerStyle: "circle",
                transparentCorners: false,
              });
            }
          });
        }
        canvas.renderAll();
      });
    }

    canvas.on("selection:created", (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        setSelectedObject(obj);
        if ((obj as any).fontSize) setFontSize((obj as any).fontSize);
      }
    });
    canvas.on("selection:updated", (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        setSelectedObject(obj);
        if ((obj as any).fontSize) setFontSize((obj as any).fontSize);
      }
    });
    canvas.on("selection:cleared", () => setSelectedObject(null));
    canvas.on("object:modified", syncCanvas);
    canvas.on("text:changed", syncCanvas);

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [canvasWidth, canvasHeight, bleedPx, mode]);

  const addText = (editable: boolean) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const text = new IText(editable ? "Edit me" : "Locked text", {
      left: bleedPx + 20,
      top: bleedPx + 20 + canvas.getObjects().length * 30,
      fontSize: 16,
      fontFamily: "Arial",
      fill: "#000000",
      editable: true,
    });
    (text as any).locked = !editable;
    (text as any).editable = editable;
    (text as any).name = editable ? "editable_text" : "locked_text";
    
    if (!editable) {
      text.set({
        borderColor: "#94a3b8",
        cornerColor: "#94a3b8",
      });
    } else {
      text.set({
        borderColor: "#3b82f6",
        cornerColor: "#3b82f6",
        cornerStyle: "circle",
        transparentCorners: false,
      });
    }
    
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    syncCanvas();
  };

  const addBackgroundImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const imgEl = new window.Image();
        imgEl.onload = () => {
          const fabricImg = new FabricImage(imgEl, {
            left: 0,
            top: 0,
          });
          fabricImg.scaleToWidth(canvasWidth);
          (fabricImg as any).locked = true;
          (fabricImg as any).editable = false;
          (fabricImg as any).name = "background_image";
          canvas.add(fabricImg);
          canvas.sendObjectToBack(fabricImg);
          // Move trim guide to top
          const trim = canvas.getObjects().find((o: any) => o.name === "_trimGuide");
          if (trim) canvas.bringObjectToFront(trim);
          canvas.renderAll();
          syncCanvas();
        };
        imgEl.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const toggleLock = () => {
    if (!selectedObject || !fabricRef.current) return;
    const isLocked = (selectedObject as any).locked;
    (selectedObject as any).locked = !isLocked;
    (selectedObject as any).editable = isLocked;
    selectedObject.set({
      borderColor: isLocked ? "#3b82f6" : "#94a3b8",
      cornerColor: isLocked ? "#3b82f6" : "#94a3b8",
    });
    fabricRef.current.renderAll();
    syncCanvas();
    setSelectedObject({ ...selectedObject } as any);
  };

  const deleteSelected = () => {
    if (!selectedObject || !fabricRef.current) return;
    fabricRef.current.remove(selectedObject);
    setSelectedObject(null);
    syncCanvas();
  };

  const applyFontSize = (size: number) => {
    if (!selectedObject || !fabricRef.current) return;
    setFontSize(size);
    (selectedObject as any).set("fontSize", size);
    fabricRef.current.renderAll();
    syncCanvas();
  };

  const toggleBold = () => {
    if (!selectedObject || !fabricRef.current) return;
    const current = (selectedObject as any).fontWeight;
    (selectedObject as any).set("fontWeight", current === "bold" ? "normal" : "bold");
    fabricRef.current.renderAll();
    syncCanvas();
  };

  const toggleItalic = () => {
    if (!selectedObject || !fabricRef.current) return;
    const current = (selectedObject as any).fontStyle;
    (selectedObject as any).set("fontStyle", current === "italic" ? "normal" : "italic");
    fabricRef.current.renderAll();
    syncCanvas();
  };

  const getCanvasForExport = () => fabricRef.current;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border flex-wrap">
        {mode === "edit" && (
          <>
            <Button size="sm" variant="outline" onClick={() => addText(false)} className="gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              <span className="text-xs">Locked Text</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => addText(true)} className="gap-1.5">
              <Unlock className="h-3.5 w-3.5" />
              <span className="text-xs">Editable Text</span>
            </Button>
            <Button size="sm" variant="outline" onClick={addBackgroundImage} className="gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="text-xs">Background</span>
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
          </>
        )}

        {selectedObject && (
          <>
            <div className="flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="number"
                value={fontSize}
                onChange={(e) => applyFontSize(Number(e.target.value))}
                className="w-16 h-8 text-xs"
                min={8}
                max={120}
              />
            </div>
            <Button size="sm" variant="ghost" onClick={toggleBold} className="h-8 w-8 p-0">
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={toggleItalic} className="h-8 w-8 p-0">
              <Italic className="h-3.5 w-3.5" />
            </Button>
            {mode === "edit" && (
              <>
                <div className="w-px h-6 bg-border mx-1" />
                <Button size="sm" variant="ghost" onClick={toggleLock} className="h-8 gap-1.5">
                  {(selectedObject as any).locked ? (
                    <><Lock className="h-3.5 w-3.5" /><span className="text-xs">Locked</span></>
                  ) : (
                    <><Unlock className="h-3.5 w-3.5" /><span className="text-xs">Editable</span></>
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={deleteSelected} className="h-8 w-8 p-0 text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {/* Canvas */}
      <div className="border border-border rounded-lg overflow-auto bg-muted/30 p-4 flex justify-center">
        <div className="shadow-lg">
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Dimensions info */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{width}" × {height}" label</span>
        <span>{bleed}" bleed</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 border-t border-dashed border-destructive inline-block" />
          Trim line
        </span>
      </div>
    </div>
  );
}

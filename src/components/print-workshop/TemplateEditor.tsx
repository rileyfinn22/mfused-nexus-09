import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas as FabricCanvas, IText, Rect, Image as FabricImage, FabricObject } from "fabric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bold, Italic, Type, Lock, Unlock, Trash2, ImageIcon, Upload } from "lucide-react";

// Popular print-ready fonts (web-safe + Google Fonts)
const FONT_OPTIONS = [
  // Web-safe
  { label: "Arial", value: "Arial", google: false },
  { label: "Helvetica", value: "Helvetica", google: false },
  { label: "Times New Roman", value: "Times New Roman", google: false },
  { label: "Georgia", value: "Georgia", google: false },
  { label: "Courier New", value: "Courier New", google: false },
  { label: "Verdana", value: "Verdana", google: false },
  { label: "Impact", value: "Impact", google: false },
  // Google Fonts (loaded on demand)
  { label: "Roboto", value: "Roboto", google: true },
  { label: "Open Sans", value: "Open Sans", google: true },
  { label: "Lato", value: "Lato", google: true },
  { label: "Montserrat", value: "Montserrat", google: true },
  { label: "Oswald", value: "Oswald", google: true },
  { label: "Poppins", value: "Poppins", google: true },
  { label: "Playfair Display", value: "Playfair Display", google: true },
  { label: "Raleway", value: "Raleway", google: true },
  { label: "Bebas Neue", value: "Bebas Neue", google: true },
  { label: "Barlow", value: "Barlow", google: true },
  { label: "Barlow Condensed", value: "Barlow Condensed", google: true },
  { label: "DM Sans", value: "DM Sans", google: true },
  { label: "Inter", value: "Inter", google: true },
  { label: "Nunito", value: "Nunito", google: true },
  { label: "Work Sans", value: "Work Sans", google: true },
  { label: "Libre Baskerville", value: "Libre Baskerville", google: true },
  { label: "Merriweather", value: "Merriweather", google: true },
  { label: "PT Serif", value: "PT Serif", google: true },
  { label: "Source Sans 3", value: "Source Sans 3", google: true },
  { label: "Archivo", value: "Archivo", google: true },
  { label: "Archivo Black", value: "Archivo Black", google: true },
];

const loadedFonts = new Set<string>();

function loadGoogleFont(fontFamily: string): Promise<void> {
  if (loadedFonts.has(fontFamily)) return Promise.resolve();
  return new Promise((resolve) => {
    const encoded = fontFamily.replace(/ /g, "+");
    const link = document.createElement("link");
    link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;700&display=swap`;
    link.rel = "stylesheet";
    link.onload = () => {
      loadedFonts.add(fontFamily);
      // Give browser a moment to register the font
      document.fonts.ready.then(() => resolve());
    };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

interface TemplateEditorProps {
  canvasData?: any;
  width: number;
  height: number;
  bleed: number;
  onCanvasChange?: (data: any) => void;
  mode: "edit" | "use";
}

export function TemplateEditor({ canvasData, width, height, bleed, onCanvasChange, mode }: TemplateEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("Arial");

  const DPI = 72;
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

    if (canvasData && canvasData.objects?.length > 0) {
      canvas.loadFromJSON(canvasData).then(() => {
        const hasTrim = canvas.getObjects().some((o: any) => o.name === "_trimGuide");
        if (!hasTrim) canvas.add(trimRect);

        if (mode === "use") {
          canvas.getObjects().forEach((obj: any) => {
            if (obj.name === "_trimGuide") return;
            if (obj.locked || !obj.editable) {
              obj.set({ selectable: false, evented: false, hasControls: false, lockMovementX: true, lockMovementY: true });
            } else {
              obj.set({ selectable: true, evented: true, hasControls: true, borderColor: "#3b82f6", cornerColor: "#3b82f6", cornerStyle: "circle", transparentCorners: false });
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
        if ((obj as any).fontFamily) setFontFamily((obj as any).fontFamily);
      }
    });
    canvas.on("selection:updated", (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        setSelectedObject(obj);
        if ((obj as any).fontSize) setFontSize((obj as any).fontSize);
        if ((obj as any).fontFamily) setFontFamily((obj as any).fontFamily);
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

    text.set({
      borderColor: editable ? "#3b82f6" : "#94a3b8",
      cornerColor: editable ? "#3b82f6" : "#94a3b8",
      cornerStyle: editable ? "circle" : undefined,
      transparentCorners: editable ? false : undefined,
    } as any);

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    syncCanvas();
  };

  const addBackgroundImage = () => {
    pickImageFile((imgEl) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const fabricImg = new FabricImage(imgEl, { left: 0, top: 0 });
      fabricImg.scaleToWidth(canvasWidth);
      (fabricImg as any).locked = true;
      (fabricImg as any).editable = false;
      (fabricImg as any).name = "background_image";
      canvas.add(fabricImg);
      canvas.sendObjectToBack(fabricImg);
      const trim = canvas.getObjects().find((o: any) => o.name === "_trimGuide");
      if (trim) canvas.bringObjectToFront(trim);
      canvas.renderAll();
      syncCanvas();
    });
  };

  const addArtworkImage = (editable: boolean) => {
    pickImageFile((imgEl) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const fabricImg = new FabricImage(imgEl, {
        left: bleedPx + 30,
        top: bleedPx + 30,
      });
      // Scale to fit within canvas while keeping aspect ratio
      const maxW = canvasWidth * 0.6;
      const maxH = canvasHeight * 0.6;
      const scale = Math.min(maxW / imgEl.width, maxH / imgEl.height, 1);
      fabricImg.scale(scale);
      (fabricImg as any).locked = !editable;
      (fabricImg as any).editable = editable;
      (fabricImg as any).name = editable ? "editable_image" : "locked_image";
      fabricImg.set({
        borderColor: editable ? "#3b82f6" : "#94a3b8",
        cornerColor: editable ? "#3b82f6" : "#94a3b8",
        cornerStyle: editable ? "circle" : undefined,
        transparentCorners: editable ? false : undefined,
      } as any);
      canvas.add(fabricImg);
      // Keep trim guide on top
      const trim = canvas.getObjects().find((o: any) => o.name === "_trimGuide");
      if (trim) canvas.bringObjectToFront(trim);
      canvas.setActiveObject(fabricImg);
      canvas.renderAll();
      syncCanvas();
    });
  };

  function pickImageFile(onLoad: (img: HTMLImageElement) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imgEl = new window.Image();
        imgEl.onload = () => onLoad(imgEl);
        imgEl.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

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

  const applyFontFamily = async (family: string) => {
    if (!selectedObject || !fabricRef.current) return;
    const fontDef = FONT_OPTIONS.find((f) => f.value === family);
    if (fontDef?.google) {
      await loadGoogleFont(family);
    }
    setFontFamily(family);
    (selectedObject as any).set("fontFamily", family);
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

  const isTextObject = selectedObject && ((selectedObject as any).type === "i-text" || (selectedObject as any).type === "textbox" || (selectedObject as any).type === "text");

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
            <div className="w-px h-6 bg-border mx-1" />
            <Button size="sm" variant="outline" onClick={addBackgroundImage} className="gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="text-xs">Background</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => addArtworkImage(false)} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              <span className="text-xs">Locked Image</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => addArtworkImage(true)} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              <span className="text-xs">Editable Image</span>
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
          </>
        )}

        {mode === "use" && selectedObject && (selectedObject as any).editable && (selectedObject as any).type?.includes("image") && (
          <Button size="sm" variant="outline" onClick={() => {
            pickImageFile((imgEl) => {
              const canvas = fabricRef.current;
              if (!canvas || !selectedObject) return;
              const newImg = new FabricImage(imgEl, {
                left: (selectedObject as any).left,
                top: (selectedObject as any).top,
                scaleX: (selectedObject as any).scaleX,
                scaleY: (selectedObject as any).scaleY,
              });
              (newImg as any).locked = false;
              (newImg as any).editable = true;
              (newImg as any).name = "editable_image";
              newImg.set({ borderColor: "#3b82f6", cornerColor: "#3b82f6", cornerStyle: "circle", transparentCorners: false } as any);
              const idx = canvas.getObjects().indexOf(selectedObject);
              canvas.remove(selectedObject);
              canvas.insertAt(idx, newImg);
              canvas.setActiveObject(newImg);
              canvas.renderAll();
              syncCanvas();
            });
          }} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            <span className="text-xs">Replace Image</span>
          </Button>
        )}

        {selectedObject && isTextObject && (
          <>
            <div className="flex items-center gap-1.5">
              <Select value={fontFamily} onValueChange={applyFontFamily}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">System Fonts</div>
                  {FONT_OPTIONS.filter(f => !f.google).map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>
                      {f.label}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Google Fonts</div>
                  {FONT_OPTIONS.filter(f => f.google).map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </>
        )}

        {selectedObject && mode === "edit" && (
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

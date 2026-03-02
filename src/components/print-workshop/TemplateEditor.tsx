import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas as FabricCanvas, IText, Rect, Image as FabricImage, FabricObject } from "fabric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bold, Italic, Type, Lock, Unlock, Trash2, ImageIcon, Upload, FileText } from "lucide-react";
import { AiImageDialog } from "./AiImageDialog";
import { IconPickerDialog } from "./IconPickerDialog";
import { generatePdfThumbnailFromFile } from "@/lib/pdfThumbnail";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  // Google Fonts — expanded selection
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
  // Additional popular & display fonts
  { label: "Anton", value: "Anton", google: true },
  { label: "Abril Fatface", value: "Abril Fatface", google: true },
  { label: "Bitter", value: "Bitter", google: true },
  { label: "Cabin", value: "Cabin", google: true },
  { label: "Caveat", value: "Caveat", google: true },
  { label: "Cinzel", value: "Cinzel", google: true },
  { label: "Comfortaa", value: "Comfortaa", google: true },
  { label: "Cormorant Garamond", value: "Cormorant Garamond", google: true },
  { label: "Dancing Script", value: "Dancing Script", google: true },
  { label: "DM Serif Display", value: "DM Serif Display", google: true },
  { label: "Exo 2", value: "Exo 2", google: true },
  { label: "Fjalla One", value: "Fjalla One", google: true },
  { label: "Fira Sans", value: "Fira Sans", google: true },
  { label: "Great Vibes", value: "Great Vibes", google: true },
  { label: "Josefin Sans", value: "Josefin Sans", google: true },
  { label: "Josefin Slab", value: "Josefin Slab", google: true },
  { label: "Kanit", value: "Kanit", google: true },
  { label: "Kalam", value: "Kalam", google: true },
  { label: "Lexend", value: "Lexend", google: true },
  { label: "Lobster", value: "Lobster", google: true },
  { label: "Lora", value: "Lora", google: true },
  { label: "Manrope", value: "Manrope", google: true },
  { label: "Mulish", value: "Mulish", google: true },
  { label: "Noto Sans", value: "Noto Sans", google: true },
  { label: "Noto Serif", value: "Noto Serif", google: true },
  { label: "Nunito Sans", value: "Nunito Sans", google: true },
  { label: "Outfit", value: "Outfit", google: true },
  { label: "Pacifico", value: "Pacifico", google: true },
  { label: "Permanent Marker", value: "Permanent Marker", google: true },
  { label: "PT Sans", value: "PT Sans", google: true },
  { label: "Quicksand", value: "Quicksand", google: true },
  { label: "Righteous", value: "Righteous", google: true },
  { label: "Roboto Condensed", value: "Roboto Condensed", google: true },
  { label: "Roboto Slab", value: "Roboto Slab", google: true },
  { label: "Rubik", value: "Rubik", google: true },
  { label: "Sacramento", value: "Sacramento", google: true },
  { label: "Satisfy", value: "Satisfy", google: true },
  { label: "Silkscreen", value: "Silkscreen", google: true },
  { label: "Space Grotesk", value: "Space Grotesk", google: true },
  { label: "Space Mono", value: "Space Mono", google: true },
  { label: "Spectral", value: "Spectral", google: true },
  { label: "Syne", value: "Syne", google: true },
  { label: "Teko", value: "Teko", google: true },
  { label: "Titillium Web", value: "Titillium Web", google: true },
  { label: "Ubuntu", value: "Ubuntu", google: true },
  { label: "Yanone Kaffeesatz", value: "Yanone Kaffeesatz", google: true },
  { label: "Zilla Slab", value: "Zilla Slab", google: true },
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
  onSourcePdfChange?: (path: string) => void;
  sourcePdfPath?: string;
  mode: "edit" | "use";
}

export function TemplateEditor({ canvasData, width, height, bleed, onCanvasChange, onSourcePdfChange, sourcePdfPath, mode }: TemplateEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null);
  const [fontSearch, setFontSearch] = useState("");
  const [fontSizePt, setFontSizePt] = useState(12);

  // Convert between typographic points and canvas pixels at current DPI
  // 1 pt = 1/72 inch, so at N DPI: 1pt = DPI/72 pixels
  const ptToPx = (pt: number) => Math.round(pt * (DPI / 72));
  const pxToPt = (px: number) => Math.round((px * 72) / DPI * 10) / 10;
  const [fontFamily, setFontFamily] = useState("Arial");

  // Internal resolution for print quality
  const DPI = 150;
  const canvasWidth = Math.round((width + bleed * 2) * DPI);
  const canvasHeight = Math.round((height + bleed * 2) * DPI);
  const bleedPx = Math.round(bleed * DPI);

  // Display: fit into ~900px wide, accounting for device pixel ratio for crisp rendering
  const TARGET_DISPLAY_WIDTH = 900;
  const TARGET_DISPLAY_HEIGHT = 750;
  // Oversample imported PDF backgrounds so rasterized text stays sharp in preview
  const PDF_BACKGROUND_OVERSAMPLE = 4;
  const displayScale = Math.min(TARGET_DISPLAY_WIDTH / canvasWidth, TARGET_DISPLAY_HEIGHT / canvasHeight, 1.5);
  const cssWidth = Math.round(canvasWidth * displayScale);
  const cssHeight = Math.round(canvasHeight * displayScale);
  // Use device pixel ratio so retina screens get a sharp backing buffer
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

  const syncCanvas = useCallback(() => {
    if (fabricRef.current && onCanvasChange) {
      // Exclude backgroundImage + trim guide from serialization.
      // Background is re-rendered from sourcePdfPath and trim guide is re-created on load.
      const data = fabricRef.current.toObject(['locked', 'editable', 'name']) as any;
      delete data.backgroundImage;
      if (Array.isArray(data.objects)) {
        data.objects = data.objects.filter((obj: any) => obj?.name !== "_trimGuide");
      }
      onCanvasChange(data);
    }
  }, [onCanvasChange]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current);
    // Backing buffer at display size * DPR for retina sharpness
    const backingW = Math.round(cssWidth * dpr);
    const backingH = Math.round(cssHeight * dpr);
    canvas.setDimensions({ width: backingW, height: backingH });
    // Zoom maps logical canvas coords (canvasWidth) → backing pixels
    canvas.setZoom(displayScale * dpr);
    // CSS size = what user sees on screen
    canvas.setDimensions({ width: cssWidth, height: cssHeight }, { cssOnly: true });
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
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      name: "_trimGuide",
    });
    // Trim guide is injected after JSON load to avoid persisted/selectable stale guides.

    const loadCanvasAndBackground = async () => {
      if (canvasData && canvasData.objects?.length > 0) {
        const safeCanvasData = JSON.parse(JSON.stringify(canvasData));
        if (safeCanvasData?.backgroundImage?.src?.startsWith("blob:")) {
          delete safeCanvasData.backgroundImage;
        }
        await canvas.loadFromJSON(safeCanvasData);
      }

      // Remove any persisted trim guides (from older saves) and inject a fresh locked one
      canvas.getObjects()
        .filter((o: any) => o.name === "_trimGuide")
        .forEach((o) => canvas.remove(o));
      canvas.add(trimRect);
      canvas.bringObjectToFront(trimRect);

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

      // Re-render PDF background from stored source path
      if (sourcePdfPath) {
        try {
          const { data: urlData } = supabase.storage.from("print-files").getPublicUrl(sourcePdfPath);
          const resp = await fetch(urlData.publicUrl);
          if (resp.ok) {
            const buf = await resp.arrayBuffer();
            const { generatePdfThumbnailFromArrayBuffer } = await import("@/lib/pdfThumbnail");
            const blob = await generatePdfThumbnailFromArrayBuffer(buf, {
              maxWidth: canvasWidth * PDF_BACKGROUND_OVERSAMPLE,
              scale: 1,
            });
            const url = URL.createObjectURL(blob);
            const imgEl = new window.Image();
            imgEl.onload = () => {
              const fabricImg = new FabricImage(imgEl, {
                left: 0, top: 0, selectable: false, evented: false, objectCaching: false,
              } as any);
              const scaleX = canvasWidth / imgEl.width;
              const scaleY = canvasHeight / imgEl.height;
              fabricImg.set({ scaleX, scaleY });
              canvas.backgroundImage = fabricImg;
              canvas.renderAll();
              URL.revokeObjectURL(url);
            };
            imgEl.src = url;
          }
        } catch (err) {
          console.warn("Could not re-render PDF background:", err);
        }
      }

      canvas.renderAll();
    };

    loadCanvasAndBackground();

    canvas.on("selection:created", (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        setSelectedObject(obj);
        if ((obj as any).fontSize) setFontSizePt(pxToPt((obj as any).fontSize));
        if ((obj as any).fontFamily) setFontFamily((obj as any).fontFamily);
      }
    });
    canvas.on("selection:updated", (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        setSelectedObject(obj);
        if ((obj as any).fontSize) setFontSizePt(pxToPt((obj as any).fontSize));
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
  }, [canvasWidth, canvasHeight, bleedPx, mode, displayScale, dpr, cssWidth, cssHeight]);

  const addText = (editable: boolean) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const defaultPt = fontSizePt || 12;
    const text = new IText(editable ? "Edit me" : "Locked text", {
      left: bleedPx + 20,
      top: bleedPx + 20 + canvas.getObjects().length * 30,
      fontSize: ptToPx(defaultPt),
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

  const setCanvasBackground = (imgEl: HTMLImageElement) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Keep PDF/image backgrounds crisp when they are downscaled for display.
    const fabricImg = new FabricImage(imgEl, {
      left: 0,
      top: 0,
      selectable: false,
      evented: false,
      objectCaching: false,
    } as any);

    // Scale to fill the entire canvas (cover mode)
    const scaleX = canvasWidth / imgEl.width;
    const scaleY = canvasHeight / imgEl.height;
    fabricImg.set({ scaleX, scaleY });
    canvas.backgroundImage = fabricImg;
    canvas.renderAll();
    syncCanvas();
  };

  const addBackgroundImage = () => {
    pickImageFile((imgEl) => setCanvasBackground(imgEl));
  };

  const addPdfBackground = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        // 1. Upload original PDF to storage for print-ready export
        const storagePath = `templates/${crypto.randomUUID()}/source.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("print-files")
          .upload(storagePath, file, { contentType: "application/pdf", upsert: true });
        if (uploadError) {
          console.error("PDF upload error:", uploadError);
          toast.error("Failed to upload PDF to storage");
        } else {
          onSourcePdfChange?.(storagePath);
          toast.success("Original PDF stored for print-ready export");
        }

        // 2. Render preview at 2x canvas width for sharp on-screen proofing
        const blob = await generatePdfThumbnailFromFile(file, {
          maxWidth: canvasWidth * PDF_BACKGROUND_OVERSAMPLE,
          scale: 1,
        });
        const url = URL.createObjectURL(blob);
        const imgEl = new window.Image();
        imgEl.onload = () => {
          setCanvasBackground(imgEl);
          URL.revokeObjectURL(url);
        };
        imgEl.src = url;
      } catch (err: any) {
        console.error("PDF render error:", err);
        alert("Failed to render PDF. Make sure it's a valid PDF file.");
      }
    };
    input.click();
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

  const addImageFromDataUrl = (dataUrl: string, editable: boolean = true) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const imgEl = new window.Image();
    imgEl.onload = () => {
      const fabricImg = new FabricImage(imgEl, {
        left: bleedPx + 30,
        top: bleedPx + 30,
      });
      const maxW = canvasWidth * 0.5;
      const maxH = canvasHeight * 0.5;
      const scale = Math.min(maxW / imgEl.width, maxH / imgEl.height, 1);
      fabricImg.scale(scale);
      (fabricImg as any).locked = !editable;
      (fabricImg as any).editable = editable;
      (fabricImg as any).name = editable ? "editable_image" : "locked_image";
      fabricImg.set({
        borderColor: "#3b82f6",
        cornerColor: "#3b82f6",
        cornerStyle: "circle",
        transparentCorners: false,
      } as any);
      canvas.add(fabricImg);
      const trim = canvas.getObjects().find((o: any) => o.name === "_trimGuide");
      if (trim) canvas.bringObjectToFront(trim);
      canvas.setActiveObject(fabricImg);
      canvas.renderAll();
      syncCanvas();
    };
    imgEl.src = dataUrl;
  };

  const applyFontSize = (sizePt: number) => {
    if (!selectedObject || !fabricRef.current) return;
    setFontSizePt(sizePt);
    (selectedObject as any).set("fontSize", ptToPx(sizePt));
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
              <span className="text-xs">Image BG</span>
            </Button>
            <Button size="sm" variant="outline" onClick={addPdfBackground} className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span className="text-xs">PDF BG</span>
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
            <AiImageDialog onImageGenerated={(dataUrl) => addImageFromDataUrl(dataUrl, true)} />
            <IconPickerDialog onIconSelected={(dataUrl) => addImageFromDataUrl(dataUrl, true)} />
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
              <Select value={fontFamily} onValueChange={(v) => { applyFontFamily(v); setFontSearch(""); }}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[350px]">
                  <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                    <Input
                      value={fontSearch}
                      onChange={(e) => setFontSearch(e.target.value)}
                      placeholder="Search fonts..."
                      className="h-7 text-xs"
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  {(() => {
                    const q = fontSearch.toLowerCase();
                    const systemFonts = FONT_OPTIONS.filter(f => !f.google && f.label.toLowerCase().includes(q));
                    const googleFonts = FONT_OPTIONS.filter(f => f.google && f.label.toLowerCase().includes(q));
                    return (
                      <>
                        {systemFonts.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">System Fonts</div>
                            {systemFonts.map((f) => (
                              <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {googleFonts.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Google Fonts</div>
                            {googleFonts.map((f) => (
                              <SelectItem key={f.value} value={f.value} className="text-xs">
                                {f.label}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {systemFonts.length === 0 && googleFonts.length === 0 && (
                          <div className="px-2 py-3 text-xs text-muted-foreground text-center">No fonts match "{fontSearch}"</div>
                        )}
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="number"
                value={fontSizePt}
                onChange={(e) => applyFontSize(Number(e.target.value))}
                className="w-16 h-8 text-xs"
                min={4}
                max={200}
                step={0.5}
              />
              <span className="text-[10px] text-muted-foreground">pt</span>
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

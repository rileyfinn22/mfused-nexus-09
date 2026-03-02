import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas as FabricCanvas, IText, Rect, Image as FabricImage, FabricObject, Line } from "fabric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bold, Italic, Type, Lock, Unlock, Trash2, ImageIcon, Upload, FileText, Scan, Loader2, Undo2, Redo2, Palette, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AiImageDialog } from "./AiImageDialog";
import { AiEditDialog } from "./AiEditDialog";
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
      document.fonts.ready.then(() => resolve());
    };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

// Snap guide helpers
const GUIDE_NAME = "_snapGuide";

function clearGuidelines(canvas: FabricCanvas) {
  const guides = canvas.getObjects().filter((o: any) => o.name === GUIDE_NAME);
  guides.forEach((g) => canvas.remove(g));
}

function addGuideline(canvas: FabricCanvas, coords: { x1: number; y1: number; x2: number; y2: number }) {
  const line = new Line([coords.x1, coords.y1, coords.x2, coords.y2], {
    stroke: "#3b82f6",
    strokeWidth: 1,
    strokeDashArray: [4, 4],
    selectable: false,
    evented: false,
    objectCaching: false,
  } as any);
  (line as any).name = GUIDE_NAME;
  canvas.add(line);
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
  const [zoneSelectMode, setZoneSelectMode] = useState(false);
  const [zoneExtractLocked, setZoneExtractLocked] = useState(false);
  const [extractingText, setExtractingText] = useState(false);
  const [fontColor, setFontColor] = useState("#000000");
  const [drawTextMode, setDrawTextMode] = useState<"off" | "editable" | "locked">("off");
  const drawTextStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawTextRectRef = useRef<Rect | null>(null);
  const [unlockZoneMode, setUnlockZoneMode] = useState(false);

  // Undo/redo history
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const isUndoRedo = useRef(false);
  
  const zoneRectRef = useRef<Rect | null>(null);
  const zoneStartRef = useRef<{ x: number; y: number } | null>(null);

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
  const displayBleedPx = Math.max(1, Math.round(bleedPx * displayScale));
  // Use device pixel ratio so retina screens get a sharp backing buffer
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

  const syncCanvas = useCallback(() => {
    if (fabricRef.current && onCanvasChange) {
      const data = fabricRef.current.toObject(['locked', 'editable', 'name']) as any;
      delete data.backgroundImage;
      if (Array.isArray(data.objects)) {
        data.objects = data.objects.filter((obj: any) => obj?.name !== "_trimGuide" && obj?.name !== "_snapGuide");
      }
      onCanvasChange(data);

      // Push to undo stack (skip if triggered by undo/redo itself)
      if (!isUndoRedo.current) {
        undoStack.current.push(JSON.stringify(data));
        // Cap stack size
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
      }
    }
  }, [onCanvasChange]);

  const undo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || undoStack.current.length < 2) return;
    const current = undoStack.current.pop()!;
    redoStack.current.push(current);
    const prev = undoStack.current[undoStack.current.length - 1];
    isUndoRedo.current = true;
    await canvas.loadFromJSON(JSON.parse(prev));
    canvas.renderAll();
    onCanvasChange?.(JSON.parse(prev));
    isUndoRedo.current = false;
  }, [onCanvasChange]);

  const redo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(next);
    isUndoRedo.current = true;
    await canvas.loadFromJSON(JSON.parse(next));
    canvas.renderAll();
    onCanvasChange?.(JSON.parse(next));
    isUndoRedo.current = false;
  }, [onCanvasChange]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

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

    // Bleed/trim visual guide is rendered as HTML overlay above the canvas
    // (more reliable than Fabric after:render across zoom/retina).

    const loadCanvasAndBackground = async () => {
      if (canvasData && canvasData.objects?.length > 0) {
        const safeCanvasData = JSON.parse(JSON.stringify(canvasData));
        if (safeCanvasData?.backgroundImage?.src?.startsWith("blob:")) {
          delete safeCanvasData.backgroundImage;
        }
        await canvas.loadFromJSON(safeCanvasData);
      }

      // Remove any persisted trim guides from older saves (named + legacy unnamed artifacts).
      canvas.getObjects().forEach((o: any) => {
        const isNamedGuide = o?.name === "_trimGuide";
        const isLegacyTrimLine =
          o?.type === "rect" &&
          o?.selectable === false &&
          o?.evented === false &&
          typeof o?.stroke === "string" &&
          o.stroke.toLowerCase() === "#ef4444" &&
          Array.isArray(o?.strokeDashArray);
        const isLegacyBleedMask =
          o?.type === "rect" &&
          o?.selectable === false &&
          o?.evented === false &&
          typeof o?.fill === "string" &&
          (o.fill.includes("rgba(0, 0, 0, 0.35)") || o.fill.includes("rgba(31, 41, 55, 0.35)"));

        if (isNamedGuide || isLegacyTrimLine || isLegacyBleedMask) {
          canvas.remove(o);
        }
      });

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
                left: 0, top: 0, objectCaching: false,
              } as any);
              const fitScale = Math.min(canvasWidth / imgEl.width, canvasHeight / imgEl.height);
              fabricImg.set({
                scaleX: fitScale,
                scaleY: fitScale,
                left: (canvasWidth - imgEl.width * fitScale) / 2,
                top: (canvasHeight - imgEl.height * fitScale) / 2,
              });
              (fabricImg as any).name = "pdf_background";
              canvas.add(fabricImg);
              canvas.sendObjectToBack(fabricImg);
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

      // Seed undo stack with initial state
      const initialData = canvas.toObject(['locked', 'editable', 'name']) as any;
      delete initialData.backgroundImage;
      if (Array.isArray(initialData.objects)) {
        initialData.objects = initialData.objects.filter((obj: any) => obj?.name !== "_trimGuide" && obj?.name !== "_snapGuide");
      }
      undoStack.current = [JSON.stringify(initialData)];
      redoStack.current = [];
    };

    loadCanvasAndBackground();

    canvas.on("selection:created", (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        setSelectedObject(obj);
        if ((obj as any).fontSize) setFontSizePt((obj as any)._fontSizePt ?? pxToPt((obj as any).fontSize));
        if ((obj as any).fontFamily) setFontFamily((obj as any).fontFamily);
        if ((obj as any).fill) setFontColor((obj as any).fill);
      }
    });
    canvas.on("selection:updated", (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        setSelectedObject(obj);
        if ((obj as any).fontSize) setFontSizePt((obj as any)._fontSizePt ?? pxToPt((obj as any).fontSize));
        if ((obj as any).fontFamily) setFontFamily((obj as any).fontFamily);
        if ((obj as any).fill) setFontColor((obj as any).fill);
      }
    });
    canvas.on("selection:cleared", () => setSelectedObject(null));
    canvas.on("object:modified", () => { clearGuidelines(canvas); syncCanvas(); });
    canvas.on("text:changed", syncCanvas);

    // Smart snapping guidelines
    const SNAP_THRESHOLD = 12; // pixels in canvas coords
    canvas.on("object:moving", (e) => {
      const obj = e.target;
      if (!obj) return;
      clearGuidelines(canvas);

      // obj.left/top are the origin point; use getBoundingRect for visual edges
      const br = obj.getBoundingRect();
      const zoom = canvas.getZoom();
      // Convert screen-space bounding rect back to canvas coords
      const objLeft = br.left / zoom;
      const objTop = br.top / zoom;
      const objW = br.width / zoom;
      const objH = br.height / zoom;
      const objCenterX = objLeft + objW / 2;
      const objCenterY = objTop + objH / 2;
      const objRight = objLeft + objW;
      const objBottom = objTop + objH;

      // Offset between obj.left/top and bounding rect origin
      const offX = (obj.left || 0) - objLeft;
      const offY = (obj.top || 0) - objTop;

      const trimL = bleedPx;
      const trimT = bleedPx;
      const trimR = canvasWidth - bleedPx;
      const trimB = canvasHeight - bleedPx;
      const trimCX = canvasWidth / 2;
      const trimCY = canvasHeight / 2;

      const guides: { x1: number; y1: number; x2: number; y2: number }[] = [];
      let snappedX = false, snappedY = false;

      // Helper to snap X
      const trySnapX = (current: number, target: number, guide: { x1: number; y1: number; x2: number; y2: number }) => {
        if (!snappedX && Math.abs(current - target) < SNAP_THRESHOLD) {
          obj.set({ left: target + offX + (current === objCenterX ? -objW / 2 + (current - objLeft) : current === objRight ? -objW + (current - objLeft) : 0) });
          guides.push(guide);
          snappedX = true;
        }
      };
      const trySnapY = (current: number, target: number, guide: { x1: number; y1: number; x2: number; y2: number }) => {
        if (!snappedY && Math.abs(current - target) < SNAP_THRESHOLD) {
          obj.set({ top: target + offY + (current === objCenterY ? -objH / 2 + (current - objTop) : current === objBottom ? -objH + (current - objTop) : 0) });
          guides.push(guide);
          snappedY = true;
        }
      };

      // Snap to canvas/trim center
      if (Math.abs(objCenterX - trimCX) < SNAP_THRESHOLD) {
        obj.set({ left: trimCX - objW / 2 + offX });
        guides.push({ x1: trimCX, y1: 0, x2: trimCX, y2: canvasHeight });
        snappedX = true;
      }
      if (Math.abs(objCenterY - trimCY) < SNAP_THRESHOLD) {
        obj.set({ top: trimCY - objH / 2 + offY });
        guides.push({ x1: 0, y1: trimCY, x2: canvasWidth, y2: trimCY });
        snappedY = true;
      }

      // Snap to trim edges
      if (!snappedX && Math.abs(objLeft - trimL) < SNAP_THRESHOLD) {
        obj.set({ left: trimL + offX });
        guides.push({ x1: trimL, y1: 0, x2: trimL, y2: canvasHeight });
        snappedX = true;
      }
      if (!snappedX && Math.abs(objRight - trimR) < SNAP_THRESHOLD) {
        obj.set({ left: trimR - objW + offX });
        guides.push({ x1: trimR, y1: 0, x2: trimR, y2: canvasHeight });
        snappedX = true;
      }
      if (!snappedY && Math.abs(objTop - trimT) < SNAP_THRESHOLD) {
        obj.set({ top: trimT + offY });
        guides.push({ x1: 0, y1: trimT, x2: canvasWidth, y2: trimT });
        snappedY = true;
      }
      if (!snappedY && Math.abs(objBottom - trimB) < SNAP_THRESHOLD) {
        obj.set({ top: trimB - objH + offY });
        guides.push({ x1: 0, y1: trimB, x2: canvasWidth, y2: trimB });
        snappedY = true;
      }

      // Snap to other objects' centers
      if (!snappedX || !snappedY) {
        canvas.getObjects().forEach((other: any) => {
          if (other === obj || other.name === "_textCover" || other.name === GUIDE_NAME) return;
          const obr = other.getBoundingRect();
          const oCX = obr.left / zoom + obr.width / zoom / 2;
          const oCY = obr.top / zoom + obr.height / zoom / 2;

          if (!snappedX && Math.abs(objCenterX - oCX) < SNAP_THRESHOLD) {
            obj.set({ left: oCX - objW / 2 + offX });
            guides.push({ x1: oCX, y1: 0, x2: oCX, y2: canvasHeight });
            snappedX = true;
          }
          if (!snappedY && Math.abs(objCenterY - oCY) < SNAP_THRESHOLD) {
            obj.set({ top: oCY - objH / 2 + offY });
            guides.push({ x1: 0, y1: oCY, x2: canvasWidth, y2: oCY });
            snappedY = true;
          }
        });
      }

      guides.forEach((g) => addGuideline(canvas, g));
      obj.setCoords();
      canvas.renderAll();
    });

    // Guidelines already cleared in object:modified above

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

    // Add PDF as a selectable, movable, resizable object so user can position it
    const fabricImg = new FabricImage(imgEl, {
      left: 0,
      top: 0,
      objectCaching: false,
    } as any);

    // Scale to fit inside the canvas initially
    const fitScale = Math.min(canvasWidth / imgEl.width, canvasHeight / imgEl.height);
    fabricImg.set({
      scaleX: fitScale,
      scaleY: fitScale,
      left: (canvasWidth - imgEl.width * fitScale) / 2,
      top: (canvasHeight - imgEl.height * fitScale) / 2,
    });
    (fabricImg as any).name = "pdf_background";
    canvas.add(fabricImg);
    canvas.sendObjectToBack(fabricImg);
    canvas.setActiveObject(fabricImg);
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

  const getCanvasImage = useCallback((): string | null => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    try {
      return canvas.toDataURL({ format: "png", multiplier: 2 });
    } catch {
      return null;
    }
  }, []);

  // --- Zone Selection: draw rectangle, crop canvas region, send to AI for OCR ---
  const startZoneSelect = () => {
    setZoneSelectMode(true);
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Disable object selection during zone draw
    canvas.selection = false;
    canvas.getObjects().forEach((o) => o.set({ evented: false } as any));

    toast.info(`Draw a rectangle over text to extract as ${zoneExtractLocked ? "locked" : "editable"}`, { duration: 3000 });

    const onMouseDown = (opt: any) => {
      const pointer = canvas.getScenePoint(opt.e);
      zoneStartRef.current = { x: pointer.x, y: pointer.y };
      const rect = new Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: "rgba(59,130,246,0.15)",
        stroke: "#3b82f6",
        strokeWidth: 2,
        strokeDashArray: [6, 3],
        selectable: false,
        evented: false,
        name: "_zoneSelect",
      });
      zoneRectRef.current = rect;
      canvas.add(rect);
    };

    const onMouseMove = (opt: any) => {
      if (!zoneStartRef.current || !zoneRectRef.current) return;
      const pointer = canvas.getScenePoint(opt.e);
      const left = Math.min(zoneStartRef.current.x, pointer.x);
      const top = Math.min(zoneStartRef.current.y, pointer.y);
      const w = Math.abs(pointer.x - zoneStartRef.current.x);
      const h = Math.abs(pointer.y - zoneStartRef.current.y);
      zoneRectRef.current.set({ left, top, width: w, height: h });
      canvas.renderAll();
    };

    const onMouseUp = async () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);

      const rect = zoneRectRef.current;
      const start = zoneStartRef.current;
      if (!rect || !start || (rect.width || 0) < 10 || (rect.height || 0) < 10) {
        // Too small, cancel
        if (rect) canvas.remove(rect);
        zoneRectRef.current = null;
        zoneStartRef.current = null;
        endZoneSelect();
        return;
      }

      // Crop that region from the canvas as a data URL
      setExtractingText(true);
      try {
        const cropLeft = rect.left || 0;
        const cropTop = rect.top || 0;
        const cropW = rect.width || 100;
        const cropH = rect.height || 100;

        // Create a temp canvas to crop
        const tempCanvas = document.createElement("canvas");
        const scale = 2; // 2x for better OCR
        tempCanvas.width = cropW * scale;
        tempCanvas.height = cropH * scale;
        const ctx = tempCanvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context");

        // Hide the zone rect before exporting
        rect.set({ visible: false });
        canvas.renderAll();

        // Get the full canvas as image at current zoom
        const fullDataUrl = canvas.toDataURL({ format: "png", multiplier: scale });
        
        // Draw cropped region
        const fullImg = new window.Image();
        await new Promise<void>((resolve, reject) => {
          fullImg.onload = () => resolve();
          fullImg.onerror = reject;
          fullImg.src = fullDataUrl;
        });
        
        const zoom = canvas.getZoom();
        ctx.drawImage(
          fullImg,
          cropLeft * zoom * scale, cropTop * zoom * scale,
          cropW * zoom * scale, cropH * zoom * scale,
          0, 0,
          cropW * scale, cropH * scale
        );
        const croppedDataUrl = tempCanvas.toDataURL("image/png");

        // Send to AI for text extraction
        const { data, error } = await supabase.functions.invoke("decompose-design-image", {
          body: { image_url: croppedDataUrl },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const extractedText = data?.text || "";
        const detectedFont = data?.font_family || null;
        const detectedWeight = data?.font_weight || "normal";
        const detectedStyle = data?.font_style || "normal";
        const detectedColor = data?.color || "#000000";
        const detectedFontSizePt = data?.font_size_pt || null;

        if (!extractedText.trim()) {
          toast.warning("No text detected in the selected area");
          canvas.remove(rect);
        } else {
          // Remove the selection rect, add a white cover rect to hide the underlying text, then add editable IText
          canvas.remove(rect);

          // White cover to mask the baked-in text (2px padding to cover anti-aliased edges)
          const coverPad = 2;
          const cover = new Rect({
            left: cropLeft - coverPad,
            top: cropTop - coverPad,
            width: cropW + coverPad * 2,
            height: cropH + coverPad * 2,
            fill: "#ffffff",
            opacity: 1,
            selectable: false,
            evented: false,
            objectCaching: false,
            name: "_textCover",
          });
          canvas.add(cover);

          const isLocked = zoneExtractLocked;

          // Try to load detected Google font if available
          let useFontFamily = "Arial";
          if (detectedFont) {
            const fontDef = FONT_OPTIONS.find(
              (f) => f.value.toLowerCase() === detectedFont.toLowerCase()
            );
            if (fontDef) {
              useFontFamily = fontDef.value;
              if (fontDef.google) {
                await loadGoogleFont(fontDef.value);
              }
            } else {
              // Try as-is (might be web-safe)
              useFontFamily = detectedFont;
            }
          }

          // Auto-fit font size to match the crop region height exactly
          // Start with a trial size, measure, then scale to fit cropH
          const trialSize = 40;
          const text = new IText(extractedText, {
            left: cropLeft,
            top: cropTop,
            fontSize: trialSize,
            fontFamily: useFontFamily,
            fontWeight: detectedWeight,
            fontStyle: detectedStyle,
            fill: detectedColor,
            editable: true,
            padding: 0,
          });
          // Temporarily add to canvas to measure bounding box
          canvas.add(text);
          canvas.renderAll();
          const measuredH = text.getBoundingRect().height;
          const fittedSize = measuredH > 0
            ? Math.round(trialSize * (cropH / measuredH))
            : Math.max(Math.round(cropH * 0.6), 20);
          text.set({ fontSize: fittedSize, padding: 4 });
          canvas.remove(text);
          // Re-add below after configuring lock state
          (text as any).locked = isLocked;
          (text as any).editable = !isLocked;
          (text as any).name = isLocked ? "locked_text" : "editable_text";
          text.set({
            borderColor: isLocked ? "#94a3b8" : "#3b82f6",
            cornerColor: isLocked ? "#94a3b8" : "#3b82f6",
            cornerStyle: isLocked ? undefined : "circle",
            transparentCorners: isLocked ? undefined : false,
          } as any);

          canvas.add(text);
          const trim = canvas.getObjects().find((o: any) => o.name === "_trimGuide");
          if (trim) canvas.bringObjectToFront(trim);
          canvas.setActiveObject(text);
          canvas.renderAll();
          syncCanvas();
          toast.success(`Extracted as ${isLocked ? "locked" : "editable"} (${useFontFamily}): "${extractedText.substring(0, 50)}${extractedText.length > 50 ? "..." : ""}"`);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to extract text");
        if (rect) canvas.remove(rect);
      } finally {
        zoneRectRef.current = null;
        zoneStartRef.current = null;
        setExtractingText(false);
        endZoneSelect();
      }
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);
  };

  const endZoneSelect = () => {
    setZoneSelectMode(false);
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = mode === "edit";
    canvas.getObjects().forEach((o: any) => {
      if (o.name === "_trimGuide" || o.name === "_zoneSelect") return;
      o.set({ evented: true });
    });
    canvas.renderAll();
  };

  // --- Draw Text Box: click-and-drag to place a text zone ---
  const startDrawText = (type: "editable" | "locked") => {
    setDrawTextMode(type);
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = false;
    canvas.getObjects().forEach((o: any) => {
      if (o.name === "_trimGuide" || o.name === GUIDE_NAME) return;
      o.set({ evented: false });
    });
    canvas.defaultCursor = "crosshair";
    canvas.renderAll();

    const onMouseDown = (e: any) => {
      const pointer = canvas.getViewportPoint(e.e);
      const zoom = canvas.getZoom();
      const x = pointer.x / zoom;
      const y = pointer.y / zoom;
      drawTextStartRef.current = { x, y };
      const rect = new Rect({
        left: x, top: y, width: 1, height: 1,
        fill: type === "editable" ? "rgba(59,130,246,0.08)" : "rgba(148,163,184,0.08)",
        stroke: type === "editable" ? "#3b82f6" : "#94a3b8",
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false, evented: false,
        name: "_drawTextRect",
      } as any);
      drawTextRectRef.current = rect;
      canvas.add(rect);
      canvas.renderAll();
    };

    const onMouseMove = (e: any) => {
      if (!drawTextStartRef.current || !drawTextRectRef.current) return;
      const pointer = canvas.getViewportPoint(e.e);
      const zoom = canvas.getZoom();
      const x = pointer.x / zoom;
      const y = pointer.y / zoom;
      const start = drawTextStartRef.current;
      drawTextRectRef.current.set({
        left: Math.min(start.x, x),
        top: Math.min(start.y, y),
        width: Math.abs(x - start.x),
        height: Math.abs(y - start.y),
      });
      canvas.renderAll();
    };

    const onMouseUp = () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);

      const rect = drawTextRectRef.current;
      if (rect) {
        const w = rect.width || 0;
        const h = rect.height || 0;
        canvas.remove(rect);

        if (w > 10 && h > 10) {
          const isEditable = type === "editable";
          const defaultPt = fontSizePt || 12;
          // Auto-fit font size: aim for text height ≈ box height
          const fontSize = Math.max(ptToPx(6), Math.round(h * 0.7));

          const textObj = new IText(isEditable ? "Type here" : "Locked text", {
            left: rect.left || 0,
            top: rect.top || 0,
            fontSize,
            fontFamily: fontFamily || "Arial",
            fill: fontColor || "#000000",
            editable: true,
            padding: 4,
            width: w,
          } as any);
          (textObj as any).locked = !isEditable;
          (textObj as any).editable = isEditable;
          (textObj as any).name = isEditable ? "editable_text" : "locked_text";
          textObj.set({
            borderColor: isEditable ? "#3b82f6" : "#94a3b8",
            cornerColor: isEditable ? "#3b82f6" : "#94a3b8",
            cornerStyle: isEditable ? "circle" : undefined,
            transparentCorners: isEditable ? false : undefined,
          } as any);

          canvas.add(textObj);
          canvas.setActiveObject(textObj);
          // Enter editing mode immediately
          textObj.enterEditing();
          textObj.selectAll();
          canvas.renderAll();
          syncCanvas();
        }
      }

      drawTextRectRef.current = null;
      drawTextStartRef.current = null;
      endDrawText();
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);
  };

  const endDrawText = () => {
    setDrawTextMode("off");
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = mode === "edit";
    canvas.defaultCursor = "default";
    canvas.getObjects().forEach((o: any) => {
      if (o.name === "_trimGuide" || o.name === GUIDE_NAME || o.name === "_drawTextRect") return;
      o.set({ evented: true });
    });
    canvas.renderAll();
  };

  // --- Unlock Zone: draw box in use mode to unlock text for editing ---
  const startUnlockZone = () => {
    setUnlockZoneMode(true);
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = false;
    canvas.defaultCursor = "crosshair";
    canvas.getObjects().forEach((o: any) => o.set({ evented: false }));
    canvas.renderAll();

    let startPt: { x: number; y: number } | null = null;
    let rect: Rect | null = null;

    const onMouseDown = (e: any) => {
      const pointer = canvas.getViewportPoint(e.e);
      const zoom = canvas.getZoom();
      startPt = { x: pointer.x / zoom, y: pointer.y / zoom };
      rect = new Rect({
        left: startPt.x, top: startPt.y, width: 1, height: 1,
        fill: "rgba(59,130,246,0.08)", stroke: "#3b82f6",
        strokeWidth: 2, strokeDashArray: [6, 4],
        selectable: false, evented: false, name: "_unlockZone",
      } as any);
      canvas.add(rect);
      canvas.renderAll();
    };

    const onMouseMove = (e: any) => {
      if (!startPt || !rect) return;
      const pointer = canvas.getViewportPoint(e.e);
      const zoom = canvas.getZoom();
      const x = pointer.x / zoom;
      const y = pointer.y / zoom;
      rect.set({
        left: Math.min(startPt.x, x), top: Math.min(startPt.y, y),
        width: Math.abs(x - startPt.x), height: Math.abs(y - startPt.y),
      });
      canvas.renderAll();
    };

    const onMouseUp = () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);

      if (rect) {
        const zoneLeft = rect.left || 0;
        const zoneTop = rect.top || 0;
        const zoneRight = zoneLeft + (rect.width || 0);
        const zoneBottom = zoneTop + (rect.height || 0);
        canvas.remove(rect);

        // Find all locked text objects whose center falls within the drawn zone
        let unlocked = 0;
        canvas.getObjects().forEach((obj: any) => {
          if (!obj.type?.includes("text") && obj.type !== "i-text" && obj.type !== "textbox") return;
          if (!obj.locked) return;
          const br = obj.getBoundingRect();
          const zoom = canvas.getZoom();
          const cx = br.left / zoom + br.width / zoom / 2;
          const cy = br.top / zoom + br.height / zoom / 2;

          if (cx >= zoneLeft && cx <= zoneRight && cy >= zoneTop && cy <= zoneBottom) {
            obj.locked = false;
            obj.editable = true;
            obj.name = "editable_text";
            obj.set({
              selectable: true, evented: true, hasControls: true,
              borderColor: "#3b82f6", cornerColor: "#3b82f6",
              cornerStyle: "circle", transparentCorners: false,
            });
            unlocked++;
          }
        });

        if (unlocked > 0) {
          toast.success(`Unlocked ${unlocked} text ${unlocked === 1 ? "element" : "elements"} for editing`);
          canvas.renderAll();
          syncCanvas();
        } else {
          toast.info("No locked text found in that area");
        }
      }

      endUnlockZone();
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);
  };

  const endUnlockZone = () => {
    setUnlockZoneMode(false);
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = false;
    canvas.defaultCursor = "default";
    // Re-enable evented on editable objects only
    canvas.getObjects().forEach((obj: any) => {
      if (obj.name === "_trimGuide" || obj.name === GUIDE_NAME) return;
      if (obj.locked || !obj.editable) {
        obj.set({ selectable: false, evented: false });
      } else {
        obj.set({ selectable: true, evented: true });
      }
    });
    canvas.renderAll();
  };

  // Auto-extract removed - user positions PDF manually

  const applyFontSize = (sizePt: number) => {
    if (!selectedObject || !fabricRef.current) return;
    setFontSizePt(sizePt);
    (selectedObject as any).set("fontSize", ptToPx(sizePt));
    (selectedObject as any)._fontSizePt = sizePt; // store exact pt to avoid round-trip error
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

  const applyFontColor = (color: string) => {
    if (!selectedObject || !fabricRef.current) return;
    setFontColor(color);
    (selectedObject as any).set("fill", color);
    fabricRef.current.renderAll();
    syncCanvas();
  };

  // Alignment helpers — align selected object relative to trim area
  const alignObject = (alignment: "left" | "centerH" | "right" | "top" | "centerV" | "bottom") => {
    const canvas = fabricRef.current;
    const obj = selectedObject;
    if (!canvas || !obj) return;

    const bounds = obj.getBoundingRect();
    const zoom = canvas.getZoom();
    const objW = bounds.width / zoom;
    const objH = bounds.height / zoom;
    const objLeftOffset = (obj.left || 0) - bounds.left / zoom;
    const objTopOffset = (obj.top || 0) - bounds.top / zoom;

    const trimLeft = bleedPx;
    const trimTop = bleedPx;
    const trimRight = canvasWidth - bleedPx;
    const trimBottom = canvasHeight - bleedPx;
    const trimW = trimRight - trimLeft;
    const trimH = trimBottom - trimTop;

    switch (alignment) {
      case "left":
        obj.set({ left: trimLeft + objLeftOffset });
        break;
      case "centerH":
        obj.set({ left: trimLeft + trimW / 2 - objW / 2 + objLeftOffset });
        break;
      case "right":
        obj.set({ left: trimRight - objW + objLeftOffset });
        break;
      case "top":
        obj.set({ top: trimTop + objTopOffset });
        break;
      case "centerV":
        obj.set({ top: trimTop + trimH / 2 - objH / 2 + objTopOffset });
        break;
      case "bottom":
        obj.set({ top: trimBottom - objH + objTopOffset });
        break;
    }
    obj.setCoords();
    canvas.renderAll();
    syncCanvas();
  };

  const isTextObject = selectedObject && ((selectedObject as any).type === "i-text" || (selectedObject as any).type === "textbox" || (selectedObject as any).type === "text");

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border flex-wrap">
        {/* Undo / Redo */}
        <Button size="sm" variant="ghost" onClick={undo} className="h-8 w-8 p-0" title="Undo (Ctrl+Z)">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={redo} className="h-8 w-8 p-0" title="Redo (Ctrl+Y)">
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        {mode === "edit" && (
          <>
            {/* Draw text box mode */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={drawTextMode === "editable" ? "default" : "outline"}
                    onClick={() => drawTextMode === "editable" ? endDrawText() : startDrawText("editable")}
                    className="gap-1.5"
                  >
                    <Type className="h-3.5 w-3.5" />
                    <span className="text-xs">Draw Text</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Click &amp; drag on the canvas to place an editable text box</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={drawTextMode === "locked" ? "default" : "outline"}
                    onClick={() => drawTextMode === "locked" ? endDrawText() : startDrawText("locked")}
                    className="gap-1.5"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span className="text-xs">Draw Locked</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Click &amp; drag to place a locked (non-editable by end users) text box</TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
            <AiEditDialog getCanvasImage={getCanvasImage} onImageGenerated={(dataUrl) => addImageFromDataUrl(dataUrl, true)} />
            <IconPickerDialog onIconSelected={(dataUrl) => addImageFromDataUrl(dataUrl, true)} />
            <div className="w-px h-6 bg-border mx-1" />
            {/* Extract Text zone controls */}
            <Button
              size="sm"
              variant={zoneExtractLocked ? "outline" : "default"}
              onClick={() => setZoneExtractLocked(false)}
              disabled={extractingText}
              className="gap-1 px-2"
            >
              <Unlock className="h-3 w-3" />
              <span className="text-[10px]">Editable</span>
            </Button>
            <Button
              size="sm"
              variant={zoneExtractLocked ? "default" : "outline"}
              onClick={() => setZoneExtractLocked(true)}
              disabled={extractingText}
              className="gap-1 px-2"
            >
              <Lock className="h-3 w-3" />
              <span className="text-[10px]">Locked</span>
            </Button>
            <Button
              size="sm"
              variant={zoneSelectMode ? "destructive" : "secondary"}
              onClick={zoneSelectMode ? endZoneSelect : startZoneSelect}
              disabled={extractingText}
              className="gap-1.5"
            >
              {extractingText ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Scan className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">
                {extractingText ? "Extracting..." : zoneSelectMode ? "Cancel" : "Extract Text"}
              </span>
            </Button>
            
            <div className="w-px h-6 bg-border mx-1" />
          </>
        )}

        {/* Select to Edit - available in both modes */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={unlockZoneMode ? "default" : "outline"}
                onClick={unlockZoneMode ? endUnlockZone : startUnlockZone}
                className="gap-1.5"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span className="text-xs">{unlockZoneMode ? "Cancel" : "Select to Edit"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Draw a box around locked text to make it editable</TooltipContent>
          </Tooltip>
        </TooltipProvider>

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
            <div className="flex items-center gap-1">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="color"
                value={fontColor}
                onChange={(e) => applyFontColor(e.target.value)}
                className="w-7 h-7 rounded border border-border cursor-pointer p-0"
                title="Font color"
              />
            </div>
          </>
        )}

        {/* Alignment buttons — shown when any object is selected */}
        {selectedObject && (
          <>
            <div className="w-px h-6 bg-border mx-1" />
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-0.5">
                <Tooltip><TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={() => alignObject("left")} className="h-8 w-8 p-0">
                    <AlignLeft className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger><TooltipContent side="bottom" className="text-xs">Align Left</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={() => alignObject("centerH")} className="h-8 w-8 p-0">
                    <AlignCenter className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger><TooltipContent side="bottom" className="text-xs">Center Horizontally</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={() => alignObject("right")} className="h-8 w-8 p-0">
                    <AlignRight className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger><TooltipContent side="bottom" className="text-xs">Align Right</TooltipContent></Tooltip>
                <div className="w-px h-4 bg-border mx-0.5" />
                <Tooltip><TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={() => alignObject("top")} className="h-8 w-8 p-0">
                    <AlignStartVertical className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger><TooltipContent side="bottom" className="text-xs">Align Top</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={() => alignObject("centerV")} className="h-8 w-8 p-0">
                    <AlignCenterVertical className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger><TooltipContent side="bottom" className="text-xs">Center Vertically</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={() => alignObject("bottom")} className="h-8 w-8 p-0">
                    <AlignEndVertical className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger><TooltipContent side="bottom" className="text-xs">Align Bottom</TooltipContent></Tooltip>
              </div>
            </TooltipProvider>
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

      {/* Draw text mode hint */}
      {drawTextMode !== "off" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30 text-sm text-primary">
          <Type className="h-4 w-4" />
          <span>Click and drag on the canvas to draw a {drawTextMode === "editable" ? "editable" : "locked"} text box</span>
          <Button size="sm" variant="ghost" onClick={endDrawText} className="ml-auto h-6 px-2 text-xs">Cancel</Button>
        </div>
      )}
      {unlockZoneMode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30 text-sm text-primary">
          <Unlock className="h-4 w-4" />
          <span>Draw a box around locked text to make it editable</span>
          <Button size="sm" variant="ghost" onClick={endUnlockZone} className="ml-auto h-6 px-2 text-xs">Cancel</Button>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-auto bg-muted/30 p-4 flex justify-center">
        <div className="relative shadow-lg" style={{ width: cssWidth, height: cssHeight }}>
          <canvas ref={canvasRef} />

          {/* Always-on-top bleed/trim guide (visual only) */}
          <div className="pointer-events-none absolute inset-0 z-20">
            <div
              className="absolute left-0 top-0 right-0"
              style={{ height: displayBleedPx, background: "rgba(31, 41, 55, 0.35)" }}
            />
            <div
              className="absolute left-0 bottom-0 right-0"
              style={{ height: displayBleedPx, background: "rgba(31, 41, 55, 0.35)" }}
            />
            <div
              className="absolute left-0"
              style={{ top: displayBleedPx, bottom: displayBleedPx, width: displayBleedPx, background: "rgba(31, 41, 55, 0.35)" }}
            />
            <div
              className="absolute right-0"
              style={{ top: displayBleedPx, bottom: displayBleedPx, width: displayBleedPx, background: "rgba(31, 41, 55, 0.35)" }}
            />
            <div
              className="absolute border border-dashed border-destructive"
              style={{
                left: displayBleedPx,
                top: displayBleedPx,
                right: displayBleedPx,
                bottom: displayBleedPx,
              }}
            />
          </div>
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

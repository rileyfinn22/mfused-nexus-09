import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Canvas as FabricCanvas, IText, Rect, Image as FabricImage, FabricObject, Line, Polyline, Group, loadSVGFromString, Circle as FabricCircle, Ellipse as FabricEllipse, Triangle as FabricTriangle, Polygon as FabricPolygon } from "fabric";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bold, Italic, Type, Lock, Unlock, Trash2, ImageIcon, Upload, FileText, Scan, Loader2, Undo2, Redo2, Palette, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, Scissors, Square, Layers, Sparkles, Circle, Triangle, Star, Hexagon, Minus, Shapes } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AiImageDialog } from "./AiImageDialog";
import { AiEditDialog } from "./AiEditDialog";
import { AiCleanupDialog } from "./AiCleanupDialog";
import { IconPickerDialog } from "./IconPickerDialog";
import { CanvasObjectsPanel } from "./CanvasObjectsPanel";
import { generatePdfThumbnailFromFile } from "@/lib/pdfThumbnail";
import { computePdfBoxPlacement, extractPdfPageBoxes, type ParsedPdfPageBoxes } from "@/lib/pdfPageBoxes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateDieline } from "@/lib/dielineGenerator";

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

// Web-safe fonts that exist on all platforms and don't need Google loading
const WEB_SAFE_FONTS = new Set([
  "Arial", "Verdana", "Georgia", "Times New Roman", "Courier New", "Impact",
  "Trebuchet MS", "Comic Sans MS", "Tahoma", "Lucida Console",
]);

// Fonts that only exist on specific OS — map to cross-platform Google Font equivalents
const PLATFORM_FONT_SUBSTITUTES: Record<string, string> = {
  "Helvetica": "Inter",           // Helvetica only on Mac; Inter is a close cross-platform match
  "Helvetica Neue": "Inter",
  "San Francisco": "Inter",
  "Segoe UI": "Inter",
  "Lucida Grande": "Nunito Sans",
};

function loadGoogleFont(fontFamily: string): Promise<void> {
  if (loadedFonts.has(fontFamily)) return Promise.resolve();
  return new Promise((resolve) => {
    const encoded = fontFamily.replace(/ /g, "+");
    const link = document.createElement("link");
    link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
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
const OCR_KNOCKOUT_NAME = "_ocrKnockout";

// Perforation (tear-off) line — industry convention is a green dashed line.
// Stored as a regular, persisted canvas object (NOT a "_"-prefixed helper) so it
// survives save/load and is included in print-ready exports.
const PERF_LINE_NAME = "perf_line";
const PERF_COLOR = "#16a34a";

// Geometry helpers for the Shapes library. Points are laid out in a [0..2r] box
// (center at r,r) so the polygon's bounding box starts near the origin and the
// object can be positioned with plain left/top.
function regularPolygonPoints(sides: number, r: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push({ x: r + r * Math.cos(a), y: r + r * Math.sin(a) });
  }
  return pts;
}
function starPolygonPoints(spikes: number, outerR: number, innerR: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI / 2 + (i * Math.PI) / spikes;
    pts.push({ x: outerR + r * Math.cos(a), y: outerR + r * Math.sin(a) });
  }
  return pts;
}

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
  depth?: number;
  productType?: string;
  onCanvasChange?: (data: any) => void;
  onSourcePdfChange?: (path: string) => void;
  sourcePdfPath?: string;
  mode: "edit" | "use";
  fabricCanvasRef?: React.MutableRefObject<FabricCanvas | null>;
}

export function TemplateEditor({ canvasData, width, height, bleed, depth = 0, productType = "label", onCanvasChange, onSourcePdfChange, sourcePdfPath, mode, fabricCanvasRef }: TemplateEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const previewPdfUrlRef = useRef<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null);
  const [selectedLockedState, setSelectedLockedState] = useState(false);
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
  const [extractingAll, setExtractingAll] = useState(false);
  const [extractingVector, setExtractingVector] = useState(false);
  const [drawMaskMode, setDrawMaskMode] = useState(false);
  const drawMaskStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawMaskRectRef = useRef<Rect | null>(null);
  const [drawPerfMode, setDrawPerfMode] = useState(false);
  // Which left-rail tool category popover is open (Quad-style grouped toolbar)
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [perfTick, setPerfTick] = useState(0);
  const activePerfRef = useRef<any>(null);

  // Undo/redo history
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const isUndoRedo = useRef(false);
  
  const zoneRectRef = useRef<Rect | null>(null);
  const zoneStartRef = useRef<{ x: number; y: number } | null>(null);

  const getSelectionLockedState = useCallback((obj: any): boolean => {
    if (!obj) return false;
    const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
    if (type === "activeselection") {
      const objects: any[] = obj.getObjects?.() || [];
      if (objects.length === 0) return false;
      return objects.every((o: any) => !!o.locked);
    }
    return !!obj.locked;
  }, []);

  // Convert between typographic points and canvas pixels at current DPI
  // 1 pt = 1/72 inch, so at N DPI: 1pt = DPI/72 pixels
  const ptToPx = (pt: number) => pt * (DPI / 72);
  const pxToPt = (px: number) => Math.round((px * 72) / DPI * 10) / 10;
  const getObjectBoundsInCanvas = (obj: FabricObject) => {
    const br = obj.getBoundingRect();
    const canvas = fabricRef.current;
    // Fabric v6: getBoundingRect() returns viewport/screen coords; divide by zoom to get scene coords
    const zoom = canvas ? canvas.getZoom() : 1;
    return { left: br.left / zoom, top: br.top / zoom, width: br.width / zoom, height: br.height / zoom };
  };
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const setPreviewPdfUrl = (url: string) => {
    if (previewPdfUrlRef.current && previewPdfUrlRef.current !== url) {
      URL.revokeObjectURL(previewPdfUrlRef.current);
    }
    previewPdfUrlRef.current = url;
  };

  /**
   * Build knockout bounds from OCR percentage data relative to a reference area.
   * refLeft/refTop/refW/refH define the reference rectangle (crop area or full canvas).
   */
  const ocrPercentsToBounds = (
    xPct: number | null, yPct: number | null, wPct: number | null, hPct: number | null,
    refLeft: number, refTop: number, refW: number, refH: number
  ) => {
    const x = xPct != null && xPct >= 0 ? (xPct / 100) * refW : 0;
    const y = yPct != null && yPct >= 0 ? (yPct / 100) * refH : 0;
    const w = wPct != null && wPct > 0 ? (wPct / 100) * refW : refW;
    const h = hPct != null && hPct > 0 ? (hPct / 100) * refH : refH;
    return { left: refLeft + x, top: refTop + y, width: w, height: h };
  };

  /** Remove any existing knockout rects that overlap with a given area to prevent stacking */
  const clearOverlappingKnockouts = (canvas: FabricCanvas, area: { left: number; top: number; width: number; height: number }) => {
    const toRemove = canvas.getObjects().filter((o: any) => {
      if (o.name !== OCR_KNOCKOUT_NAME) return false;
      const oL = o.left ?? 0, oT = o.top ?? 0, oW = (o.width ?? 0) * (o.scaleX ?? 1), oH = (o.height ?? 0) * (o.scaleY ?? 1);
      const overlapX = oL < area.left + area.width && oL + oW > area.left;
      const overlapY = oT < area.top + area.height && oT + oH > area.top;
      return overlapX && overlapY;
    });
    toRemove.forEach((o) => canvas.remove(o));
  };

  const addOcrKnockoutCover = (
    canvas: FabricCanvas,
    bounds: { left: number; top: number; width: number; height: number }
  ) => {
    if (bounds.width <= 0 || bounds.height <= 0) return;

    // Clear any existing knockouts in this area first
    clearOverlappingKnockouts(canvas, bounds);

    const padX = Math.max(2, Math.round(bounds.width * 0.04));
    const padY = Math.max(2, Math.round(bounds.height * 0.10));

    const left = clamp(bounds.left - padX, 0, canvasWidth);
    const top = clamp(bounds.top - padY, 0, canvasHeight);
    const right = clamp(bounds.left + bounds.width + padX, 0, canvasWidth);
    const bottom = clamp(bounds.top + bounds.height + padY, 0, canvasHeight);
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);

    const cover = new Rect({
      left,
      top,
      width,
      height,
      fill: "#ffffff",
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      objectCaching: false,
      strokeWidth: 0,
      name: OCR_KNOCKOUT_NAME,
    } as any);

    (cover as any).locked = true;
    (cover as any).editable = false;

    canvas.add(cover);
    // z-order: bg at back, knockout above bg, text above knockout
    canvas.sendObjectToBack(cover);
    const bg = canvas.getObjects().find((o: any) => o.name === "pdf_background");
    if (bg) canvas.sendObjectToBack(bg);
  };
  const [fontFamily, setFontFamily] = useState("Arial");

  // Internal resolution for print quality
  const DPI = 150;

  // For boxes/bags, compute flat layout dimensions from dieline generator
  const dielineResult = useMemo(() => {
    if (productType === "box" || productType === "bag") {
      return generateDieline(productType, width, height, depth);
    }
    return null;
  }, [productType, width, height, depth]);

  const effectiveWidth = dielineResult ? dielineResult.totalWidth : width;
  const effectiveHeight = dielineResult ? dielineResult.totalHeight : height;

  console.log("[TemplateEditor] productType:", productType, "w:", width, "h:", height, "d:", depth, "effectiveW:", effectiveWidth, "effectiveH:", effectiveHeight, "dielineResult:", dielineResult ? `${dielineResult.objects.length} objects` : "null");

  const canvasWidth = Math.round((effectiveWidth + bleed * 2) * DPI);
  const canvasHeight = Math.round((effectiveHeight + bleed * 2) * DPI);
  const bleedPx = Math.round(bleed * DPI);

  // Responsive display: measure container width to fit canvas
  // Use a stable outer wrapper for ResizeObserver to prevent feedback loops.
  // The measureRef div's width is determined by parent layout, not canvas content.
  const measureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    // Set initial value synchronously
    const initialWidth = Math.max(200, Math.floor(el.getBoundingClientRect().width - 32));
    setContainerWidth(initialWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(200, Math.floor(entry.contentRect.width - 32));
        setContainerWidth((prev) => (prev === w ? prev : w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const TARGET_DISPLAY_HEIGHT = 750;
  // Oversample imported PDF backgrounds so rasterized text stays sharp in preview
  const PDF_BACKGROUND_OVERSAMPLE = 4;
  const displayScale = Math.min(containerWidth / canvasWidth, TARGET_DISPLAY_HEIGHT / canvasHeight, 1.5);
  const cssWidth = Math.round(canvasWidth * displayScale);
  const cssHeight = Math.round(canvasHeight * displayScale);
  const displayBleedPx = Math.max(1, Math.round(bleedPx * displayScale));
  // Let Fabric handle retina backing-store scaling internally for consistent cross-device rendering.

  const serializeCanvasState = useCallback((includePdfBackground: boolean) => {
    if (!fabricRef.current) return null;

    const data = fabricRef.current.toObject(['locked', 'editable', 'name', '_displayName']) as any;
    delete data.backgroundImage;

    if (Array.isArray(data.objects)) {
      data.objects = data.objects.filter((obj: any) => {
        if (obj?.name === "_trimGuide" || obj?.name === "_snapGuide" || obj?.name === "_editHighlight" || obj?.name === "_dieline" || obj?.name === "_dielineLabel") return false;
        if (!includePdfBackground && obj?.name === "pdf_background") {
          const src = typeof obj?.src === "string" ? obj.src : "";
          if (sourcePdfPath || src.startsWith("blob:")) return false;
        }
        return true;
      });
    }

    return data;
  }, [sourcePdfPath]);

  const syncCanvas = useCallback(() => {
    if (!onCanvasChange) return;

    const persistedData = serializeCanvasState(false);
    if (!persistedData) return;

    onCanvasChange(persistedData);

    // Push to undo stack (skip if triggered by undo/redo itself)
    if (!isUndoRedo.current) {
      const historyData = serializeCanvasState(true);
      if (!historyData) return;

      undoStack.current.push(JSON.stringify(historyData));
      // Cap stack size
      if (undoStack.current.length > 200) undoStack.current.shift();
      redoStack.current = [];
    }
  }, [onCanvasChange, serializeCanvasState]);

  // After any canvas load, fix z-ordering and lock pdf_background
  const fixZOrder = useCallback((canvas: any) => {
    const bg = canvas.getObjects().find((o: any) => o.name === "pdf_background");
    if (bg) {
      bg.set({ selectable: false, evented: false, hasControls: false, hasBorders: false });
      canvas.sendObjectToBack(bg);
    }
    // Perforation lines sit above artwork but below the auto dieline guides
    const perfObjs = canvas.getObjects().filter((o: any) => o.name === PERF_LINE_NAME);
    perfObjs.forEach((o: any) => canvas.bringObjectToFront(o));
    // Bring dieline guides and labels to front (above all artwork)
    const dielineObjs = canvas.getObjects().filter((o: any) => o.name === "_dieline" || o.name === "_dielineLabel");
    dielineObjs.forEach((o: any) => canvas.bringObjectToFront(o));
    // Trim guide on very top
    const trim = canvas.getObjects().find((o: any) => o.name === "_trimGuide");
    if (trim) canvas.bringObjectToFront(trim);
  }, []);

  const undo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || undoStack.current.length < 2) return;
    const current = undoStack.current.pop()!;
    redoStack.current.push(current);
    const prev = undoStack.current[undoStack.current.length - 1];
    isUndoRedo.current = true;
    await canvas.loadFromJSON(JSON.parse(prev));
    fixZOrder(canvas);
    canvas.renderAll();
    onCanvasChange?.(JSON.parse(prev));
    isUndoRedo.current = false;
  }, [onCanvasChange, fixZOrder]);

  const redo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(next);
    isUndoRedo.current = true;
    await canvas.loadFromJSON(JSON.parse(next));
    fixZOrder(canvas);
    canvas.renderAll();
    onCanvasChange?.(JSON.parse(next));
    isUndoRedo.current = false;
  }, [onCanvasChange, fixZOrder]);

  // Keyboard shortcuts for undo/redo and delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // If a Fabric IText is currently being edited, let all key events pass through
      const canvas = fabricRef.current;
      if (canvas) {
        const active = canvas.getActiveObject() as any;
        if (active && active.isEditing) return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      // Delete/Backspace to remove selected object (only when not editing text)
      if ((e.key === "Delete" || e.key === "Backspace") && mode === "edit") {
        if (!canvas) return;
        const active = canvas.getActiveObject() as any;
        if (!active) return;
        if (active.name === "pdf_background") return;
        e.preventDefault();
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.renderAll();
        syncCanvas();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, mode, syncCanvas]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      enableRetinaScaling: true,
      width: canvasWidth,
      height: canvasHeight,
    });
    // Set CSS display size separately from backstore to avoid cursor misalignment.
    // Fabric automatically maps mouse coords between CSS and backing-store dimensions.
    canvas.setDimensions({ width: cssWidth, height: cssHeight }, { cssOnly: true });
    // Do NOT setZoom here — CSS scaling handles visual sizing.
    // setZoom would double-scale: content shrinks within backing store, then CSS shrinks again.
    canvas.backgroundColor = "#ffffff";
    canvas.selection = mode === "edit";

    fabricRef.current = canvas;
    if (fabricCanvasRef) fabricCanvasRef.current = canvas;

    // Bleed/trim visual guide is rendered as HTML overlay above the canvas
    // (more reliable than Fabric after:render across zoom/retina).

    const loadCanvasAndBackground = async () => {
      if (canvasData && canvasData.objects?.length > 0) {
        const safeCanvasData = JSON.parse(JSON.stringify(canvasData));
        if (Array.isArray(safeCanvasData.objects)) {
          safeCanvasData.objects = safeCanvasData.objects.filter((obj: any) => {
            // Remove blob URLs — they are ephemeral and won't load across sessions
            const src = typeof obj?.src === "string" ? obj.src : "";
            if (src.startsWith("blob:")) return false;
            if (obj?.name !== "pdf_background") return true;
            return !sourcePdfPath && !src.startsWith("blob:");
          });
        }
        if (safeCanvasData?.backgroundImage?.src?.startsWith("blob:")) {
          delete safeCanvasData.backgroundImage;
        }

        // Pre-load all Google Fonts used in the canvas BEFORE restoring objects
        // so text measurements are correct on every device (not just the designer's cached browser).
        if (Array.isArray(safeCanvasData.objects)) {
          const fontFamilies = new Set<string>();
          safeCanvasData.objects.forEach((obj: any) => {
            if (obj?.fontFamily && typeof obj.fontFamily === "string") {
              fontFamilies.add(obj.fontFamily);
            }
          });

          // Substitute platform-specific fonts (e.g. Helvetica on Mac → Inter everywhere)
          fontFamilies.forEach((font) => {
            const substitute = PLATFORM_FONT_SUBSTITUTES[font];
            if (substitute) {
              safeCanvasData.objects.forEach((obj: any) => {
                if (obj?.fontFamily === font) {
                  obj.fontFamily = substitute;
                }
              });
              fontFamilies.delete(font);
              fontFamilies.add(substitute);
            }
          });

          // Load any font that isn't a basic web-safe font as a Google Font
          const fontsToLoad = Array.from(fontFamilies).filter(f => !WEB_SAFE_FONTS.has(f));
          if (fontsToLoad.length > 0) {
            await Promise.all(fontsToLoad.map(f => loadGoogleFont(f)));
          }
        }

        await canvas.loadFromJSON(safeCanvasData);

        // Wait for all fonts to be fully rasterized by the browser
        await document.fonts.ready;

        // Force re-measure all text objects now that fonts are loaded
        canvas.getObjects().forEach((obj: any) => {
          if (obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text') {
            // Normalize origin to left/top for consistent positioning across save/load
            if (obj.originX !== 'left' || obj.originY !== 'top') {
              obj.set({ originX: 'left', originY: 'top' });
            }
            // Preserve position across re-measurement to prevent nudging
            const savedLeft = obj.left;
            const savedTop = obj.top;
            obj.set({ dirty: true });
            obj.initDimensions?.();
            obj.set({ left: savedLeft, top: savedTop });
            obj.setCoords?.();
          }
        });

        // Re-apply perforation-line styling so reloaded perf lines stay clean & locked.
        // (Fabric doesn't serialize interaction flags, so we restore them here.)
        canvas.getObjects().forEach((obj: any) => {
          if (obj.name !== PERF_LINE_NAME) return;
          obj.locked = true;
          obj.editable = false;
          obj.set({
            hasControls: false,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
            stroke: obj.stroke || PERF_COLOR,
            strokeWidth: 0.75,
            strokeDashArray: [3, 3],
            strokeUniform: true,
            borderColor: PERF_COLOR,
          });
          obj.setCoords?.();
        });
      }

      // Remove any persisted trim guides / old text covers from older saves.
      canvas.getObjects().forEach((o: any) => {
        const isNamedGuide = o?.name === "_trimGuide";
        const isLegacyTextCover = o?.name === "_textCover";
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

        if (isNamedGuide || isLegacyTextCover || isLegacyTrimLine || isLegacyBleedMask) {
          canvas.remove(o);
        }
      });

      // Remove any old dieline objects
      canvas.getObjects().forEach((o: any) => {
        if (o?.name === "_dieline" || o?.name === "_dielineLabel") canvas.remove(o);
      });

      // Render dieline guides for boxes/bags
      if (dielineResult && dielineResult.objects.length > 0) {
        const bleedOffset = bleedPx;
        const CUT_COLOR = "#1976d2";   // blue solid for cut/trim
        const FOLD_COLOR = "#d32f2f";  // red dashed for fold/crease

        const invScale = displayScale > 0 ? 1 / displayScale : 1;


        for (const obj of dielineResult.objects) {
          const isFold = obj.style === "fold";
          const strokeColor = isFold ? FOLD_COLOR : CUT_COLOR;
          const strokeW = (isFold ? 1 : 1.5) * invScale;
          const dashArray = isFold ? [6 * invScale, 4 * invScale] : [];

          if (obj.type === "line" && obj.x1 != null) {
            const x1 = bleedOffset + obj.x1 * DPI;
            const y1 = bleedOffset + obj.y1! * DPI;
            const x2 = bleedOffset + obj.x2! * DPI;
            const y2 = bleedOffset + obj.y2! * DPI;
            const fabricLine = new Line([x1, y1, x2, y2], {
              stroke: strokeColor,
              strokeWidth: strokeW,
              strokeDashArray: dashArray,
              selectable: false,
              evented: false,
              objectCaching: false,
            } as any);
            (fabricLine as any).name = "_dieline";
            canvas.add(fabricLine);
          } else if (obj.type === "polyline" && obj.points) {
            const pts = obj.points.map(p => ({
              x: bleedOffset + p.x * DPI,
              y: bleedOffset + p.y * DPI,
            }));
            const poly = new Polyline(pts, {
              fill: "transparent",
              stroke: strokeColor,
              strokeWidth: strokeW,
              strokeDashArray: dashArray,
              selectable: false,
              evented: false,
              objectCaching: false,
            } as any);
            (poly as any).name = "_dieline";
            canvas.add(poly);
          } else if (obj.type === "text" && obj.text) {
            const text = new IText(obj.text, {
              left: bleedOffset + obj.x! * DPI,
              top: bleedOffset + obj.y! * DPI,
              fontSize: 11 * (DPI / 72) * invScale,
              fill: "#9ca3af",
              fontFamily: "Arial",
              originX: "center",
              originY: "center",
              selectable: false,
              evented: false,
              editable: false,
            } as any);
            (text as any).name = "_dielineLabel";
            (text as any).locked = true;
            canvas.add(text);
          }
        }
      }

      if (mode === "use") {
        const editableObjects: any[] = [];
        canvas.getObjects().forEach((obj: any) => {
          if (obj.name === "_trimGuide" || obj.name === "_ocrKnockout" || obj.name === "pdf_background" || obj.name === "mask_cover" || obj.name === "_dieline" || obj.name === "_dielineLabel") {
            obj.set({ selectable: false, evented: false, hasControls: false });
            return;
          }
          if (obj.locked || !obj.editable) {
            obj.set({ selectable: false, evented: false, hasControls: false, lockMovementX: true, lockMovementY: true });
          } else {
            const isTextObj = obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text';
            obj.set({
              selectable: true,
              evented: true,
              hasControls: !isTextObj,
              hasBorders: true,
              lockMovementX: isTextObj,
              lockMovementY: isTextObj,
              lockScalingX: isTextObj,
              lockScalingY: isTextObj,
              lockRotation: isTextObj,
              borderColor: "#3b82f6",
              cornerColor: "#3b82f6",
              cornerStyle: "circle",
              transparentCorners: false,
            });
            editableObjects.push(obj);
          }
        });

        // Add translucent highlight boxes behind each editable object
        editableObjects.forEach((obj: any) => {
          // Use object's own coordinates (canvas space) not getBoundingRect (screen space)
          const objLeft = obj.left ?? 0;
          const objTop = obj.top ?? 0;
          const objW = (obj.width ?? 0) * (obj.scaleX ?? 1);
          const objH = (obj.height ?? 0) * (obj.scaleY ?? 1);
          const pad = 2;
          const highlight = new Rect({
            left: objLeft - pad,
            top: objTop - pad,
            width: objW + pad * 2,
            height: objH + pad * 2,
            fill: "rgba(59, 130, 246, 0.08)",
            stroke: "rgba(59, 130, 246, 0.35)",
            strokeWidth: 1.5,
            strokeDashArray: [6, 3],
            rx: 4,
            ry: 4,
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false,
            objectCaching: false,
          } as any);
          (highlight as any).name = "_editHighlight";
          canvas.add(highlight);
          // Place highlight just behind the editable object
          const objIndex = canvas.getObjects().indexOf(obj);
          if (objIndex > 0) {
            canvas.remove(highlight);
            canvas.insertAt(objIndex, highlight);
          }
        });

        canvas.renderAll();
      }

      // Re-render PDF background from stored source path
      if (sourcePdfPath) {
        try {
          const { data: urlData } = supabase.storage.from("print-files").getPublicUrl(sourcePdfPath);
          const cacheBustedUrl = `${urlData.publicUrl}${urlData.publicUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(sourcePdfPath)}-${Date.now()}`;
          const resp = await fetch(cacheBustedUrl, { cache: "no-store" });
          if (resp.ok) {
            const buf = await resp.arrayBuffer();
            // Clone buffer so pdfjs doesn't detach it before thumbnail generation
            const bufCopy = buf.slice(0);

            let pdfWidthIn: number | undefined;
            let pdfHeightIn: number | undefined;
            let pdfBoxes: ParsedPdfPageBoxes | undefined;
            try {
              pdfBoxes = extractPdfPageBoxes(bufCopy);
              const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bufCopy) }).promise;
              const page = await pdf.getPage(1);
              const vp = page.getViewport({ scale: 1 });
              pdfWidthIn = Math.round((vp.width / 72) * 100) / 100;
              pdfHeightIn = Math.round((vp.height / 72) * 100) / 100;
            } catch (dimErr) {
              console.warn("Could not read stored PDF dimensions:", dimErr);
            }

            const { generatePdfThumbnailFromArrayBuffer } = await import("@/lib/pdfThumbnail");
            const blob = await generatePdfThumbnailFromArrayBuffer(buf, {
              maxWidth: canvasWidth * PDF_BACKGROUND_OVERSAMPLE,
              scale: 1,
            });
            const url = URL.createObjectURL(blob);
            setPreviewPdfUrl(url);
            const imgEl = new window.Image();
            imgEl.onload = () => {
              setCanvasBackground(imgEl, pdfWidthIn, pdfHeightIn, pdfBoxes);
            };
            imgEl.src = url;
          }
        } catch (err) {
          console.warn("Could not re-render PDF background:", err);
        }
      }

      // Re-apply CSS dimensions after loadFromJSON which resets viewport
      canvas.setDimensions({ width: cssWidth, height: cssHeight }, { cssOnly: true });
      canvas.renderAll();

      // Seed undo stack with initial state
      const initialData = canvas.toObject(['locked', 'editable', 'name', '_displayName']) as any;
      delete initialData.backgroundImage;
      if (Array.isArray(initialData.objects)) {
        initialData.objects = initialData.objects.filter((obj: any) => obj?.name !== "_trimGuide" && obj?.name !== "_snapGuide" && obj?.name !== "_editHighlight" && obj?.name !== "_dieline" && obj?.name !== "_dielineLabel");
      }
      undoStack.current = [JSON.stringify(initialData)];
      redoStack.current = [];
    };

    loadCanvasAndBackground();

    canvas.on("selection:created", (e) => {
      const sel = canvas.getActiveObject();
      setSelectedObject(sel || null);
      setSelectedLockedState(getSelectionLockedState(sel));
      const first = e.selected?.[0];
      if (first) {
        if ((first as any).fontSize) setFontSizePt((first as any)._fontSizePt ?? pxToPt((first as any).fontSize));
        if ((first as any).fontFamily) setFontFamily((first as any).fontFamily);
        if ((first as any).fill) setFontColor((first as any).fill);
      }
    });
    canvas.on("selection:updated", (e) => {
      const sel = canvas.getActiveObject();
      setSelectedObject(sel || null);
      setSelectedLockedState(getSelectionLockedState(sel));
      const first = e.selected?.[0];
      if (first) {
        if ((first as any).fontSize) setFontSizePt((first as any)._fontSizePt ?? pxToPt((first as any).fontSize));
        if ((first as any).fontFamily) setFontFamily((first as any).fontFamily);
        if ((first as any).fill) setFontColor((first as any).fill);
      }
    });
    canvas.on("selection:cleared", () => {
      setSelectedObject(null);
      setSelectedLockedState(false);
    });
    canvas.on("mouse:down", (e) => {
      const target = (e as any)?.target as any;
      if (!target) return;
      setSelectedObject(target);
      setSelectedLockedState(getSelectionLockedState(target));
    });
    canvas.on("object:modified", () => { clearGuidelines(canvas); syncCanvas(); });
    canvas.on("text:changed", syncCanvas);
    // Show perf measurement only on hover (after placement) or while drawing (handled in startDrawPerf)
    const isPerf = (t: any) => t && (t.name === PERF_LINE_NAME || t.name === "_perfDraft");
    canvas.on("mouse:over", (e: any) => {
      if (isPerf(e?.target)) {
        activePerfRef.current = e.target;
        setPerfTick((n) => n + 1);
      }
    });
    canvas.on("mouse:out", (e: any) => {
      if (isPerf(e?.target) && activePerfRef.current === e.target) {
        activePerfRef.current = null;
        setPerfTick((n) => n + 1);
      }
    });
    // Live-update measurement when an existing perf line is being moved
    const bumpPerfMove = (e: any) => {
      if (isPerf(e?.target)) {
        activePerfRef.current = e.target;
        setPerfTick((n) => n + 1);
      }
    };
    canvas.on("object:moving", bumpPerfMove);
    canvas.on("object:modified", bumpPerfMove);

    // In use mode: auto-enter text editing on click
    if (mode === "use") {
      const autoEditText = (e: any) => {
        const obj = e.selected?.[0] as any;
        if (obj && obj.type === "i-text" && obj.editable) {
          setTimeout(() => {
            obj.enterEditing();
            const len = (obj.text || "").length;
            obj.selectionStart = len;
            obj.selectionEnd = len;
            // Also sync the hidden textarea that Fabric creates for actual keyboard input
            const ta = obj.hiddenTextarea as HTMLTextAreaElement | undefined;
            if (ta) {
              ta.value = obj.text || "";
              ta.selectionStart = len;
              ta.selectionEnd = len;
              ta.focus();
            }
            canvas.renderAll();
          }, 50);
        }
      };
      canvas.on("selection:created", autoEditText);
      canvas.on("selection:updated", autoEditText);
    }

    // Snapping removed – free placement

    // Guidelines already cleared in object:modified above

    return () => {
      if (previewPdfUrlRef.current) {
        URL.revokeObjectURL(previewPdfUrlRef.current);
        previewPdfUrlRef.current = null;
      }
      // Fabric's dispose() replaces/removes the canvas DOM node.
      // Wrap in try-catch so React's unmount doesn't crash if the node is already gone.
      try {
        canvas.dispose();
      } catch (e) {
        // Silently ignore – the DOM node was already detached
      }
      fabricRef.current = null;
    };
  }, [canvasWidth, canvasHeight, bleedPx, mode, getSelectionLockedState, dielineResult, displayScale]);

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
      originX: "left",
      originY: "top",
    });
    (text as any).locked = !editable;
    (text as any).editable = editable;
    (text as any).name = editable ? "editable_text" : "locked_text";
    (text as any)._fontSizePt = defaultPt;

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

  const setCanvasBackground = (
    imgEl: HTMLImageElement,
    pdfPageWidthIn?: number,
    pdfPageHeightIn?: number,
    pdfBoxes?: ParsedPdfPageBoxes,
  ) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const templateTotalW = width + bleed * 2;
    const templateTotalH = height + bleed * 2;
    const trimWidthPx = Math.round(width * DPI);
    const trimHeightPx = Math.round(height * DPI);
    const toleranceIn = 0.05;
    const boxToleranceIn = 0.08;

    const addLockedPdfBackground = (left: number, top: number, scaleX: number, scaleY: number) => {
      const fabricImg = new FabricImage(imgEl, {
        left,
        top,
        scaleX,
        scaleY,
        objectCaching: false,
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
      } as any);
      (fabricImg as any).name = "pdf_background";
      canvas.add(fabricImg);
      canvas.sendObjectToBack(fabricImg);
      canvas.renderAll();
      syncCanvas();
    };

    // Remove any existing PDF background so we always keep a single locked background layer.
    canvas.getObjects().forEach((obj: any) => {
      if (obj.name === "pdf_background") canvas.remove(obj);
    });

    const renderedPageBox = pdfBoxes?.cropBox ?? pdfBoxes?.mediaBox;
    const bleedBox = pdfBoxes?.bleedBox;
    const trimBox = pdfBoxes?.trimBox ?? pdfBoxes?.artBox;

    if (
      renderedPageBox &&
      bleedBox &&
      Math.abs(bleedBox.widthIn - templateTotalW) <= boxToleranceIn &&
      Math.abs(bleedBox.heightIn - templateTotalH) <= boxToleranceIn
    ) {
      const placement = computePdfBoxPlacement({
        imageWidth: imgEl.width,
        imageHeight: imgEl.height,
        mediaBox: renderedPageBox,
        box: bleedBox,
        targetLeft: 0,
        targetTop: 0,
        targetWidth: canvasWidth,
        targetHeight: canvasHeight,
      });

      if (placement) {
        addLockedPdfBackground(placement.left, placement.top, placement.scale, placement.scale);
        return;
      }
    }

    if (
      renderedPageBox &&
      trimBox &&
      Math.abs(trimBox.widthIn - width) <= boxToleranceIn &&
      Math.abs(trimBox.heightIn - height) <= boxToleranceIn
    ) {
      const placement = computePdfBoxPlacement({
        imageWidth: imgEl.width,
        imageHeight: imgEl.height,
        mediaBox: renderedPageBox,
        box: trimBox,
        targetLeft: bleedPx,
        targetTop: bleedPx,
        targetWidth: trimWidthPx,
        targetHeight: trimHeightPx,
      });

      if (placement) {
        addLockedPdfBackground(placement.left, placement.top, placement.scale, placement.scale);
        return;
      }
    }

    // If the PDF page is larger than the template (extra artboard around dieline),
    // crop to the centered template area.
    if (
      pdfPageWidthIn &&
      pdfPageHeightIn &&
      (pdfPageWidthIn > templateTotalW + toleranceIn || pdfPageHeightIn > templateTotalH + toleranceIn)
    ) {
      const scaleToFillX = canvasWidth / (imgEl.width * (templateTotalW / pdfPageWidthIn));
      const scaleToFillY = canvasHeight / (imgEl.height * (templateTotalH / pdfPageHeightIn));
      const fillScale = Math.max(scaleToFillX, scaleToFillY);

      const offsetXFraction = (pdfPageWidthIn - templateTotalW) / 2 / pdfPageWidthIn;
      const offsetYFraction = (pdfPageHeightIn - templateTotalH) / 2 / pdfPageHeightIn;

      addLockedPdfBackground(
        -(offsetXFraction * imgEl.width * fillScale),
        -(offsetYFraction * imgEl.height * fillScale),
        fillScale,
        fillScale,
      );
      return;
    }

    // If PDF exactly matches dieline size (without bleed), align it to trim area so type scale stays true.
    if (
      pdfPageWidthIn &&
      pdfPageHeightIn &&
      Math.abs(pdfPageWidthIn - width) <= toleranceIn &&
      Math.abs(pdfPageHeightIn - height) <= toleranceIn
    ) {
      const fitScale = Math.min(trimWidthPx / imgEl.width, trimHeightPx / imgEl.height);
      addLockedPdfBackground(
        bleedPx + (trimWidthPx - imgEl.width * fitScale) / 2,
        bleedPx + (trimHeightPx - imgEl.height * fitScale) / 2,
        fitScale,
        fitScale,
      );
      return;
    }

    // Standard fit behavior for matching or smaller PDFs
    const fitScale = Math.min(canvasWidth / imgEl.width, canvasHeight / imgEl.height);
    addLockedPdfBackground(
      (canvasWidth - imgEl.width * fitScale) / 2,
      (canvasHeight - imgEl.height * fitScale) / 2,
      fitScale,
      fitScale,
    );
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
        // Read the PDF to validate its page size against template dimensions
        const arrayBuf = await file.arrayBuffer();
        let pdfWidthIn = 0;
        let pdfHeightIn = 0;
        let pdfBoxes: ParsedPdfPageBoxes | undefined;
        try {
          pdfBoxes = extractPdfPageBoxes(arrayBuf);
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
          const page = await pdf.getPage(1);
          const vp = page.getViewport({ scale: 1 });
          // PDF units are 1/72 inch (points)
          pdfWidthIn = Math.round(vp.width / 72 * 100) / 100;
          pdfHeightIn = Math.round(vp.height / 72 * 100) / 100;
          const templateTotalW = Math.round((width + bleed * 2) * 100) / 100;
          const templateTotalH = Math.round((height + bleed * 2) * 100) / 100;
          const wDiff = Math.abs(pdfWidthIn - templateTotalW);
          const hDiff = Math.abs(pdfHeightIn - templateTotalH);
          if (wDiff <= 0.05 && hDiff <= 0.05) {
            toast.success(`PDF dimensions match template: ${pdfWidthIn}" × ${pdfHeightIn}"`);
          } else if (pdfWidthIn >= templateTotalW - 0.05 && pdfHeightIn >= templateTotalH - 0.05) {
            toast.info(
              `PDF page (${pdfWidthIn}" × ${pdfHeightIn}") is larger than template (${templateTotalW}" × ${templateTotalH}"). The design area will be centered and cropped to fit.`,
              { duration: 6000 }
            );
          } else {
            toast.warning(
              `PDF size (${pdfWidthIn}" × ${pdfHeightIn}") is smaller than template (${templateTotalW}" × ${templateTotalH}" with bleed). The PDF will be scaled to fit.`,
              { duration: 8000 }
            );
          }
        } catch (dimErr) {
          console.warn("Could not validate PDF dimensions:", dimErr);
        }

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

        // 2. Render preview at 4x canvas width for sharp on-screen proofing
        const blob = await generatePdfThumbnailFromFile(file, {
          maxWidth: canvasWidth * PDF_BACKGROUND_OVERSAMPLE,
          scale: 1,
        });
        const url = URL.createObjectURL(blob);
        setPreviewPdfUrl(url);
        const imgEl = new window.Image();
        const capturedW = pdfWidthIn;
        const capturedH = pdfHeightIn;
        imgEl.onload = () => {
          setCanvasBackground(imgEl, capturedW || undefined, capturedH || undefined, pdfBoxes);
        };
        imgEl.src = url;
      } catch (err: any) {
        console.error("PDF render error:", err);
        alert("Failed to render PDF. Make sure it's a valid PDF file.");
      }
    };
    input.click();
  };

  /**
   * Phase 2 — extract REAL text from the PDF's vector layer via pdf.js getTextContent().
   * Far more accurate than AI/OCR when the PDF has live (non-outlined) text: exact
   * characters, positions and sizes. Each text run becomes a locked editable layer,
   * with a knockout covering the original baked-in text. Placement is derived from the
   * on-canvas pdf_background rectangle, so it works regardless of crop/fit/centering.
   */
  const extractPdfVectorText = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (!sourcePdfPath) {
      toast.error("Add a PDF background first, then extract its text");
      return;
    }
    const bg = canvas.getObjects().find((o: any) => o.name === "pdf_background") as any;
    if (!bg) {
      toast.error("No PDF background found on the canvas");
      return;
    }
    setExtractingVector(true);
    try {
      const { data: urlData } = supabase.storage.from("print-files").getPublicUrl(sourcePdfPath);
      const cacheBusted = `${urlData.publicUrl}${urlData.publicUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(sourcePdfPath)}-${Date.now()}`;
      const resp = await fetch(cacheBusted, { cache: "no-store" });
      if (!resp.ok) throw new Error("Could not fetch the source PDF");
      const buf = await resp.arrayBuffer();

      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const pageW = vp.width;   // PDF points
      const pageH = vp.height;
      const tc = await page.getTextContent();
      const items = (tc.items as any[]).filter((it) => typeof it.str === "string" && it.str.trim().length > 0);

      if (items.length === 0) {
        toast.warning("No selectable text found — this PDF's text is likely outlined. Try AI 'Extract All Text' instead.");
        return;
      }

      // On-canvas rectangle the PDF occupies (placement-agnostic mapping)
      const bgLeft = bg.left ?? 0;
      const bgTop = bg.top ?? 0;
      const bgW = bg.getScaledWidth();
      const bgH = bg.getScaledHeight();
      const sx = bgW / pageW;
      const sy = bgH / pageH;

      let added = 0;
      for (const it of items) {
        const str = it.str.trim();
        if (!str) continue;

        const t = it.transform as number[]; // [a,b,c,d,e,f]; e,f = baseline x,y (origin bottom-left)
        const ex = t[4];
        const ey = t[5];
        const fontPtPdf = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 10;
        const fontPx = fontPtPdf * sy;

        const leftPx = bgLeft + (ex / pageW) * bgW;
        const baselineFromTop = bgTop + ((pageH - ey) / pageH) * bgH;
        const topPx = baselineFromTop - fontPx; // shift from baseline to top of glyph (approx)
        const widthPx = ((it.width as number) || str.length * fontPtPdf * 0.5) * sx;

        const fam = tc.styles?.[it.fontName]?.fontFamily || "Arial";
        const fontDef = FONT_OPTIONS.find((f) => f.value.toLowerCase() === String(fam).toLowerCase());
        const useFam = fontDef?.value || "Arial";
        if (fontDef?.google) await loadGoogleFont(fontDef.value);

        const textObj = new IText(str, {
          left: leftPx,
          top: topPx,
          fontSize: fontPx,
          fontFamily: useFam,
          fill: "#000000",
          editable: true,
          originX: "left",
          originY: "top",
          padding: 0,
        });
        (textObj as any)._fontSizePt = pxToPt(fontPx);
        (textObj as any).locked = true;      // locked by default per policy
        (textObj as any).editable = false;
        (textObj as any).name = "locked_text";
        textObj.set({ borderColor: "#94a3b8", cornerColor: "#94a3b8" } as any);

        canvas.add(textObj);
        addOcrKnockoutCover(canvas, {
          left: leftPx,
          top: topPx,
          width: Math.max(widthPx, fontPx * 0.3),
          height: fontPx * 1.2,
        });
        canvas.bringObjectToFront(textObj);
        added++;
      }

      fixZOrder(canvas);
      canvas.requestRenderAll();
      syncCanvas();
      toast.success(`Extracted ${added} real text layer${added !== 1 ? "s" : ""} from the PDF`);
    } catch (err: any) {
      console.error("PDF vector text extract error:", err);
      toast.error(err.message || "Failed to extract PDF text");
    } finally {
      setExtractingVector(false);
    }
  };

  // Extract ALL text from the canvas using AI full-page analysis
  const extractAllText = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setExtractingAll(true);
    try {
      // Get the canvas as a high-res image for AI analysis
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });

      const { data, error } = await supabase.functions.invoke("decompose-design-image", {
        body: {
          image_url: dataUrl,
          extract_all: true,
          canvas_width: canvasWidth,
          canvas_height: canvasHeight,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const regions = data?.regions || [];
      if (regions.length === 0) {
        toast.warning("No text regions detected");
        return;
      }

      // Place each detected text region on the canvas
      let addedCount = 0;
      for (const region of regions) {
        const text = region.text?.trim();
        if (!text) continue;

        // Convert percentage positions to canvas pixel coords
        const x = (region.x_percent / 100) * canvasWidth;
        const y = (region.y_percent / 100) * canvasHeight;

        // Determine font size: use AI-detected pt or derive from region height
        const regionHeightPx = (region.h_percent / 100) * canvasHeight;
        let fontSizePx: number;
        let fontSizePtVal: number;
        if (region.font_size_pt && region.font_size_pt > 0) {
          fontSizePtVal = region.font_size_pt;
          fontSizePx = ptToPx(region.font_size_pt);
        } else {
          fontSizePx = Math.max(12, Math.round(regionHeightPx * 0.7));
          fontSizePtVal = pxToPt(fontSizePx);
        }

        // Load font if it's a Google font
        const fontFam = region.font_family || "Arial";
        const fontDef = FONT_OPTIONS.find(f => f.value.toLowerCase() === fontFam.toLowerCase());
        if (fontDef?.google) {
          await loadGoogleFont(fontDef.value);
        }

        const textObj = new IText(text, {
          left: x,
          top: y,
          fontSize: fontSizePx,
          fontFamily: fontDef?.value || fontFam,
          fontWeight: region.font_weight || "normal",
          fontStyle: region.font_style || "normal",
          fill: region.color || "#000000",
          editable: true,
          padding: 0,
          originX: "left",
          originY: "top",
        });
        (textObj as any)._fontSizePt = fontSizePtVal;
        (textObj as any).locked = true;
        (textObj as any).editable = false;
        (textObj as any).name = "locked_text";
        textObj.set({
          borderColor: "#94a3b8",
          cornerColor: "#94a3b8",
        } as any);

        canvas.add(textObj);
        // Use OCR-reported bounds for knockout, not rendered text bounds
        const knockoutBounds = ocrPercentsToBounds(
          region.x_percent, region.y_percent, region.w_percent, region.h_percent,
          0, 0, canvasWidth, canvasHeight
        );
        addOcrKnockoutCover(canvas, knockoutBounds);
        canvas.bringObjectToFront(textObj);
        addedCount++;
      }

      canvas.renderAll();
      syncCanvas();
      toast.success(`Extracted ${addedCount} text region${addedCount !== 1 ? "s" : ""} from the design`);
    } catch (err: any) {
      console.error("Extract all text error:", err);
      toast.error(err.message || "Failed to extract text from design");
    } finally {
      setExtractingAll(false);
    }
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
      fixZOrder(canvas);
      canvas.setActiveObject(fabricImg);
      canvas.renderAll();
      syncCanvas();
    });
  };

  /** Upload a PDF art file — stores the original for print, renders high-res preview on canvas */
  const addPdfArtwork = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const canvas = fabricRef.current;
      if (!canvas) return;

      try {
        // 1. Upload original PDF to storage for print-ready use
        const storagePath = `artwork/${crypto.randomUUID()}/art.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("print-files")
          .upload(storagePath, file, { contentType: "application/pdf", upsert: true });
        if (uploadError) {
          console.error("PDF artwork upload error:", uploadError);
          toast.error("Failed to upload PDF artwork");
          return;
        }
        toast.success("PDF artwork stored for print-quality export");

        // 2. Render a high-res preview (4x) for on-screen placement
        const blob = await generatePdfThumbnailFromFile(file, {
          maxWidth: canvasWidth * PDF_BACKGROUND_OVERSAMPLE,
          scale: 1,
        });
        const url = URL.createObjectURL(blob);
        const imgEl = new window.Image();
        imgEl.onload = () => {
          const maxW = canvasWidth * 0.6;
          const maxH = canvasHeight * 0.6;
          const scale = Math.min(maxW / imgEl.width, maxH / imgEl.height, 1);
          const fabricImg = new FabricImage(imgEl, {
            left: canvasWidth / 2 - (imgEl.width * scale) / 2,
            top: canvasHeight / 2 - (imgEl.height * scale) / 2,
            scaleX: scale,
            scaleY: scale,
          });
          (fabricImg as any).locked = false;
          (fabricImg as any).editable = true;
          (fabricImg as any).name = "user_artwork";
          (fabricImg as any)._pdfStoragePath = storagePath;
          fabricImg.set({
            borderColor: "#3b82f6",
            cornerColor: "#3b82f6",
            cornerStyle: "circle",
            transparentCorners: false,
          } as any);
          canvas.add(fabricImg);
          fixZOrder(canvas);
          canvas.setActiveObject(fabricImg);
          canvas.renderAll();
          syncCanvas();
        };
        imgEl.src = url;
      } catch (err: any) {
        console.error("PDF artwork error:", err);
        toast.error("Failed to process PDF artwork");
      }
    };
    input.click();
  };

  /**
   * Import an SVG file and decompose it into individual editable vector layers.
   * Each shape/text element becomes its own object (locked by default — admins
   * unlock per-layer via the Layers panel). Phase 1 of the layered-editor plan.
   */
  const importSvg = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,image/svg+xml";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const canvas = fabricRef.current;
      if (!canvas) return;
      try {
        const svgText = await file.text();
        const result = await loadSVGFromString(svgText);
        const objects = ((result?.objects || []) as (FabricObject | null)[]).filter(Boolean) as FabricObject[];
        if (objects.length === 0) {
          toast.error("No shapes found in that SVG");
          return;
        }

        // Group to compute combined bounds + scale into the trim area, then disband
        // (removeAll bakes the group transform back into each child) so every shape
        // lands on the canvas as its own editable layer.
        const group = new Group(objects as any);
        const trimW = Math.round(width * DPI);
        const trimH = Math.round(height * DPI);
        const gW = group.width || trimW;
        const gH = group.height || trimH;
        const scale = Math.min(trimW / gW, trimH / gH, 1) || 1;
        group.scale(scale);
        group.set({
          left: bleedPx + (trimW - group.getScaledWidth()) / 2,
          top: bleedPx + (trimH - group.getScaledHeight()) / 2,
        });
        group.setCoords();

        canvas.add(group);
        const children = ((group.removeAll() as FabricObject[]) || []);
        canvas.remove(group);

        const baseName = file.name.replace(/\.svg$/i, "");
        children.forEach((child: any, i: number) => {
          const typeStr = String(child.type || "").toLowerCase();
          const isText = typeStr.includes("text");
          child.locked = true;       // imported layers locked by default
          child.editable = false;
          child.name = isText ? "locked_text" : (typeStr === "image" ? "locked_image" : "svg_shape");
          if (!child._displayName) child._displayName = `${baseName} ${i + 1}`;
          child.set({
            selectable: true,
            evented: true,
            borderColor: "#94a3b8",
            cornerColor: "#94a3b8",
          });
          child.setCoords?.();
          canvas.add(child);
        });

        fixZOrder(canvas);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        syncCanvas();
        toast.success(`Imported ${children.length} layer${children.length !== 1 ? "s" : ""} from SVG`);
      } catch (err: any) {
        console.error("SVG import error:", err);
        toast.error("Failed to import SVG");
      }
    };
    input.click();
  };

  /**
   * Add a vector shape to the canvas. Shapes are part of the template design,
   * so they come in locked (customers can't edit them unless an admin unlocks
   * the layer). Default style is a black outline (transparent fill) — useful as
   * frames / dividers / accents; recolour comes with the property panel (Stage B).
   */
  const addShape = (kind: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const size = Math.round(Math.min(canvasWidth, canvasHeight) * 0.35);
    const left = Math.round(canvasWidth / 2 - size / 2);
    const top = Math.round(canvasHeight / 2 - size / 2);
    const stroke = "#000000";
    const strokeWidth = Math.max(2, ptToPx(1));
    const base: any = { fill: "transparent", stroke, strokeWidth, strokeUniform: true };

    let obj: FabricObject;
    switch (kind) {
      case "roundRect":
        obj = new Rect({ left, top, width: size, height: Math.round(size * 0.66), rx: Math.round(size * 0.1), ry: Math.round(size * 0.1), ...base });
        break;
      case "circle":
        obj = new FabricCircle({ left, top, radius: size / 2, ...base });
        break;
      case "ellipse":
        obj = new FabricEllipse({ left, top, rx: size / 2, ry: Math.round(size * 0.33), ...base });
        break;
      case "triangle":
        obj = new FabricTriangle({ left, top, width: size, height: size, ...base });
        break;
      case "line":
        obj = new Line([left, top + size / 2, left + size, top + size / 2], { stroke, strokeWidth, strokeUniform: true } as any);
        break;
      case "star":
        obj = new FabricPolygon(starPolygonPoints(5, size / 2, size / 4), base);
        obj.set({ left, top });
        break;
      case "hexagon":
        obj = new FabricPolygon(regularPolygonPoints(6, size / 2), base);
        obj.set({ left, top });
        break;
      case "rect":
      default:
        obj = new Rect({ left, top, width: size, height: Math.round(size * 0.66), ...base });
        break;
    }

    (obj as any).locked = true;
    (obj as any).editable = false;
    (obj as any).name = "shape";
    obj.set({ borderColor: "#94a3b8", cornerColor: "#94a3b8" } as any);
    obj.setCoords?.();
    canvas.add(obj);
    fixZOrder(canvas);
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    syncCanvas();
    toast.success("Shape added");
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

  const setSelectionLockedState = (newLocked: boolean) => {
    if (!selectedObject || !fabricRef.current) return;
    const canvas = fabricRef.current;

    const targets: any[] = ((selectedObject as any).type === "activeSelection" || (selectedObject as any).type === "activeselection")
      ? ((selectedObject as any).getObjects?.() || [])
      : [selectedObject];

    if (targets.length === 0) return;

    targets.forEach((obj: any) => {
      obj.locked = newLocked;
      obj.editable = !newLocked;
      obj.name = newLocked
        ? (obj.type?.includes("text") ? "locked_text" : "locked_image")
        : (obj.type?.includes("text") ? "editable_text" : "editable_image");
      obj.set({
        borderColor: newLocked ? "#94a3b8" : "#3b82f6",
        cornerColor: newLocked ? "#94a3b8" : "#3b82f6",
        hasControls: mode === "edit" ? true : !newLocked,
      });
      if (typeof obj.setCoords === "function") obj.setCoords();
    });

    const active = canvas.getActiveObject();
    setSelectedObject(active || selectedObject);
    setSelectedLockedState(getSelectionLockedState(active || selectedObject));
    canvas.requestRenderAll();
    syncCanvas();
    toast.success(newLocked ? "Element locked" : "Element set to editable", { duration: 1500 });
  };

  const deleteSelected = () => {
    if (!selectedObject || !fabricRef.current) return;
    fabricRef.current.remove(selectedObject);
    setSelectedObject(null);
    setSelectedLockedState(false);
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
      fixZOrder(canvas);
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
        const detectedXPercent = typeof data?.x_percent === "number" ? data.x_percent : null;
        const detectedYPercent = typeof data?.y_percent === "number" ? data.y_percent : null;
        const detectedWPercent = typeof data?.w_percent === "number" ? data.w_percent : null;
        const detectedHPercent = typeof data?.h_percent === "number" ? data.h_percent : null;

        if (!extractedText.trim()) {
          toast.warning("No text detected in the selected area");
          canvas.remove(rect);
        } else {
          canvas.remove(rect);

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

          // Determine font size + position from OCR region when available
          let finalFontSizePx: number;
          let finalFontSizePt: number;
          const textLeft = cropLeft + ((detectedXPercent ?? 0) / 100) * cropW;
          const textTop = cropTop + ((detectedYPercent ?? 0) / 100) * cropH;
          const targetTextHeightPx = detectedHPercent && detectedHPercent > 0
            ? (detectedHPercent / 100) * cropH
            : cropH;

          if (detectedFontSizePt && detectedFontSizePt > 0) {
            // Use the AI-detected point size directly
            finalFontSizePt = detectedFontSizePt;
            finalFontSizePx = ptToPx(detectedFontSizePt);
          } else {
            // Auto-fit: trial render, measure in canvas coords, then scale
            const trialSize = 40;
            const trialText = new IText(extractedText, {
              left: textLeft,
              top: textTop,
              fontSize: trialSize,
              fontFamily: useFontFamily,
              fontWeight: detectedWeight,
              fontStyle: detectedStyle,
              fill: detectedColor,
              editable: true,
              padding: 0,
            });
            canvas.add(trialText);
            canvas.renderAll();
            const trialBounds = getObjectBoundsInCanvas(trialText);
            const measuredH = trialBounds.height;
            finalFontSizePx = measuredH > 0
              ? Math.round(trialSize * (targetTextHeightPx / measuredH))
              : Math.max(Math.round(targetTextHeightPx * 0.6), ptToPx(4));
            finalFontSizePt = pxToPt(finalFontSizePx);
            canvas.remove(trialText);
          }

          const text = new IText(extractedText, {
            left: textLeft,
            top: textTop,
            fontSize: finalFontSizePx,
            fontFamily: useFontFamily,
            fontWeight: detectedWeight,
            fontStyle: detectedStyle,
            fill: detectedColor,
            editable: true,
            padding: 0,
            originX: "left",
            originY: "top",
          });
          (text as any)._fontSizePt = finalFontSizePt;
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
          // Use OCR bounds relative to the crop rectangle for knockout placement
          // This ensures the knockout covers the original PDF text exactly where it was
          const knockoutBounds = ocrPercentsToBounds(
            detectedXPercent, detectedYPercent, detectedWPercent, detectedHPercent,
            cropLeft, cropTop, cropW, cropH
          );
          addOcrKnockoutCover(canvas, knockoutBounds);
          canvas.bringObjectToFront(text);

          // Fix z-order: bg at back, trim on top
          const bg = canvas.getObjects().find((o: any) => o.name === "pdf_background");
          if (bg) canvas.sendObjectToBack(bg);
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
      if (o.name === "_trimGuide" || o.name === "_zoneSelect" || o.name === OCR_KNOCKOUT_NAME) return;
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
          const computedPt = pxToPt(fontSize);

          const textObj = new IText(isEditable ? "Type here" : "Locked text", {
            left: rect.left || 0,
            top: rect.top || 0,
            fontSize,
            fontFamily: fontFamily || "Arial",
            fill: fontColor || "#000000",
            editable: true,
            padding: 4,
            width: w,
            originX: "left",
            originY: "top",
          } as any);
          (textObj as any).locked = !isEditable;
          (textObj as any).editable = isEditable;
          (textObj as any).name = isEditable ? "editable_text" : "locked_text";
          (textObj as any)._fontSizePt = computedPt;
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
      if (o.name === "_trimGuide" || o.name === GUIDE_NAME || o.name === "_drawTextRect" || o.name === OCR_KNOCKOUT_NAME) return;
      o.set({ evented: true });
    });
    canvas.renderAll();
  };

  // Reactively update canvas CSS dimensions when container resizes (without recreating)
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: cssWidth, height: cssHeight }, { cssOnly: true });
    canvas.renderAll();
  }, [displayScale, cssWidth, cssHeight]);

  // --- Draw Mask: click-and-drag to place a white cover-up rectangle ---
  const startDrawMask = () => {
    setDrawMaskMode(true);
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
      drawMaskStartRef.current = { x, y };
      const rect = new Rect({
        left: x, top: y, width: 1, height: 1,
        fill: "rgba(255,255,255,0.6)",
        stroke: "#ef4444",
        strokeWidth: 1,
        strokeDashArray: [4, 4],
        selectable: false, evented: false,
        name: "_drawMaskRect",
      } as any);
      drawMaskRectRef.current = rect;
      canvas.add(rect);
      canvas.renderAll();
    };

    const onMouseMove = (e: any) => {
      if (!drawMaskStartRef.current || !drawMaskRectRef.current) return;
      const pointer = canvas.getViewportPoint(e.e);
      const zoom = canvas.getZoom();
      const x = pointer.x / zoom;
      const y = pointer.y / zoom;
      const start = drawMaskStartRef.current;
      drawMaskRectRef.current.set({
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

      const rect = drawMaskRectRef.current;
      if (rect) {
        const w = rect.width || 0;
        const h = rect.height || 0;
        const left = rect.left || 0;
        const top = rect.top || 0;
        canvas.remove(rect);

        if (w > 5 && h > 5) {
          const mask = new Rect({
            left, top, width: w, height: h,
            fill: "#ffffff",
            selectable: true,
            evented: true,
            hasControls: true,
            hasBorders: true,
            strokeWidth: 0,
            name: "mask_cover",
          } as any);
          (mask as any).locked = false;
          (mask as any).editable = false;

          canvas.add(mask);
          // Place mask above the background but keep it selectable
          const bg = canvas.getObjects().find((o: any) => o.name === "pdf_background");
          if (bg) {
            const bgIdx = canvas.getObjects().indexOf(bg);
            canvas.remove(mask);
            canvas.insertAt(bgIdx + 1, mask);
          }
          canvas.setActiveObject(mask);
          canvas.renderAll();
          syncCanvas();
          toast.success("Mask added — drag or resize it to cover unwanted areas");
        }
      }

      drawMaskRectRef.current = null;
      drawMaskStartRef.current = null;
      endDrawMask();
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);
  };

  const endDrawMask = () => {
    setDrawMaskMode(false);
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = mode === "edit";
    canvas.defaultCursor = "default";
    canvas.getObjects().forEach((o: any) => {
      if (o.name === "_trimGuide" || o.name === GUIDE_NAME || o.name === "_drawMaskRect" || o.name === OCR_KNOCKOUT_NAME) return;
      o.set({ evented: true });
    });
    canvas.renderAll();
  };

  // --- Draw Perf Line: click-drag to add a perforation (tear-off) line to the dieline ---
  // The line snaps to pure horizontal or vertical based on the dominant drag axis, which
  // keeps it clean on screen and unambiguous to reconstruct in the print-ready PDF export.
  const startDrawPerf = () => {
    setDrawPerfMode(true);
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = false;
    canvas.defaultCursor = "crosshair";
    canvas.getObjects().forEach((o: any) => o.set({ evented: false }));
    canvas.renderAll();

    let startPt: { x: number; y: number } | null = null;
    let perfLine: Line | null = null;

    const onMouseDown = (e: any) => {
      const pointer = canvas.getViewportPoint(e.e);
      const zoom = canvas.getZoom();
      startPt = { x: pointer.x / zoom, y: pointer.y / zoom };
      perfLine = new Line([startPt.x, startPt.y, startPt.x, startPt.y], {
        stroke: PERF_COLOR,
        strokeWidth: 0.75,
        strokeDashArray: [3, 3],
        strokeUniform: true,
        selectable: false,
        evented: false,
        name: "_perfDraft",
      } as any);
      canvas.add(perfLine);
      activePerfRef.current = perfLine;
      setPerfTick((n) => n + 1);
      canvas.renderAll();
    };

    const onMouseMove = (e: any) => {
      if (!startPt || !perfLine) return;
      const pointer = canvas.getViewportPoint(e.e);
      const zoom = canvas.getZoom();
      const x = pointer.x / zoom;
      const y = pointer.y / zoom;
      // Snap to pure horizontal or vertical based on the dominant drag axis
      const dx = Math.abs(x - startPt.x);
      const dy = Math.abs(y - startPt.y);
      if (dx >= dy) {
        perfLine.set({ x1: startPt.x, y1: startPt.y, x2: x, y2: startPt.y });
      } else {
        perfLine.set({ x1: startPt.x, y1: startPt.y, x2: startPt.x, y2: y });
      }
      perfLine.setCoords();
      activePerfRef.current = perfLine;
      setPerfTick((n) => n + 1);
      canvas.renderAll();
    };

    const onMouseUp = () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);

      if (perfLine) {
        const len = Math.hypot(
          (perfLine.x2 ?? 0) - (perfLine.x1 ?? 0),
          (perfLine.y2 ?? 0) - (perfLine.y1 ?? 0),
        );
        if (len < 4) {
          // Accidental click, not a drag — discard
          canvas.remove(perfLine);
        } else {
          (perfLine as any).name = PERF_LINE_NAME;
          (perfLine as any).locked = true;   // end users can't move/edit it in "use" mode
          (perfLine as any).editable = false;
          perfLine.set({
            selectable: true,                 // admins can still select / move / delete in edit mode
            evented: true,
            hasControls: false,               // keep it a clean straight segment (no resize handles)
            hasBorders: true,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
            borderColor: PERF_COLOR,
          } as any);
          perfLine.setCoords();
          canvas.setActiveObject(perfLine);
          fixZOrder(canvas);
          syncCanvas();
          toast.success("Perf line added");
        }
        canvas.renderAll();
      }

      // Clear the measurement once the drag is done; hover will bring it back
      activePerfRef.current = null;
      setPerfTick((n) => n + 1);

      endDrawPerf();
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);
  };

  // Quick add: insert a full-width horizontal perf line at vertical center.
  // The line is locked on the X axis so the user can only nudge/drag it up & down.
  const addHorizontalPerf = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const y = canvasHeight / 2;
    const line = new Line([0, y, canvasWidth, y], {
      stroke: PERF_COLOR,
      strokeWidth: 0.75,
      strokeDashArray: [3, 3],
      strokeUniform: true,
      name: PERF_LINE_NAME,
      selectable: true,
      evented: true,
      hasControls: false,
      hasBorders: true,
      lockMovementX: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      borderColor: PERF_COLOR,
    } as any);
    (line as any).locked = true;
    (line as any).editable = false;
    canvas.add(line);
    line.setCoords();
    canvas.setActiveObject(line);
    activePerfRef.current = line;
    setPerfTick((n) => n + 1);
    fixZOrder(canvas);
    syncCanvas();
    canvas.renderAll();
    toast.success("Horizontal perf line added — drag up/down to position");
  };

  const endDrawPerf = () => {
    setDrawPerfMode(false);
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = mode === "edit";
    canvas.defaultCursor = "default";
    canvas.getObjects().forEach((o: any) => {
      if (o.name === "_trimGuide" || o.name === GUIDE_NAME || o.name === OCR_KNOCKOUT_NAME) return;
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

        // Find locked text objects that overlap with the drawn zone
        let unlocked = 0;
        canvas.getObjects().forEach((obj: any) => {
          if (!obj.type?.includes("text") && obj.type !== "i-text" && obj.type !== "textbox") return;
          if (!obj.locked) return;
          const br = getObjectBoundsInCanvas(obj);
          const oLeft = br.left;
          const oTop = br.top;
          const oRight = oLeft + br.width;
          const oBottom = oTop + br.height;

          // Check if the object's bounding box overlaps with the drawn zone
          const overlaps =
            oLeft < zoneRight && oRight > zoneLeft &&
            oTop < zoneBottom && oBottom > zoneTop;

          // Additionally require at least 50% of the object to be inside the zone
          const overlapW = Math.max(0, Math.min(oRight, zoneRight) - Math.max(oLeft, zoneLeft));
          const overlapH = Math.max(0, Math.min(oBottom, zoneBottom) - Math.max(oTop, zoneTop));
          const overlapArea = overlapW * overlapH;
          const objArea = (oRight - oLeft) * (oBottom - oTop);
          const overlapRatio = objArea > 0 ? overlapArea / objArea : 0;

          if (overlaps && overlapRatio > 0.5) {
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
    canvas.selection = mode === "edit";
    canvas.defaultCursor = "default";
    canvas.getObjects().forEach((obj: any) => {
      if (obj.name === "_trimGuide" || obj.name === GUIDE_NAME || obj.name === "_editHighlight" || obj.name === OCR_KNOCKOUT_NAME || obj.name === "pdf_background" || obj.name === "mask_cover") {
        obj.set({ selectable: false, evented: false, hasControls: false });
        return;
      }

      if (mode === "edit") {
        // In template edit mode, everything should be selectable so lock/edit state can be adjusted.
        obj.set({ selectable: true, evented: true, hasControls: true });
      } else if (obj.locked || !obj.editable) {
        obj.set({ selectable: false, evented: false, hasControls: false });
      } else {
        const isTextObj = obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text';
        obj.set({
          selectable: true,
          evented: true,
          hasControls: !isTextObj,
          lockMovementX: isTextObj,
          lockMovementY: isTextObj,
          lockScalingX: isTextObj,
          lockScalingY: isTextObj,
          lockRotation: isTextObj,
        });
      }
    });
    canvas.renderAll();
  };

  // Auto-extract removed - user positions PDF manually

  // Helper: get all selected text objects (handles both single & multi-select)
  const getSelectedTextObjects = (): any[] => {
    const canvas = fabricRef.current;
    if (!canvas) return [];
    const active = canvas.getActiveObject();
    if (!active) return [];
    // ActiveSelection (multi-select)
    if ((active as any).type === "activeselection" || (active as any).type === "activeSelection") {
      return ((active as any).getObjects?.() || []).filter((o: any) =>
        o.type === "i-text" || o.type === "textbox" || o.type === "text"
      );
    }
    // Single text object
    if (active.type === "i-text" || (active as any).type === "textbox" || (active as any).type === "text") {
      return [active];
    }
    return [];
  };

  const applyFontSize = (sizePt: number) => {
    const canvas = fabricRef.current;
    const textObjs = getSelectedTextObjects();
    if (!canvas || textObjs.length === 0) return;
    setFontSizePt(sizePt);
    textObjs.forEach((obj: any) => {
      obj.set("fontSize", ptToPx(sizePt));
      obj._fontSizePt = sizePt;
    });
    canvas.renderAll();
    syncCanvas();
  };

  const applyFontFamily = async (family: string) => {
    const canvas = fabricRef.current;
    const textObjs = getSelectedTextObjects();
    if (!canvas || textObjs.length === 0) return;
    const fontDef = FONT_OPTIONS.find((f) => f.value === family);
    if (fontDef?.google) {
      await loadGoogleFont(family);
    }
    setFontFamily(family);
    textObjs.forEach((obj: any) => obj.set("fontFamily", family));
    canvas.renderAll();
    syncCanvas();
  };

  const toggleBold = () => {
    const canvas = fabricRef.current;
    const textObjs = getSelectedTextObjects();
    if (!canvas || textObjs.length === 0) return;
    // Toggle based on first object's state
    const newWeight = (textObjs[0] as any).fontWeight === "bold" ? "normal" : "bold";
    textObjs.forEach((obj: any) => obj.set("fontWeight", newWeight));
    canvas.renderAll();
    syncCanvas();
  };

  const toggleItalic = () => {
    const canvas = fabricRef.current;
    const textObjs = getSelectedTextObjects();
    if (!canvas || textObjs.length === 0) return;
    const newStyle = (textObjs[0] as any).fontStyle === "italic" ? "normal" : "italic";
    textObjs.forEach((obj: any) => obj.set("fontStyle", newStyle));
    canvas.renderAll();
    syncCanvas();
  };

  const applyFontColor = (color: string) => {
    const canvas = fabricRef.current;
    const textObjs = getSelectedTextObjects();
    if (!canvas || textObjs.length === 0) return;
    setFontColor(color);
    textObjs.forEach((obj: any) => obj.set("fill", color));
    canvas.renderAll();
    syncCanvas();
  };
  // Split selected text within an IText into a separate editable object
  const splitSelectedText = () => {
    const canvas = fabricRef.current;
    const obj = selectedObject as any;
    if (!canvas || !obj || !obj.isEditing) return;

    const selStart = obj.selectionStart ?? 0;
    const selEnd = obj.selectionEnd ?? 0;
    if (selStart === selEnd) {
      toast.info("Select some text first, then click Split");
      return;
    }

    const fullText: string = obj.text || "";
    const selectedText = fullText.substring(selStart, selEnd);
    const beforeText = fullText.substring(0, selStart);
    const afterText = fullText.substring(selEnd);

    // Get properties from the source object
    const fontSize = obj.fontSize || 24;
    const fontFamilyVal = obj.fontFamily || "Arial";
    const fontWeight = obj.fontWeight || "normal";
    const fontStyle = obj.fontStyle || "normal";
    const fill = obj.fill || "#000000";
    const objLeft = obj.left || 0;
    const objTop = obj.top || 0;

    // Measure the X offset of the selected text by measuring the "before" portion
    // Create a temporary canvas to measure text width
    const measureCanvas = document.createElement("canvas");
    const mCtx = measureCanvas.getContext("2d");
    let beforeWidth = 0;
    if (mCtx) {
      const style = `${fontWeight === "bold" ? "bold " : ""}${fontStyle === "italic" ? "italic " : ""}${fontSize}px ${fontFamilyVal}`;
      mCtx.font = style;
      beforeWidth = mCtx.measureText(beforeText).width;
    }

    // Exit editing mode on the original
    obj.exitEditing();

    // Update the original object: remove the selected portion
    const remaining = beforeText + afterText;
    if (remaining.trim()) {
      obj.set({ text: remaining });
    } else {
      canvas.remove(obj);
    }

    // Create the new editable text at the correct position
    const newText = new IText(selectedText, {
      left: objLeft + beforeWidth,
      top: objTop,
      fontSize,
      fontFamily: fontFamilyVal,
      fontWeight,
      fontStyle,
      fill,
      editable: true,
      padding: 4,
      originX: "left",
      originY: "top",
    });
    (newText as any).locked = false;
    (newText as any).editable = true;
    (newText as any).name = "editable_text";
    (newText as any)._fontSizePt = obj._fontSizePt;
    newText.set({
      borderColor: "#3b82f6",
      cornerColor: "#3b82f6",
      cornerStyle: "circle",
      transparentCorners: false,
    } as any);

    canvas.add(newText);
    canvas.setActiveObject(newText);
    canvas.renderAll();
    syncCanvas();
    toast.success(`Split "${selectedText}" into a separate editable text`);
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

  const isTextObject = (() => {
    if (!selectedObject) return false;
    const t = (selectedObject as any).type;
    if (t === "i-text" || t === "textbox" || t === "text") return true;
    // Multi-selection: show text toolbar if any selected object is text
    if (t === "activeselection" || t === "activeSelection") {
      return ((selectedObject as any).getObjects?.() || []).some((o: any) =>
        o.type === "i-text" || o.type === "textbox" || o.type === "text"
      );
    }
    return false;
  })();

  // Perf line measurement (relative to trim box). Recomputes on perfTick (drag) and selection change.
  const perfInfo = useMemo(() => {
    const obj: any = activePerfRef.current;
    if (!obj) return null;
    const isPerf = obj.name === PERF_LINE_NAME || obj.name === "_perfDraft";
    if (!isPerf) return null;
    const x1 = obj.x1 ?? 0, y1 = obj.y1 ?? 0, x2 = obj.x2 ?? 0, y2 = obj.y2 ?? 0;
    const left = obj.left ?? 0;
    const top = obj.top ?? 0;
    const rect = obj.getBoundingRect ? obj.getBoundingRect(true, true) : { left, top, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    const isHorizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
    const trimTop = bleedPx;
    const trimBottom = canvasHeight - bleedPx;
    const trimLeft = bleedPx;
    const trimRight = canvasWidth - bleedPx;
    if (isHorizontal) {
      const yMid = rect.top + rect.height / 2;
      const fromTop = Math.max(0, (yMid - trimTop) / DPI);
      const fromBottom = Math.max(0, (trimBottom - yMid) / DPI);
      // overlay position in CSS pixels
      const cssY = yMid * displayScale;
      return { orientation: "h" as const, fromTop, fromBottom, cssY, cssX: 0 };
    } else {
      const xMid = rect.left + rect.width / 2;
      const fromLeft = Math.max(0, (xMid - trimLeft) / DPI);
      const fromRight = Math.max(0, (trimRight - xMid) / DPI);
      const cssX = xMid * displayScale;
      return { orientation: "v" as const, fromTop: fromLeft, fromBottom: fromRight, cssX, cssY: 0 };
    }
  }, [perfTick, bleedPx, canvasHeight, canvasWidth, displayScale]);



  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border flex-wrap">
        {/* Undo / Redo - admin only */}
        {mode === "edit" && (
          <>
            <Button size="sm" variant="ghost" onClick={undo} className="h-8 w-8 p-0" title="Undo (Ctrl+Z)">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={redo} className="h-8 w-8 p-0" title="Redo (Ctrl+Y)">
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
          </>
        )}
        {mode === "use" && (
          <>
            <span className="text-xs text-muted-foreground px-2">Click a highlighted field to edit</span>
            <div className="w-px h-6 bg-border mx-1" />
            <Button size="sm" variant="outline" onClick={addPdfArtwork} className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span className="text-xs">Upload Art (PDF)</span>
            </Button>
          </>
        )}
        {mode === "edit" && (
          <>
            {/* ── Text ── */}
            <Popover open={openCat === "text"} onOpenChange={(o) => setOpenCat(o ? "text" : null)}>
              <PopoverTrigger asChild>
                <Button size="sm" variant={drawTextMode !== "off" ? "default" : "outline"} className="gap-1.5">
                  <Type className="h-3.5 w-3.5" /><span className="text-xs">Text</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-52 p-1.5 space-y-1">
                <Button size="sm" variant={drawTextMode === "editable" ? "default" : "ghost"} className="w-full justify-start gap-2"
                  onClick={() => { drawTextMode === "editable" ? endDrawText() : startDrawText("editable"); setOpenCat(null); }}>
                  <Type className="h-3.5 w-3.5" /> Draw editable text
                </Button>
                <Button size="sm" variant={drawTextMode === "locked" ? "default" : "ghost"} className="w-full justify-start gap-2"
                  onClick={() => { drawTextMode === "locked" ? endDrawText() : startDrawText("locked"); setOpenCat(null); }}>
                  <Lock className="h-3.5 w-3.5" /> Draw locked text
                </Button>
              </PopoverContent>
            </Popover>

            {/* ── Shapes ── */}
            <Popover open={openCat === "shapes"} onOpenChange={(o) => setOpenCat(o ? "shapes" : null)}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Shapes className="h-3.5 w-3.5" /><span className="text-xs">Shapes</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-52 p-2">
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { k: "rect", label: "Rect", Icon: Square },
                    { k: "roundRect", label: "Round", Icon: Square },
                    { k: "circle", label: "Circle", Icon: Circle },
                    { k: "ellipse", label: "Ellipse", Icon: Circle },
                    { k: "triangle", label: "Triangle", Icon: Triangle },
                    { k: "line", label: "Line", Icon: Minus },
                    { k: "star", label: "Star", Icon: Star },
                    { k: "hexagon", label: "Hexagon", Icon: Hexagon },
                  ].map(({ k, label, Icon }) => (
                    <Button key={k} size="sm" variant="ghost" className="h-12 flex-col gap-0.5 p-1" title={label}
                      onClick={() => { addShape(k); setOpenCat(null); }}>
                      <Icon className="h-4 w-4" />
                      <span className="text-[9px] leading-none">{label}</span>
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* ── Images ── */}
            <Popover open={openCat === "images"} onOpenChange={(o) => setOpenCat(o ? "images" : null)}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /><span className="text-xs">Images</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-52 p-1.5 space-y-1">
                <Button size="sm" variant="ghost" className="w-full justify-start gap-2" onClick={() => { addArtworkImage(true); setOpenCat(null); }}>
                  <Upload className="h-3.5 w-3.5" /> Add image (editable)
                </Button>
                <Button size="sm" variant="ghost" className="w-full justify-start gap-2" onClick={() => { addArtworkImage(false); setOpenCat(null); }}>
                  <Upload className="h-3.5 w-3.5" /> Add image (locked)
                </Button>
                <Button size="sm" variant="ghost" className="w-full justify-start gap-2" onClick={() => { addPdfArtwork(); setOpenCat(null); }}>
                  <FileText className="h-3.5 w-3.5" /> Add PDF artwork
                </Button>
                <Button size="sm" variant="ghost" className="w-full justify-start gap-2" onClick={() => { importSvg(); setOpenCat(null); }}>
                  <Layers className="h-3.5 w-3.5" /> Import SVG (layers)
                </Button>
                <div className="h-px bg-border my-1" />
                <Button size="sm" variant="ghost" className="w-full justify-start gap-2" onClick={() => { addBackgroundImage(); setOpenCat(null); }}>
                  <ImageIcon className="h-3.5 w-3.5" /> Set image background
                </Button>
                <Button size="sm" variant="ghost" className="w-full justify-start gap-2" onClick={() => { addPdfBackground(); setOpenCat(null); }}>
                  <FileText className="h-3.5 w-3.5" /> Set PDF background
                </Button>
              </PopoverContent>
            </Popover>

            {/* ── AI (demoted from top-level into one group) ── */}
            <Popover open={openCat === "ai"} onOpenChange={(o) => setOpenCat(o ? "ai" : null)}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /><span className="text-xs">AI</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1.5 space-y-1 flex flex-col items-stretch">
                <AiImageDialog onImageGenerated={(dataUrl) => addImageFromDataUrl(dataUrl, true)} />
                <AiEditDialog getCanvasImage={getCanvasImage} onImageGenerated={(dataUrl) => addImageFromDataUrl(dataUrl, true)} />
                <AiCleanupDialog onImageGenerated={(dataUrl) => addImageFromDataUrl(dataUrl, true)} />
                <IconPickerDialog onIconSelected={(dataUrl) => addImageFromDataUrl(dataUrl, true)} />
              </PopoverContent>
            </Popover>

            {/* ── Dieline ── */}
            <Popover open={openCat === "dieline"} onOpenChange={(o) => setOpenCat(o ? "dieline" : null)}>
              <PopoverTrigger asChild>
                <Button size="sm" variant={drawMaskMode || drawPerfMode ? "default" : "outline"} className="gap-1.5">
                  <Scissors className="h-3.5 w-3.5" /><span className="text-xs">Dieline</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-52 p-1.5 space-y-1">
                <Button size="sm" variant="ghost" className="w-full justify-start gap-2"
                  onClick={() => { addHorizontalPerf(); setOpenCat(null); }}>
                  <Scissors className="h-3.5 w-3.5" /> Horizontal perf
                </Button>
                <Button size="sm" variant={drawPerfMode ? "default" : "ghost"} className="w-full justify-start gap-2"
                  onClick={() => { drawPerfMode ? endDrawPerf() : startDrawPerf(); setOpenCat(null); }}>
                  <Scissors className="h-3.5 w-3.5" /> Perf line (draw)
                </Button>
                <Button size="sm" variant={drawMaskMode ? "default" : "ghost"} className="w-full justify-start gap-2"
                  onClick={() => { drawMaskMode ? endDrawMask() : startDrawMask(); setOpenCat(null); }}>
                  <Square className="h-3.5 w-3.5" /> Mask area
                </Button>
              </PopoverContent>
            </Popover>

            {/* ── Extract ── */}
            <Popover open={openCat === "extract"} onOpenChange={(o) => setOpenCat(o ? "extract" : null)}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Scan className="h-3.5 w-3.5" /><span className="text-xs">Extract</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-60 p-2 space-y-1.5">
                <p className="text-[11px] text-muted-foreground px-1">Extracted text becomes…</p>
                <div className="flex gap-1">
                  <Button size="sm" variant={zoneExtractLocked ? "outline" : "default"} className="flex-1 gap-1" onClick={() => setZoneExtractLocked(false)} disabled={extractingText}>
                    <Unlock className="h-3 w-3" /><span className="text-[10px]">Editable</span>
                  </Button>
                  <Button size="sm" variant={zoneExtractLocked ? "default" : "outline"} className="flex-1 gap-1" onClick={() => setZoneExtractLocked(true)} disabled={extractingText}>
                    <Lock className="h-3 w-3" /><span className="text-[10px]">Locked</span>
                  </Button>
                </div>
                <div className="h-px bg-border my-1" />
                <Button size="sm" variant={zoneSelectMode ? "destructive" : "ghost"} className="w-full justify-start gap-2" disabled={extractingText}
                  onClick={() => { zoneSelectMode ? endZoneSelect() : startZoneSelect(); setOpenCat(null); }}>
                  {extractingText ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scan className="h-3.5 w-3.5" />}
                  {extractingText ? "Extracting…" : zoneSelectMode ? "Cancel area select" : "Extract from area"}
                </Button>
                <Button size="sm" variant="ghost" className="w-full justify-start gap-2" disabled={extractingVector}
                  onClick={() => { extractPdfVectorText(); setOpenCat(null); }}>
                  {extractingVector ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Type className="h-3.5 w-3.5" />}
                  {extractingVector ? "Extracting…" : "Extract PDF text (real)"}
                </Button>
                <Button size="sm" variant="ghost" className="w-full justify-start gap-2" disabled={extractingAll}
                  onClick={() => { extractAllText(); setOpenCat(null); }}>
                  {extractingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  {extractingAll ? "Analyzing…" : "Extract all text (AI)"}
                </Button>
              </PopoverContent>
            </Popover>

            <div className="w-px h-6 bg-border mx-1" />
          </>
        )}

        {/* Select to Edit - admin only */}
        {mode === "edit" && (
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

        {selectedObject && isTextObject && mode === "edit" && (
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
            <div className="w-px h-6 bg-border mx-1" />
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={splitSelectedText} className="h-8 gap-1.5">
                    <Scissors className="h-3.5 w-3.5" />
                    <span className="text-xs">Split</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Select text inside the box, then click Split to make it a separate editable element</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}

        {/* Alignment buttons — admin only */}
        {selectedObject && mode === "edit" && (
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
            <Button
              size="sm"
              variant={selectedLockedState ? "outline" : "default"}
              onClick={() => setSelectionLockedState(false)}
              className="h-8 gap-1.5"
            >
              <Unlock className="h-3.5 w-3.5" /><span className="text-xs">Editable</span>
            </Button>
            <Button
              size="sm"
              variant={selectedLockedState ? "default" : "outline"}
              onClick={() => setSelectionLockedState(true)}
              className="h-8 gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" /><span className="text-xs">Locked</span>
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
      {drawMaskMode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          <Square className="h-4 w-4" />
          <span>Click and drag on the canvas to draw a white mask over unwanted areas</span>
          <Button size="sm" variant="ghost" onClick={endDrawMask} className="ml-auto h-6 px-2 text-xs">Cancel</Button>
        </div>
      )}
      {unlockZoneMode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30 text-sm text-primary">
          <Unlock className="h-4 w-4" />
          <span>Draw a box around locked text to make it editable</span>
          <Button size="sm" variant="ghost" onClick={endUnlockZone} className="ml-auto h-6 px-2 text-xs">Cancel</Button>
        </div>
      )}
      {drawPerfMode && (
        <div
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] w-fit"
          style={{ background: "rgba(22,163,74,0.08)", borderColor: "rgba(22,163,74,0.35)", color: PERF_COLOR }}
        >
          <Scissors className="h-3 w-3" />
          <span>Drag to add a perf line (snaps H/V)</span>
          <Button size="sm" variant="ghost" onClick={endDrawPerf} className="ml-1 h-5 px-1.5 text-[10px]">Cancel</Button>
        </div>
      )}

      <div ref={measureRef} className="max-w-full">
        <div ref={containerRef} className="border border-border rounded-lg overflow-auto bg-muted/30 p-4 flex justify-center max-w-full">
        <div className="relative shadow-lg shrink-0" style={{ width: cssWidth, height: cssHeight }}>
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

          {/* Perf line measurement overlay (relative to trim) */}
          {perfInfo && perfInfo.orientation === "h" && (
            <>
              <div
                className="pointer-events-none absolute z-30 left-0 right-0 flex justify-end pr-1"
                style={{ top: Math.max(0, perfInfo.cssY - 18) }}
              >
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shadow-sm"
                  style={{ background: PERF_COLOR, color: "white" }}
                >
                  <Scissors className="h-2.5 w-2.5" />
                  {perfInfo.fromTop.toFixed(3)}" from top · {perfInfo.fromBottom.toFixed(3)}" from bottom
                </span>
              </div>
            </>
          )}
          {perfInfo && perfInfo.orientation === "v" && (
            <div
              className="pointer-events-none absolute z-30 top-0 bottom-0 flex items-start pt-1"
              style={{ left: Math.max(0, perfInfo.cssX + 4) }}
            >
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shadow-sm"
                style={{ background: PERF_COLOR, color: "white" }}
              >
                <Scissors className="h-2.5 w-2.5" />
                {perfInfo.fromTop.toFixed(3)}" from left · {perfInfo.fromBottom.toFixed(3)}" from right
              </span>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Objects panel + Dimensions info */}
      <div className="flex items-start gap-4">
        {mode === "edit" && (
          <div className="flex-1">
            <CanvasObjectsPanel canvas={fabricRef.current} onSync={syncCanvas} />
          </div>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 flex-wrap">
          <span>{effectiveWidth.toFixed(1)}" × {effectiveHeight.toFixed(1)}" {productType}{depth > 0 ? ` (${width}×${height}×${depth})` : ""} · canvas:{canvasWidth}×{canvasHeight} · scale:{displayScale.toFixed(3)}</span>
          <span>{bleed}" bleed</span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 border-t border-dashed border-destructive inline-block" />
            Trim line
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 inline-block" style={{ borderTop: `1.5px dashed ${PERF_COLOR}` }} />
            Perf line
          </span>
          {dielineResult && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 inline-block" style={{ borderTop: "1.5px dashed #d32f2f" }} />
                Fold line
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 inline-block" style={{ borderTop: "2px solid #1976d2" }} />
                Cut line
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

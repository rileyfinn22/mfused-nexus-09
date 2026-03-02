/**
 * Hybrid PDF Export — merges the original vector PDF with Fabric.js overlay objects.
 *
 * Text objects are rendered as native jsPDF vector text when using standard fonts,
 * otherwise they're rasterized at 300 DPI and embedded as images.
 * Image objects are always embedded as high-res images.
 */

import jsPDF from "jspdf";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";

// Reuse the same worker setup as pdfThumbnail
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const EXPORT_DPI = 600;

/** Map Fabric.js font families to jsPDF built-in fonts */
const JSPDF_FONT_MAP: Record<string, string> = {
  Arial: "helvetica",
  Helvetica: "helvetica",
  "Times New Roman": "times",
  "Courier New": "courier",
  Georgia: "times",
};

interface ExportOptions {
  sourcePdfPath: string;
  canvasData: any;
  widthInches: number;
  heightInches: number;
  bleedInches: number;
}

/**
 * Fetch the original PDF from storage and return as ArrayBuffer.
 */
async function fetchSourcePdf(path: string): Promise<ArrayBuffer> {
  const { data } = supabase.storage.from("print-files").getPublicUrl(path);
  const resp = await fetch(data.publicUrl);
  if (!resp.ok) throw new Error(`Failed to fetch source PDF: ${resp.statusText}`);
  return resp.arrayBuffer();
}

/**
 * Render the first page of a PDF at a target DPI onto a canvas, returning the image data.
 */
async function renderPdfPage(
  pdfData: ArrayBuffer,
  pageWidthInches: number,
  pageHeightInches: number,
  dpi: number
): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
  const page = await pdf.getPage(1);

  const targetWidthPx = Math.round(pageWidthInches * dpi);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidthPx / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;

  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return canvas.toDataURL("image/png");
}

/**
 * Generate a print-ready PDF by compositing the source PDF with Fabric.js overlays.
 */
export async function generatePrintReadyPdf(options: ExportOptions): Promise<Blob> {
  const { sourcePdfPath, canvasData, widthInches, heightInches, bleedInches } = options;

  const totalW = widthInches + bleedInches * 2;
  const totalH = heightInches + bleedInches * 2;

  // Create jsPDF document with exact page size in inches
  const orientation = totalW > totalH ? "landscape" : "portrait";
  const doc = new jsPDF({
    orientation,
    unit: "in",
    format: [totalW, totalH],
  });

  // 1. Render the source PDF as the base layer at 300 DPI
  const pdfData = await fetchSourcePdf(sourcePdfPath);
  const bgDataUrl = await renderPdfPage(pdfData, totalW, totalH, EXPORT_DPI);
  doc.addImage(bgDataUrl, "PNG", 0, 0, totalW, totalH, undefined, "NONE");

  // 2. Internal DPI used by the Fabric.js canvas (must match TemplateEditor)
  const CANVAS_DPI = 150;
  const canvasBleedPx = Math.round(bleedInches * CANVAS_DPI);

  // 3. Overlay Fabric.js objects
  const objects: any[] = canvasData?.objects || [];
  for (const obj of objects) {
    if (obj?.visible === false) continue;

    const objectType = String(obj?.type || "").toLowerCase();

    // Skip trim guide and background image
    if (obj?.name === "_trimGuide") continue;
    if (objectType === "image" && obj.left === 0 && obj.top === 0) continue;

    // Convert canvas px position to inches
    const xIn = (obj.left ?? 0) / CANVAS_DPI;
    const yIn = (obj.top ?? 0) / CANVAS_DPI;

    if (objectType === "itext" || objectType === "textbox" || objectType === "text") {
      const fontSizePx = obj.fontSize || 24;
      const scaleY = obj.scaleY || 1;
      const fontSizePt = ((fontSizePx * scaleY) * 72) / CANVAS_DPI;

      const jspdfFont = JSPDF_FONT_MAP[obj.fontFamily];
      if (jspdfFont) {
        const style =
          obj.fontWeight === "bold" && obj.fontStyle === "italic"
            ? "bolditalic"
            : obj.fontWeight === "bold"
              ? "bold"
              : obj.fontStyle === "italic"
                ? "italic"
                : "normal";

        doc.setFont(jspdfFont, style);
        doc.setFontSize(fontSizePt);

        const { r, g, b } = parseColor(obj.fill);
        doc.setTextColor(r, g, b);

        const textLines = String(obj.text || "").split("\n");
        const baselineY = yIn + (fontSizePt / 72) * 0.82;
        doc.text(textLines, xIn, baselineY);
      } else {
        // Non-standard font: rasterize at high DPI to preserve appearance
        const textCanvas = renderTextToCanvas(obj, CANVAS_DPI, EXPORT_DPI);
        const textDataUrl = textCanvas.toDataURL("image/png");
        const wIn = textCanvas.width / EXPORT_DPI;
        const hIn = textCanvas.height / EXPORT_DPI;
        doc.addImage(textDataUrl, "PNG", xIn, yIn, wIn, hIn, undefined, "NONE");
      }
    } else if (objectType === "image") {
      if (obj.src) {
        const scaleX = obj.scaleX || 1;
        const scaleY = obj.scaleY || 1;
        const wIn = ((obj.width || 100) * scaleX) / CANVAS_DPI;
        const hIn = ((obj.height || 100) * scaleY) / CANVAS_DPI;
        try {
          doc.addImage(obj.src, "PNG", xIn, yIn, wIn, hIn, undefined, "NONE");
        } catch {
          console.warn("Could not embed image in PDF export", obj.name);
        }
      }
    }
  }

  // 4. Add crop marks
  addCropMarks(doc, totalW, totalH, bleedInches);

  return doc.output("blob");
}

/**
 * Parse Fabric fill color values (#hex or rgb()) into RGB tuple.
 */
function parseColor(fill: string | undefined): { r: number; g: number; b: number } {
  if (!fill) return { r: 0, g: 0, b: 0 };

  if (fill.startsWith("#")) {
    const hex = fill.length === 4
      ? `#${fill[1]}${fill[1]}${fill[2]}${fill[2]}${fill[3]}${fill[3]}`
      : fill;
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return { r, g, b };
    }
  }

  const rgbMatch = fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: Number.parseInt(rgbMatch[1], 10),
      g: Number.parseInt(rgbMatch[2], 10),
      b: Number.parseInt(rgbMatch[3], 10),
    };
  }

  return { r: 0, g: 0, b: 0 };
}

/**
 * Rasterize a text object to a high-res canvas for embedding in the PDF.
 */
function renderTextToCanvas(obj: any, canvasDpi: number, exportDpi: number): HTMLCanvasElement {
  const scale = exportDpi / canvasDpi;
  const fontSizePx = (obj.fontSize || 24) * scale;
  const text: string = obj.text || "";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const weight = obj.fontWeight === "bold" ? "bold" : "normal";
  const style = obj.fontStyle === "italic" ? "italic" : "normal";
  const font = `${style} ${weight} ${fontSizePx}px "${obj.fontFamily || "Arial"}"`;
  ctx.font = font;

  const metrics = ctx.measureText(text);
  const width = Math.ceil(metrics.width) + 4;
  const height = Math.ceil(fontSizePx * 1.3) + 4;

  canvas.width = width;
  canvas.height = height;

  ctx.font = font;
  ctx.fillStyle = obj.fill || "#000000";
  ctx.textBaseline = "top";
  ctx.fillText(text, 2, 2);

  return canvas;
}

/**
 * Draw crop marks at the corners of the trim area.
 */
function addCropMarks(doc: jsPDF, totalW: number, totalH: number, bleed: number) {
  const markLen = 0.15; // inches
  const offset = 0.02;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.005);

  const corners = [
    { x: bleed, y: bleed },
    { x: totalW - bleed, y: bleed },
    { x: bleed, y: totalH - bleed },
    { x: totalW - bleed, y: totalH - bleed },
  ];

  for (const c of corners) {
    // Horizontal marks
    const hDir = c.x <= totalW / 2 ? -1 : 1;
    doc.line(c.x + hDir * offset, c.y, c.x + hDir * (offset + markLen), c.y);
    // Vertical marks
    const vDir = c.y <= totalH / 2 ? -1 : 1;
    doc.line(c.x, c.y + vDir * offset, c.x, c.y + vDir * (offset + markLen));
  }
}

/**
 * Generate a print-ready PDF from canvas data only (no source PDF).
 * Rasterizes the Fabric.js canvas at high DPI.
 */
export async function generateCanvasOnlyPdf(options: Omit<ExportOptions, "sourcePdfPath">): Promise<Blob> {
  const { canvasData, widthInches, heightInches, bleedInches } = options;

  const totalW = widthInches + bleedInches * 2;
  const totalH = heightInches + bleedInches * 2;

  const orientation = totalW > totalH ? "landscape" : "portrait";
  const doc = new jsPDF({
    orientation,
    unit: "in",
    format: [totalW, totalH],
  });

  const CANVAS_DPI = 150;

  // Overlay Fabric.js objects
  const objects: any[] = canvasData?.objects || [];
  for (const obj of objects) {
    if (obj?.visible === false) continue;
    const objectType = String(obj?.type || "").toLowerCase();
    if (obj?.name === "_trimGuide") continue;

    const xIn = (obj.left ?? 0) / CANVAS_DPI;
    const yIn = (obj.top ?? 0) / CANVAS_DPI;

    if (objectType === "itext" || objectType === "textbox" || objectType === "text") {
      const fontSizePx = obj.fontSize || 24;
      const scaleY = obj.scaleY || 1;
      const fontSizePt = ((fontSizePx * scaleY) * 72) / CANVAS_DPI;

      const jspdfFont = JSPDF_FONT_MAP[obj.fontFamily];
      if (jspdfFont) {
        const style =
          obj.fontWeight === "bold" && obj.fontStyle === "italic"
            ? "bolditalic"
            : obj.fontWeight === "bold"
              ? "bold"
              : obj.fontStyle === "italic"
                ? "italic"
                : "normal";
        doc.setFont(jspdfFont, style);
        doc.setFontSize(fontSizePt);
        const { r, g, b } = parseColor(obj.fill);
        doc.setTextColor(r, g, b);
        const textLines = String(obj.text || "").split("\n");
        const baselineY = yIn + (fontSizePt / 72) * 0.82;
        doc.text(textLines, xIn, baselineY);
      } else {
        const textCanvas = renderTextToCanvas(obj, CANVAS_DPI, EXPORT_DPI);
        const textDataUrl = textCanvas.toDataURL("image/png");
        const wIn = textCanvas.width / EXPORT_DPI;
        const hIn = textCanvas.height / EXPORT_DPI;
        doc.addImage(textDataUrl, "PNG", xIn, yIn, wIn, hIn, undefined, "NONE");
      }
    } else if (objectType === "image") {
      if (obj.src) {
        const scaleX = obj.scaleX || 1;
        const scaleY = obj.scaleY || 1;
        const wIn = ((obj.width || 100) * scaleX) / CANVAS_DPI;
        const hIn = ((obj.height || 100) * scaleY) / CANVAS_DPI;
        try {
          doc.addImage(obj.src, "PNG", xIn, yIn, wIn, hIn, undefined, "NONE");
        } catch {
          console.warn("Could not embed image in PDF export", obj.name);
        }
      }
    }
  }

  addCropMarks(doc, totalW, totalH, bleedInches);
  return doc.output("blob");
}

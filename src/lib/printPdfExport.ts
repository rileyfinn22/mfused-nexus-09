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

interface RenderedPdfBaseLayer {
  dataUrl: string;
  xInches: number;
  yInches: number;
  widthInches: number;
  heightInches: number;
}

/**
 * Render the first PDF page and return a positioned base layer that matches
 * TemplateEditor preview behavior (crop/fill/trim alignment).
 */
async function renderPdfPage(
  pdfData: ArrayBuffer,
  templateTotalWidthInches: number,
  templateTotalHeightInches: number,
  trimWidthInches: number,
  trimHeightInches: number,
  bleedInches: number,
  dpi: number
): Promise<RenderedPdfBaseLayer> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
  const page = await pdf.getPage(1);

  const baseViewport = page.getViewport({ scale: 1 });
  const pdfPageWidthInches = baseViewport.width / 72;
  const pdfPageHeightInches = baseViewport.height / 72;

  // Render at physical print density so 1" in PDF = `dpi` pixels
  const renderScale = dpi / 72;
  const viewport = page.getViewport({ scale: renderScale });

  const renderedCanvas = document.createElement("canvas");
  renderedCanvas.width = Math.max(1, Math.round(viewport.width));
  renderedCanvas.height = Math.max(1, Math.round(viewport.height));
  const renderedCtx = renderedCanvas.getContext("2d")!;

  await page.render({ canvasContext: renderedCtx, viewport, canvas: renderedCanvas } as any).promise;

  const toleranceInches = 0.05;
  const isLargerThanTemplate =
    pdfPageWidthInches > templateTotalWidthInches + toleranceInches ||
    pdfPageHeightInches > templateTotalHeightInches + toleranceInches;

  const matchesTrimArea =
    Math.abs(pdfPageWidthInches - trimWidthInches) <= toleranceInches &&
    Math.abs(pdfPageHeightInches - trimHeightInches) <= toleranceInches;

  // Case 1: source page is larger than template -> crop centered template area (matches preview)
  if (isLargerThanTemplate) {
    const targetWidthPx = Math.max(1, Math.round(templateTotalWidthInches * dpi));
    const targetHeightPx = Math.max(1, Math.round(templateTotalHeightInches * dpi));

    const cropWidthPx = Math.min(targetWidthPx, renderedCanvas.width);
    const cropHeightPx = Math.min(targetHeightPx, renderedCanvas.height);
    const cropLeftPx = Math.max(0, Math.round((renderedCanvas.width - cropWidthPx) / 2));
    const cropTopPx = Math.max(0, Math.round((renderedCanvas.height - cropHeightPx) / 2));

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = targetWidthPx;
    croppedCanvas.height = targetHeightPx;
    const croppedCtx = croppedCanvas.getContext("2d")!;

    croppedCtx.drawImage(
      renderedCanvas,
      cropLeftPx,
      cropTopPx,
      cropWidthPx,
      cropHeightPx,
      0,
      0,
      targetWidthPx,
      targetHeightPx
    );

    return {
      dataUrl: croppedCanvas.toDataURL("image/png"),
      xInches: 0,
      yInches: 0,
      widthInches: templateTotalWidthInches,
      heightInches: templateTotalHeightInches,
    };
  }

  // Case 2: source page matches trim size -> place inside trim area with bleed margins (matches preview)
  if (matchesTrimArea) {
    return {
      dataUrl: renderedCanvas.toDataURL("image/png"),
      xInches: bleedInches,
      yInches: bleedInches,
      widthInches: trimWidthInches,
      heightInches: trimHeightInches,
    };
  }

  // Case 3: standard fit/center into full template area (matches preview default)
  const fitScale = Math.min(
    templateTotalWidthInches / pdfPageWidthInches,
    templateTotalHeightInches / pdfPageHeightInches
  );
  const drawWidthInches = pdfPageWidthInches * fitScale;
  const drawHeightInches = pdfPageHeightInches * fitScale;

  return {
    dataUrl: renderedCanvas.toDataURL("image/png"),
    xInches: (templateTotalWidthInches - drawWidthInches) / 2,
    yInches: (templateTotalHeightInches - drawHeightInches) / 2,
    widthInches: drawWidthInches,
    heightInches: drawHeightInches,
  };
}

/**
 * Keep only user-visible layers for export.
 * Note: _ocrKnockout must be preserved because it hides original PDF text
 * and is visible in preview output.
 */
function shouldSkipExportObject(objName: string): boolean {
  if (objName === "_trimGuide") return true;
  if (objName === "_snapGuide") return true;
  if (objName === "pdf_background") return true;
  if (objName.startsWith("_") && objName !== "_ocrKnockout") return true;
  return false;
}

function drawRectObject(doc: jsPDF, obj: any, canvasDpi: number) {
  const scaleX = obj.scaleX || 1;
  const scaleY = obj.scaleY || 1;
  const xIn = (obj.left ?? 0) / canvasDpi;
  const yIn = (obj.top ?? 0) / canvasDpi;
  const wIn = ((obj.width || 0) * scaleX) / canvasDpi;
  const hIn = ((obj.height || 0) * scaleY) / canvasDpi;

  if (wIn <= 0 || hIn <= 0) return;

  const { r, g, b } = parseColor(typeof obj.fill === "string" ? obj.fill : "#ffffff");
  doc.setFillColor(r, g, b);
  doc.rect(xIn, yIn, wIn, hIn, "F");
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

  // 1. Render the source PDF base layer using the same placement rules as preview
  const pdfData = await fetchSourcePdf(sourcePdfPath);
  const bgLayer = await renderPdfPage(
    pdfData,
    totalW,
    totalH,
    widthInches,
    heightInches,
    bleedInches,
    EXPORT_DPI
  );
  doc.addImage(
    bgLayer.dataUrl,
    "PNG",
    bgLayer.xInches,
    bgLayer.yInches,
    bgLayer.widthInches,
    bgLayer.heightInches,
    undefined,
    "NONE"
  );

  // 2. Internal DPI used by the Fabric.js canvas (must match TemplateEditor)
  const CANVAS_DPI = 150;

  // 3. Overlay Fabric.js objects
  const objects: any[] = canvasData?.objects || [];
  for (const obj of objects) {
    if (obj?.visible === false) continue;

    const objectType = String(obj?.type || "").toLowerCase();
    const objName = String(obj?.name || "");

    if (shouldSkipExportObject(objName)) continue;

    if (objName === "_ocrKnockout" && objectType === "rect") {
      drawRectObject(doc, obj, CANVAS_DPI);
      continue;
    }

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
    const objName = String(obj?.name || "");
    if (shouldSkipExportObject(objName)) continue;

    if (objName === "_ocrKnockout" && objectType === "rect") {
      drawRectObject(doc, obj, CANVAS_DPI);
      continue;
    }

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

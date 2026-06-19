/**
 * Deterministic PDF content extraction (no AI) for print-accurate decomposition.
 *
 * Reads the PDF's real content stream via pdf.js `getOperatorList()` and reconstructs each
 * drawing as its own object at EXACT coordinates:
 *   - vector fills/strokes  → SVG path strings (coords baked into the page→canvas transform)
 *   - placed raster images  → data URLs + an affine matrix (image px → canvas px)
 * Text is handled separately by the editor's real text extractor (pdf.js getTextContent).
 *
 * Coordinate model: we use `page.getViewport({ scale: dpi/72 }).transform` as the base CTM, so
 * a PDF page whose size equals the template maps 1:1 onto the canvas (canvasPx = totalIn*dpi).
 * Path point coords are pushed THROUGH the current CTM at paint time and baked absolute, so the
 * resulting Fabric objects need no further transform — keeping registration exact.
 */
import * as pdfjsLib from "pdfjs-dist";

export interface ExtractedPath {
  kind: "path";
  d: string; // absolute SVG path data, already in canvas px
  fill: string | null;
  stroke: string | null;
  strokeWidth: number; // canvas px
  evenOdd: boolean;
}
export interface ExtractedImage {
  kind: "image";
  dataUrl: string;
  matrix: [number, number, number, number, number, number]; // image px → canvas px
}
export type ExtractedItem = ExtractedPath | ExtractedImage;

export interface PdfExtractResult {
  items: ExtractedItem[];
  pageWidthPx: number;
  pageHeightPx: number;
  truncated: boolean;
}

type Mat = [number, number, number, number, number, number];

const mul = (m1: number[], m2: number[]): Mat => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
const applyPt = (m: number[], x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
const avgScale = (m: number[]) => (Math.hypot(m[0], m[1]) + Math.hypot(m[2], m[3])) / 2;

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** Build an absolute SVG path string by pushing each pdf.js path op through the current CTM. */
function buildAbsolutePath(ops: number[], coords: number[], ctm: number[], OPS: any): string {
  let d = "";
  let j = 0;
  let cx = 0;
  let cy = 0;
  const P = (x: number, y: number) => {
    const [ax, ay] = applyPt(ctm, x, y);
    return `${ax.toFixed(2)} ${ay.toFixed(2)}`;
  };
  for (let k = 0; k < ops.length; k++) {
    switch (ops[k]) {
      case OPS.moveTo: { const x = coords[j++], y = coords[j++]; cx = x; cy = y; d += `M${P(x, y)} `; break; }
      case OPS.lineTo: { const x = coords[j++], y = coords[j++]; cx = x; cy = y; d += `L${P(x, y)} `; break; }
      case OPS.curveTo: {
        const x1 = coords[j++], y1 = coords[j++], x2 = coords[j++], y2 = coords[j++], x3 = coords[j++], y3 = coords[j++];
        d += `C${P(x1, y1)} ${P(x2, y2)} ${P(x3, y3)} `; cx = x3; cy = y3; break;
      }
      case OPS.curveTo2: {
        const x2 = coords[j++], y2 = coords[j++], x3 = coords[j++], y3 = coords[j++];
        d += `C${P(cx, cy)} ${P(x2, y2)} ${P(x3, y3)} `; cx = x3; cy = y3; break;
      }
      case OPS.curveTo3: {
        const x1 = coords[j++], y1 = coords[j++], x3 = coords[j++], y3 = coords[j++];
        d += `C${P(x1, y1)} ${P(x3, y3)} ${P(x3, y3)} `; cx = x3; cy = y3; break;
      }
      case OPS.closePath: d += "Z "; break;
      case OPS.rectangle: {
        const x = coords[j++], y = coords[j++], w = coords[j++], h = coords[j++];
        d += `M${P(x, y)} L${P(x + w, y)} L${P(x + w, y + h)} L${P(x, y + h)} Z `; cx = x; cy = y; break;
      }
      default: break;
    }
  }
  return d;
}

/** Convert a pdf.js image object (ImageBitmap or raw kind data) to a PNG data URL. */
function imageToDataUrl(img: any): { url: string; w: number; h: number } | null {
  if (!img) return null;
  const w = img.width, h = img.height;
  if (!w || !h) return null;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
  } else if (img.data) {
    const id = ctx.createImageData(w, h);
    const data: Uint8ClampedArray | Uint8Array = img.data;
    const n = w * h;
    if (data.length === n * 4) {
      id.data.set(data);
    } else if (data.length === n * 3) {
      for (let p = 0, q = 0; p < n * 4; p += 4, q += 3) { id.data[p] = data[q]; id.data[p + 1] = data[q + 1]; id.data[p + 2] = data[q + 2]; id.data[p + 3] = 255; }
    } else if (data.length === n) {
      for (let p = 0, q = 0; p < n * 4; p += 4, q++) { id.data[p] = id.data[p + 1] = id.data[p + 2] = data[q]; id.data[p + 3] = 255; }
    } else {
      return null;
    }
    ctx.putImageData(id, 0, 0);
  } else {
    return null;
  }
  return { url: c.toDataURL("image/png"), w, h };
}

const MAX_ITEMS = 4000;

export async function extractPdfContent(
  buf: ArrayBuffer,
  dpi: number,
  fitRect?: { left: number; top: number; width: number; height: number },
): Promise<PdfExtractResult> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: dpi / 72 });
  // Map the page onto the SAME on-canvas rectangle the pdf_background occupies, so extracted
  // vectors/images register exactly with the background (and with the text extractor, which also
  // maps to that rect). Without a fitRect, content lands at natural dpi from the origin.
  const base: number[] = fitRect
    ? mul(
        [fitRect.width / (viewport.width || 1), 0, 0, fitRect.height / (viewport.height || 1), fitRect.left, fitRect.top],
        viewport.transform as number[],
      )
    : (viewport.transform as number[]);
  const opList = await page.getOperatorList();
  const OPS: any = (pdfjsLib as any).OPS;

  let ctm: number[] = base.slice();
  const stack: number[][] = [];
  let fill: string | null = "#000000";
  let stroke: string | null = "#000000";
  let lineWidth = 1;
  let pendingOps: number[] | null = null;
  let pendingCoords: number[] | null = null;
  let pendingCtm: number[] = ctm;

  const items: ExtractedItem[] = [];
  let truncated = false;

  const fns = opList.fnArray;
  const argsArr = opList.argsArray;

  const flushFill = (eo: boolean, withStroke: boolean) => {
    if (!pendingOps || !pendingCoords) return;
    const d = buildAbsolutePath(pendingOps, pendingCoords, pendingCtm, OPS);
    if (d.trim()) {
      items.push({
        kind: "path", d,
        fill: fill,
        stroke: withStroke ? stroke : null,
        strokeWidth: withStroke ? Math.max(0.2, lineWidth * avgScale(pendingCtm)) : 0,
        evenOdd: eo,
      });
    }
    pendingOps = null; pendingCoords = null;
  };
  const flushStroke = () => {
    if (!pendingOps || !pendingCoords) return;
    const d = buildAbsolutePath(pendingOps, pendingCoords, pendingCtm, OPS);
    if (d.trim()) {
      items.push({ kind: "path", d, fill: null, stroke, strokeWidth: Math.max(0.2, lineWidth * avgScale(pendingCtm)), evenOdd: false });
    }
    pendingOps = null; pendingCoords = null;
  };

  for (let i = 0; i < fns.length && items.length < MAX_ITEMS; i++) {
    const fn = fns[i];
    const a = argsArr[i];
    switch (fn) {
      case OPS.save: stack.push(ctm.slice()); break;
      case OPS.restore: ctm = stack.pop() || ctm; break;
      case OPS.transform: ctm = mul(ctm, a as number[]); break;
      case OPS.setLineWidth: lineWidth = a[0] || lineWidth; break;
      case OPS.setFillRGBColor: fill = toHex(a[0], a[1], a[2]); break;
      case OPS.setStrokeRGBColor: stroke = toHex(a[0], a[1], a[2]); break;
      case OPS.constructPath:
        // Accumulate the path + the CTM in effect when it was constructed (painted next).
        pendingOps = a[0] as number[];
        pendingCoords = a[1] as number[];
        pendingCtm = ctm.slice();
        break;
      case OPS.fill: case OPS.eoFill:
        flushFill(fn === OPS.eoFill, false); break;
      case OPS.stroke:
        flushStroke(); break;
      case OPS.fillStroke: case OPS.eoFillStroke:
        flushFill(fn === OPS.eoFillStroke, true); break;
      case OPS.endPath:
        pendingOps = null; pendingCoords = null; break;
      case OPS.paintImageXObject:
      case OPS.paintJpegXObject:
      case OPS.paintImageXObjectRepeat: {
        try {
          const objId = a[0];
          const img = objId && (page.objs.has?.(objId) ?? true) ? page.objs.get(objId) : null;
          const du = imageToDataUrl(img);
          if (du) {
            // The image is painted into the unit square, flipped vertically: imgPx→canvas =
            // ctm × [1/w, 0, 0, -1/h, 0, 1].
            const m = mul(ctm, [1 / du.w, 0, 0, -1 / du.h, 0, 1]);
            items.push({ kind: "image", dataUrl: du.url, matrix: m });
          }
        } catch {
          // image not resolvable — skip
        }
        break;
      }
      default: break;
    }
  }

  if (items.length >= MAX_ITEMS) truncated = true;
  return { items, pageWidthPx: viewport.width, pageHeightPx: viewport.height, truncated };
}

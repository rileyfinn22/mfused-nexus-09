/**
 * Region → output transform (C1, contract: print-export).
 *
 * The dieline frame defines the printable region in artboard/scene px. Print output is
 * exactly that region, mapped onto a page of the template's FIXED physical size (+bleed).
 *
 * Pure geometry only — no DOM, jsPDF, pdf.js, or Supabase imports — so it is unit-testable
 * in isolation (see __tests__/regionTransform.test.ts) and shared by printPdfExport.ts.
 */

/** Artboard internal DPI — MUST match TemplateEditor's INTERNAL_DPI (object coords). */
export const CANVAS_DPI = 150;

/**
 * Fabric text variants. v6 serializes IText as "i-text" (hyphen); older/other paths may use
 * "itext"/"text". The exporter and the region mapper MUST agree on this set so a text object is
 * never mapped as a shape (which would scale scaleX) and then rendered as text (double-scaling).
 */
export function isTextType(type: any): boolean {
  const t = String(type || "").toLowerCase();
  return t === "i-text" || t === "itext" || t === "textbox" || t === "text";
}

export interface RegionTransform {
  /** Region (dieline bleed box) in artboard px. */
  left: number;
  top: number;
  width: number;
  height: number;
  /**
   * Scene-px → mapped-px factor along each axis, expressed RELATIVE to the renderers'
   * implicit 1/CANVAS_DPI inches-per-px factor. So a mapped object's left' satisfies
   * `left' / CANVAS_DPI === outputInches`. 1 = identity.
   */
  RSx: number;
  RSy: number;
  /** True when the transform is a no-op (legacy template / frame at default print area). */
  identity: boolean;
}

/**
 * Derive the region→output transform from the persisted dieline frame and the template's
 * FIXED physical size. With no frame (legacy template) the region is the default print area
 * and RSx=RSy=1, so every downstream mapping is the identity → byte-identical pre-C1 output.
 */
export function computeRegionTransform(
  canvasData: any,
  widthInches: number,
  heightInches: number,
  bleedInches: number,
): RegionTransform {
  const totalW = widthInches + bleedInches * 2;
  const totalH = heightInches + bleedInches * 2;
  const baseW = totalW * CANVAS_DPI; // unscaled frame bleed-box, artboard px
  const baseH = totalH * CANVAS_DPI;

  const ft = canvasData?.dieline_frame;
  const region = ft
    ? {
        left: ft.left ?? 0,
        top: ft.top ?? 0,
        width: Math.max(1, baseW * (ft.scaleX ?? 1)),
        height: Math.max(1, baseH * (ft.scaleY ?? 1)),
      }
    : { left: 0, top: 0, width: baseW, height: baseH };

  const RSx = (totalW / region.width) * CANVAS_DPI;
  const RSy = (totalH / region.height) * CANVAS_DPI;
  const identity =
    Math.abs(region.left) < 1e-6 && Math.abs(region.top) < 1e-6 &&
    Math.abs(RSx - 1) < 1e-6 && Math.abs(RSy - 1) < 1e-6;

  return { ...region, RSx, RSy, identity };
}

/**
 * Pre-map a Fabric object from artboard coords into the region→output frame so the existing
 * per-type renderers (which divide by CANVAS_DPI) emit region-correct inches. Text is special-
 * cased: the region scale folds into fontSize (uniform glyph scaling) while the object keeps its
 * own scaleX/scaleY stretch — folding region scale into scaleX too would double-count in the
 * renderer's horizontal-stretch path.
 */
export function mapObjectToRegion(obj: any, rt: RegionTransform): any {
  if (rt.identity) return obj;
  const o: any = { ...obj };
  o.left = ((obj.left ?? 0) - rt.left) * rt.RSx;
  o.top = ((obj.top ?? 0) - rt.top) * rt.RSy;
  if (isTextType(obj?.type)) {
    o.fontSize = (obj.fontSize ?? 24) * rt.RSy; // uniform; scaleX/scaleY left intact
  } else {
    o.scaleX = (obj.scaleX ?? 1) * rt.RSx;
    o.scaleY = (obj.scaleY ?? 1) * rt.RSy;
    if (typeof obj.strokeWidth === "number") o.strokeWidth = obj.strokeWidth * rt.RSx;
  }
  return o;
}

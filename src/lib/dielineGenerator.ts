/**
 * Generates Fabric.js-compatible dieline objects (fold lines, cut lines, panel labels)
 * for boxes and bags based on dimensions.
 *
 * All coordinates are in inches; the caller converts to canvas pixels via DPI.
 */

export interface DielineObject {
  type: "line" | "rect" | "text";
  x1?: number; y1?: number; x2?: number; y2?: number; // for lines
  x?: number; y?: number; w?: number; h?: number;      // for rects
  text?: string;
  style: "cut" | "fold" | "zone-label";
}

export interface PanelZone {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  required?: boolean;
}

export interface DielineResult {
  /** Total flat layout width in inches */
  totalWidth: number;
  /** Total flat layout height in inches */
  totalHeight: number;
  /** Visual guide objects */
  objects: DielineObject[];
  /** Artwork placement zones */
  zones: PanelZone[];
}

const GLUE_TAB = 0.75; // inches

/**
 * Generate a box dieline cross layout.
 * Standard cross: Top / Front-Left-Back-Right / Bottom, plus glue tab.
 */
export function generateBoxDieline(
  w: number,
  h: number,
  d: number
): DielineResult {
  // Cross layout: total width = Front + Left + Back + Right + glue tab
  //               total height = Top + Front(height) + Bottom
  const totalWidth = w + d + w + d + GLUE_TAB;
  const totalHeight = d + h + d;

  const objects: DielineObject[] = [];
  const zones: PanelZone[] = [];

  // Panel positions (x, y) — origin top-left
  const panels = [
    { name: "Top",    x: d,         y: 0,     pw: w, ph: d },
    { name: "Front",  x: 0,         y: d,     pw: w, ph: h },
    { name: "Left",   x: w,         y: d,     pw: d, ph: h },
    { name: "Back",   x: w + d,     y: d,     pw: w, ph: h },
    { name: "Right",  x: w + d + w, y: d,     pw: d, ph: h },
    { name: "Bottom", x: d,         y: d + h, pw: w, ph: d },
  ];

  for (const p of panels) {
    // Cut lines (outer edges)
    objects.push(
      { type: "rect", x: p.x, y: p.y, w: p.pw, h: p.ph, style: "cut" }
    );
    // Zone label
    objects.push(
      { type: "text", x: p.x + p.pw / 2, y: p.y + p.ph / 2, text: p.name, style: "zone-label" }
    );
    zones.push({ name: p.name, x: p.x, y: p.y, w: p.pw, h: p.ph, required: p.name === "Front" });
  }

  // Fold lines between adjacent panels in the horizontal strip
  const foldXs = [w, w + d, w + d + w, w + d + w + d];
  for (const fx of foldXs) {
    objects.push({ type: "line", x1: fx, y1: d, x2: fx, y2: d + h, style: "fold" });
  }
  // Top/bottom fold lines
  objects.push({ type: "line", x1: d, y1: d, x2: d + w, y2: d, style: "fold" });
  objects.push({ type: "line", x1: d, y1: d + h, x2: d + w, y2: d + h, style: "fold" });

  // Glue tab
  const gx = w + d + w + d;
  objects.push({ type: "rect", x: gx, y: d, w: GLUE_TAB, h: h, style: "fold" });
  objects.push({ type: "text", x: gx + GLUE_TAB / 2, y: d + h / 2, text: "Glue", style: "zone-label" });

  return { totalWidth, totalHeight, objects, zones };
}

/**
 * Generate a bag dieline flat layout.
 * Layout: Front | Left Gusset | Back | Right Gusset
 * With optional bottom fold.
 */
export function generateBagDieline(
  w: number,
  h: number,
  gusset: number
): DielineResult {
  const totalWidth = w + gusset + w + gusset;
  const bottomFold = gusset / 2;
  const totalHeight = h + bottomFold;

  const objects: DielineObject[] = [];
  const zones: PanelZone[] = [];

  const panels = [
    { name: "Front",        x: 0,                 y: 0, pw: w,      ph: h },
    { name: "Left Gusset",  x: w,                 y: 0, pw: gusset, ph: h },
    { name: "Back",         x: w + gusset,         y: 0, pw: w,      ph: h },
    { name: "Right Gusset", x: w + gusset + w,     y: 0, pw: gusset, ph: h },
  ];

  for (const p of panels) {
    objects.push({ type: "rect", x: p.x, y: p.y, w: p.pw, h: p.ph, style: "cut" });
    objects.push({ type: "text", x: p.x + p.pw / 2, y: p.y + p.ph / 2, text: p.name, style: "zone-label" });
    zones.push({ name: p.name, x: p.x, y: p.y, w: p.pw, h: p.ph, required: p.name === "Front" });
  }

  // Fold lines between panels
  const foldXs = [w, w + gusset, w + gusset + w];
  for (const fx of foldXs) {
    objects.push({ type: "line", x1: fx, y1: 0, x2: fx, y2: h, style: "fold" });
  }

  // Bottom fold area
  objects.push({ type: "line", x1: 0, y1: h, x2: totalWidth, y2: h, style: "fold" });
  objects.push({ type: "rect", x: 0, y: h, w: totalWidth, h: bottomFold, style: "fold" });
  objects.push({ type: "text", x: totalWidth / 2, y: h + bottomFold / 2, text: "Bottom Fold", style: "zone-label" });

  return { totalWidth, totalHeight, objects, zones };
}

/**
 * For labels, no dieline is needed — just return the single panel as a zone.
 */
export function generateLabelDieline(
  w: number,
  h: number
): DielineResult {
  return {
    totalWidth: w,
    totalHeight: h,
    objects: [],
    zones: [{ name: "Label", x: 0, y: 0, w, h, required: true }],
  };
}

/**
 * Auto-select the right generator based on product type.
 */
export function generateDieline(
  productType: string,
  width: number,
  height: number,
  depth: number = 0
): DielineResult {
  switch (productType) {
    case "box":
      return generateBoxDieline(width, height, depth);
    case "bag":
      return generateBagDieline(width, height, depth);
    default:
      return generateLabelDieline(width, height);
  }
}

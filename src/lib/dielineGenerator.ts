/**
 * Generates Fabric.js-compatible dieline objects (fold/crease lines, cut/trim lines,
 * panel labels, tuck flaps) for boxes and bags based on dimensions.
 *
 * All coordinates are in inches; the caller converts to canvas pixels via DPI.
 *
 * Visual convention (matching industry standard):
 *   TRIM (cut) = blue solid lines
 *   CREASE (fold) = red solid lines
 */

export interface DielineObject {
  type: "line" | "rect" | "polyline" | "text";
  x1?: number; y1?: number; x2?: number; y2?: number; // for lines
  x?: number; y?: number; w?: number; h?: number;      // for rects
  points?: { x: number; y: number }[];                  // for polylines
  text?: string;
  style: "trim" | "crease" | "zone-label";
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

const GLUE_TAB = 0.625; // inches
const TUCK_FLAP_DEPTH_RATIO = 0.75; // tuck flap = 75% of depth
const DUST_FLAP_RATIO = 0.5; // dust flap = 50% of depth

/**
 * Generate a tuck-end box dieline matching industry-standard layout.
 *
 * Layout (left to right main strip):
 *   Glue Tab | Back | Side(Right) | Front | Side(Left)
 *
 * Top flaps: tuck on Front/Back, dust flaps on Sides
 * Bottom flaps: tuck on Front/Back, dust flaps on Sides
 *
 * w = box width, h = box height, d = box depth
 */
export function generateBoxDieline(
  w: number,
  h: number,
  d: number
): DielineResult {
  const tuck = Math.min(d * TUCK_FLAP_DEPTH_RATIO, d);
  const dust = d * DUST_FLAP_RATIO;

  // Main strip panels (y runs from tuck to tuck + h)
  const topFlap = tuck;
  const mainTop = topFlap; // y where main panels start
  const mainBottom = mainTop + h;
  const bottomFlap = tuck;

  const totalHeight = topFlap + h + bottomFlap;

  // X positions of panel left edges
  const xGlue = 0;
  const xBack = GLUE_TAB;
  const xRightSide = xBack + w;
  const xFront = xRightSide + d;
  const xLeftSide = xFront + w;
  const totalWidth = xLeftSide + d;

  const objects: DielineObject[] = [];
  const zones: PanelZone[] = [];

  // ── CREASE (fold) lines ─────────────────────────────────────────
  // Horizontal crease lines across full width (top and bottom of main strip)
  objects.push({ type: "line", x1: GLUE_TAB, y1: mainTop, x2: totalWidth, y2: mainTop, style: "crease" });
  objects.push({ type: "line", x1: GLUE_TAB, y1: mainBottom, x2: totalWidth, y2: mainBottom, style: "crease" });

  // Vertical crease lines (panel boundaries) — full height including flaps
  const panelBoundaries = [xBack, xRightSide, xFront, xLeftSide];
  for (const px of panelBoundaries) {
    objects.push({ type: "line", x1: px, y1: 0, x2: px, y2: totalHeight, style: "crease" });
  }

  // ── TRIM (cut) outlines ─────────────────────────────────────────

  // Main body outer rectangle (the full strip without flaps)
  // Left side of glue tab to right edge
  objects.push({
    type: "rect",
    x: xGlue, y: mainTop,
    w: totalWidth, h: h,
    style: "trim"
  });

  // Glue tab (tapered shape — simplified as a rect)
  objects.push({
    type: "rect",
    x: xGlue, y: mainTop,
    w: GLUE_TAB, h: h,
    style: "trim"
  });

  // ── TOP FLAPS ───────────────────────────────────────────────────

  // Back top tuck flap (full width of back panel, with rounded top)
  objects.push({
    type: "rect",
    x: xBack, y: 0,
    w: w, h: tuck,
    style: "trim"
  });

  // Right side dust flap (shorter)
  objects.push({
    type: "rect",
    x: xRightSide, y: mainTop - dust,
    w: d, h: dust,
    style: "trim"
  });

  // Front top tuck flap
  objects.push({
    type: "rect",
    x: xFront, y: 0,
    w: w, h: tuck,
    style: "trim"
  });

  // Left side dust flap
  objects.push({
    type: "rect",
    x: xLeftSide, y: mainTop - dust,
    w: d, h: dust,
    style: "trim"
  });

  // ── BOTTOM FLAPS ────────────────────────────────────────────────

  // Back bottom tuck flap
  objects.push({
    type: "rect",
    x: xBack, y: mainBottom,
    w: w, h: tuck,
    style: "trim"
  });

  // Right side dust flap
  objects.push({
    type: "rect",
    x: xRightSide, y: mainBottom,
    w: d, h: dust,
    style: "trim"
  });

  // Front bottom tuck flap
  objects.push({
    type: "rect",
    x: xFront, y: mainBottom,
    w: w, h: tuck,
    style: "trim"
  });

  // Left side dust flap
  objects.push({
    type: "rect",
    x: xLeftSide, y: mainBottom,
    w: d, h: dust,
    style: "trim"
  });

  // ── PANEL ZONES ─────────────────────────────────────────────────
  const panels = [
    { name: "Back",       x: xBack,      y: mainTop, pw: w, ph: h },
    { name: "Right Side", x: xRightSide, y: mainTop, pw: d, ph: h },
    { name: "Front",      x: xFront,     y: mainTop, pw: w, ph: h },
    { name: "Left Side",  x: xLeftSide,  y: mainTop, pw: d, ph: h },
  ];

  for (const p of panels) {
    objects.push({
      type: "text",
      x: p.x + p.pw / 2,
      y: p.y + p.ph / 2,
      text: p.name,
      style: "zone-label"
    });
    zones.push({
      name: p.name,
      x: p.x,
      y: p.y,
      w: p.pw,
      h: p.ph,
      required: p.name === "Front"
    });
  }

  // Label flaps
  objects.push({ type: "text", x: xGlue + GLUE_TAB / 2, y: mainTop + h / 2, text: "Glue", style: "zone-label" });

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
    objects.push({ type: "rect", x: p.x, y: p.y, w: p.pw, h: p.ph, style: "trim" });
    objects.push({ type: "text", x: p.x + p.pw / 2, y: p.y + p.ph / 2, text: p.name, style: "zone-label" });
    zones.push({ name: p.name, x: p.x, y: p.y, w: p.pw, h: p.ph, required: p.name === "Front" });
  }

  // Fold lines between panels
  const foldXs = [w, w + gusset, w + gusset + w];
  for (const fx of foldXs) {
    objects.push({ type: "line", x1: fx, y1: 0, x2: fx, y2: h, style: "crease" });
  }

  // Bottom fold area
  objects.push({ type: "line", x1: 0, y1: h, x2: totalWidth, y2: h, style: "crease" });
  objects.push({ type: "rect", x: 0, y: h, w: totalWidth, h: bottomFold, style: "crease" });
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

/**
 * Generates Fabric.js-compatible dieline objects for folding cartons and pouches.
 *
 * All coordinates are in inches; the caller converts to canvas pixels via DPI.
 *
 * Industry-standard visual convention:
 *   CUT (trim) = solid blue lines
 *   FOLD (crease) = dashed red lines
 *
 * Box types supported:
 *   - Reverse Tuck End (RTE) folding carton
 *
 * Bag types supported:
 *   - Stand-up pouch with bottom gusset and optional zipper
 */

export interface DielineObject {
  type: "line" | "polyline" | "text";
  /** For lines */
  x1?: number; y1?: number; x2?: number; y2?: number;
  /** For polylines (cut outlines, flap shapes) */
  points?: { x: number; y: number }[];
  /** For text labels */
  text?: string;
  x?: number; y?: number;
  /** Visual style */
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
  totalWidth: number;
  totalHeight: number;
  objects: DielineObject[];
  zones: PanelZone[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

function line(x1: number, y1: number, x2: number, y2: number, style: "cut" | "fold"): DielineObject {
  return { type: "line", x1, y1, x2, y2, style };
}

function polyline(pts: { x: number; y: number }[], style: "cut" | "fold"): DielineObject {
  return { type: "polyline", points: pts, style };
}

function label(x: number, y: number, text: string): DielineObject {
  return { type: "text", x, y, text, style: "zone-label" };
}

// ─── RTE (Reverse Tuck End) Folding Carton ───────────────────────────
//
// Industry-standard flat layout:
//
//                    ┌─ Top tuck (Front) ─┐
//   ┌────┬──────┬────┬──────┬────┐
//   │Glue│ Back │Side│Front │Side│   ← main strip
//   │Tab │      │ R  │      │ L  │
//   └────┴──────┴────┴──────┴────┘
//                    └─ Bot tuck (Back) ──┘
//
// RTE = top tuck opens from front panel, bottom tuck opens from back panel.
// Dust flaps on side panels (shorter than tuck flaps).
// Tuck flaps have a slight rounded/tapered top edge.
//
// w = box width (front/back), h = box height, d = box depth (sides)

const GLUE_TAB = 0.5;        // glue tab width in inches
const TUCK_RATIO = 0.48;     // tuck flap depth ≈ 48% of box width (industry standard ~half width)
const DUST_RATIO = 0.45;     // dust flap depth ≈ 45% of depth
const TUCK_LOCK_TAB = 0.15;  // small locking tab on tuck flap tip
const TUCK_TAPER = 0.15;     // inset on each side of tuck flap for tapered shape

export function generateBoxDieline(
  w: number,
  h: number,
  d: number
): DielineResult {
  // If depth is 0 or too small, default to a reasonable value
  if (d < 0.25) d = Math.max(1, w * 0.4);

  const tuck = w * TUCK_RATIO;
  const dust = d * DUST_RATIO;
  const lockTab = TUCK_LOCK_TAB;

  // Vertical layout: lockTab + tuck + mainH + tuck + lockTab
  const topFlap = tuck + lockTab;
  const bottomFlap = tuck + lockTab;
  const totalHeight = topFlap + h + bottomFlap;

  // Horizontal layout: glueTab + back(w) + sideR(d) + front(w) + sideL(d)
  const xGlue = 0;
  const xBack = GLUE_TAB;
  const xSideR = xBack + w;
  const xFront = xSideR + d;
  const xSideL = xFront + w;
  const totalWidth = xSideL + d;

  // Y positions
  const yTopLock = 0;
  const yTopTuck = lockTab;
  const yMain = topFlap;           // top of main panels
  const yMainBot = yMain + h;      // bottom of main panels
  const yBotTuck = yMainBot;
  const yBotLock = yMainBot + tuck;
  const yBottom = totalHeight;

  const objects: DielineObject[] = [];
  const zones: PanelZone[] = [];

  // ── FOLD LINES (dashed red) ─────────────────────────────────────

  // Horizontal folds at top and bottom of main strip
  objects.push(line(xGlue, yMain, totalWidth, yMain, "fold"));
  objects.push(line(xGlue, yMainBot, totalWidth, yMainBot, "fold"));

  // Vertical folds between panels (full height of main strip + into flaps)
  const panelXs = [xBack, xSideR, xFront, xSideL];
  for (const px of panelXs) {
    objects.push(line(px, yMain, px, yMainBot, "fold"));
  }

  // Vertical folds extending into top flap area (for tuck/dust boundaries)
  objects.push(line(xBack, yTopTuck, xBack, yMain, "fold"));
  objects.push(line(xSideR, yMain - dust, xSideR, yMain, "fold"));
  objects.push(line(xFront, yTopTuck, xFront, yMain, "fold"));
  objects.push(line(xSideL, yMain - dust, xSideL, yMain, "fold"));

  // Vertical folds extending into bottom flap area
  objects.push(line(xBack, yMainBot, xBack, yMainBot + dust, "fold"));
  objects.push(line(xSideR, yMainBot, xSideR, yBotTuck, "fold"));
  objects.push(line(xFront, yMainBot, xFront, yMainBot + dust, "fold"));
  objects.push(line(xSideL, yMainBot, xSideL, yBotTuck, "fold"));

  // ── CUT LINES (solid blue) ──────────────────────────────────────

  // Glue tab — tapered trapezoid on left side of Back panel
  const glueTaper = 0.15;
  objects.push(polyline([
    { x: xBack, y: yMain },
    { x: xGlue, y: yMain + glueTaper },
    { x: xGlue, y: yMainBot - glueTaper },
    { x: xBack, y: yMainBot },
  ], "cut"));

  // Main strip outer cut — top edge from Back left to SideL right
  objects.push(line(xBack, yMain, totalWidth, yMain, "cut"));
  // Main strip outer cut — bottom edge
  objects.push(line(xBack, yMainBot, totalWidth, yMainBot, "cut"));
  // Right edge of SideL
  objects.push(line(totalWidth, yMain, totalWidth, yMainBot, "cut"));

  // ── TOP FLAPS ────────────────────────────────────────────────────

  // Front panel TOP tuck flap (RTE: top tuck on front)
  // Tapered shape with lock tab
  const ftLeft = xFront + TUCK_TAPER;
  const ftRight = xFront + w - TUCK_TAPER;
  objects.push(polyline([
    { x: xFront, y: yMain },
    { x: ftLeft, y: yTopTuck },
    { x: ftLeft + 0.1, y: yTopLock },       // lock tab left
    { x: ftRight - 0.1, y: yTopLock },      // lock tab right
    { x: ftRight, y: yTopTuck },
    { x: xFront + w, y: yMain },
  ], "cut"));

  // Right side TOP dust flap (shorter)
  objects.push(polyline([
    { x: xSideR, y: yMain },
    { x: xSideR + 0.1, y: yMain - dust },
    { x: xSideR + d - 0.1, y: yMain - dust },
    { x: xSideR + d, y: yMain },
  ], "cut"));

  // Left side TOP dust flap
  objects.push(polyline([
    { x: xSideL, y: yMain },
    { x: xSideL + 0.1, y: yMain - dust },
    { x: xSideL + d - 0.1, y: yMain - dust },
    { x: xSideL + d, y: yMain },
  ], "cut"));

  // Back panel TOP dust flap (on RTE the back has a dust flap on top, not a tuck)
  objects.push(polyline([
    { x: xBack, y: yMain },
    { x: xBack + 0.1, y: yMain - dust },
    { x: xBack + w - 0.1, y: yMain - dust },
    { x: xBack + w, y: yMain },
  ], "cut"));

  // ── BOTTOM FLAPS ─────────────────────────────────────────────────

  // Back panel BOTTOM tuck flap (RTE: bottom tuck on back)
  const btLeft = xBack + TUCK_TAPER;
  const btRight = xBack + w - TUCK_TAPER;
  objects.push(polyline([
    { x: xBack, y: yMainBot },
    { x: btLeft, y: yBotTuck },
    { x: btLeft + 0.1, y: yBotLock + lockTab },
    { x: btRight - 0.1, y: yBotLock + lockTab },
    { x: btRight, y: yBotTuck },
    { x: xBack + w, y: yMainBot },
  ], "cut"));

  // Right side BOTTOM dust flap
  objects.push(polyline([
    { x: xSideR, y: yMainBot },
    { x: xSideR + 0.1, y: yMainBot + dust },
    { x: xSideR + d - 0.1, y: yMainBot + dust },
    { x: xSideR + d, y: yMainBot },
  ], "cut"));

  // Front panel BOTTOM dust flap (on RTE the front has dust flap on bottom)
  objects.push(polyline([
    { x: xFront, y: yMainBot },
    { x: xFront + 0.1, y: yMainBot + dust },
    { x: xFront + w - 0.1, y: yMainBot + dust },
    { x: xFront + w, y: yMainBot },
  ], "cut"));

  // Left side BOTTOM dust flap
  objects.push(polyline([
    { x: xSideL, y: yMainBot },
    { x: xSideL + 0.1, y: yMainBot + dust },
    { x: xSideL + d - 0.1, y: yMainBot + dust },
    { x: xSideL + d, y: yMainBot },
  ], "cut"));

  // ── PANEL ZONES & LABELS ─────────────────────────────────────────

  const panels = [
    { name: "Back",       x: xBack,  y: yMain, pw: w, ph: h, req: false },
    { name: "Right Side",  x: xSideR, y: yMain, pw: d, ph: h, req: false },
    { name: "Front",      x: xFront, y: yMain, pw: w, ph: h, req: true },
    { name: "Left Side",   x: xSideL, y: yMain, pw: d, ph: h, req: false },
  ];

  for (const p of panels) {
    zones.push({ name: p.name, x: p.x, y: p.y, w: p.pw, h: p.ph, required: p.req });
    objects.push(label(p.x + p.pw / 2, p.y + p.ph / 2, p.name));
  }

  // Label the glue tab and flaps
  objects.push(label(xGlue + GLUE_TAB / 2, yMain + h / 2, "Glue"));
  objects.push(label(xFront + w / 2, yTopTuck + tuck / 2, "Top Tuck"));
  objects.push(label(xBack + w / 2, yBotTuck + tuck / 2, "Bottom Tuck"));

  return { totalWidth, totalHeight, objects, zones };
}

// ─── Stand-Up Pouch / Bag ────────────────────────────────────────────
//
// Two layouts depending on whether a bottom gusset (depth) is specified:
//
// WITH gusset (depth > 0) — Stand-up pouch:
//
//   ┌──────────┬──────────┐
//   │ Top Seal │ Top Seal │
//   ├──────────┼──────────┤  ← seal fold
//   │ Zipper   │ Zipper   │
//   ├──────────┼──────────┤  ← zipper fold
//   │          │          │
//   │  Front   │  Back    │
//   │          │          │
//   ├──────────┴──────────┤  ← bottom fold
//   │   Bottom Gusset     │
//   └─────────────────────┘
//
// WITHOUT gusset (depth = 0) — 3-side seal bag:
//
//   ┌──────────┬──────────┐
//   │ Top Seal │ Top Seal │
//   ├──────────┼──────────┤  ← seal fold
//   │          │          │
//   │  Front   │  Back    │
//   │          │          │
//   └──────────┴──────────┘  ← sealed bottom
//
// w = pouch width (front/back), h = pouch height, gusset = bottom gusset depth

const SEAL_AREA = 0.375;     // top seal area in inches
const ZIPPER_ZONE = 0.5;     // zipper zone height
const BOTTOM_SEAL = 0.25;    // bottom seal line

export function generateBagDieline(
  w: number,
  h: number,
  gusset: number
): DielineResult {
  const hasGusset = gusset >= 0.25;
  const objects: DielineObject[] = [];
  const zones: PanelZone[] = [];

  // Horizontal: Front + Back side by side
  const totalWidth = w * 2;
  const xFold = w; // center fold between front and back

  if (hasGusset) {
    // ── Stand-up pouch with zipper + bottom gusset ──
    const gussetH = gusset; // bottom gusset fold area
    const totalHeight = SEAL_AREA + ZIPPER_ZONE + h + gussetH;

    const yTop = 0;
    const ySeal = SEAL_AREA;
    const yZipper = ySeal + ZIPPER_ZONE;
    const yPanelBottom = yZipper + h;
    const yBottom = totalHeight;

    // Outer cut
    objects.push(polyline([
      { x: 0, y: yTop },
      { x: totalWidth, y: yTop },
      { x: totalWidth, y: yBottom },
      { x: 0, y: yBottom },
      { x: 0, y: yTop },
    ], "cut"));

    // Fold lines
    objects.push(line(0, ySeal, totalWidth, ySeal, "fold"));           // top seal fold
    objects.push(line(0, yZipper, totalWidth, yZipper, "fold"));       // zipper fold
    objects.push(line(0, yPanelBottom, totalWidth, yPanelBottom, "fold")); // bottom panel fold
    objects.push(line(xFold, yTop, xFold, yPanelBottom, "fold"));      // center fold (panels only)

    // Zipper indicator
    const zipY = ySeal + ZIPPER_ZONE / 2;
    objects.push(line(0, zipY, totalWidth, zipY, "fold"));
    objects.push(label(totalWidth / 2, zipY, "⟵ Zipper ⟶"));

    // Labels
    objects.push(label(totalWidth / 2, ySeal / 2, "Top Seal"));
    objects.push(label(totalWidth / 2, yPanelBottom + gussetH / 2, "Bottom Gusset"));

    // Panel zones
    zones.push({ name: "Front", x: 0, y: yZipper, w, h, required: true });
    zones.push({ name: "Back", x: xFold, y: yZipper, w, h, required: false });
    objects.push(label(w / 2, yZipper + h / 2, "Front"));
    objects.push(label(xFold + w / 2, yZipper + h / 2, "Back"));

    return { totalWidth, totalHeight, objects, zones };
  } else {
    // ── 3-side seal bag (no gusset, no zipper) ──
    const totalHeight = SEAL_AREA + h + BOTTOM_SEAL;

    const yTop = 0;
    const ySeal = SEAL_AREA;
    const yPanelBottom = ySeal + h;
    const yBottom = totalHeight;

    // Outer cut
    objects.push(polyline([
      { x: 0, y: yTop },
      { x: totalWidth, y: yTop },
      { x: totalWidth, y: yBottom },
      { x: 0, y: yBottom },
      { x: 0, y: yTop },
    ], "cut"));

    // Fold lines
    objects.push(line(0, ySeal, totalWidth, ySeal, "fold"));               // top seal fold
    objects.push(line(0, yPanelBottom, totalWidth, yPanelBottom, "fold"));  // bottom seal fold
    objects.push(line(xFold, yTop, xFold, yBottom, "fold"));               // center fold

    // Labels
    objects.push(label(totalWidth / 2, ySeal / 2, "Top Seal"));
    objects.push(label(totalWidth / 2, yPanelBottom + BOTTOM_SEAL / 2, "Bottom Seal"));

    // Panel zones
    zones.push({ name: "Front", x: 0, y: ySeal, w, h, required: true });
    zones.push({ name: "Back", x: xFold, y: ySeal, w, h, required: false });
    objects.push(label(w / 2, ySeal + h / 2, "Front"));
    objects.push(label(xFold + w / 2, ySeal + h / 2, "Back"));

    return { totalWidth, totalHeight, objects, zones };
  }
}

// ─── Label (flat, no dieline) ──────────────────────────────────────

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

// ─── Auto-select ───────────────────────────────────────────────────

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

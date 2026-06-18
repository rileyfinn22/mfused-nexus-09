import { Group, Rect } from "fabric";

/**
 * DielineFrame — the movable/scalable trim+bleed+safe boundary that defines the
 * printable region on the artboard (ADR-002, contract: dieline-frame).
 *
 * It is a Fabric Group of outline rects (no fill, so artwork shows through):
 *   - bleed boundary (gray solid) — the outer edge
 *   - trim / cut line (red dashed)
 *   - safe area (green dashed)
 *
 * Physical size (widthIn × heightIn) is fixed by the template and is independent of
 * the group's on-artboard scale. `getDielineRegion()` returns its bleed bounds in
 * scene coords; `getDielinePhysical()` returns the fixed physical size.
 */

export const DIELINE_FRAME_NAME = "dieline_frame";

export interface DielineFrameOpts {
  widthIn: number;
  heightIn: number;
  bleedIn: number;
  dpi: number;
  transform?: { left: number; top: number; scaleX: number; scaleY: number };
}

function outlineRect(left: number, top: number, w: number, h: number, stroke: string, dash: number[] | undefined, sw: number) {
  return new Rect({
    left, top, width: Math.max(1, w), height: Math.max(1, h),
    fill: "transparent", stroke, strokeWidth: sw, strokeDashArray: dash, strokeUniform: true,
    selectable: false, evented: false, objectCaching: false, hasControls: false, hasBorders: false,
  } as any);
}

export function createDielineFrame(opts: DielineFrameOpts): Group {
  const { widthIn, heightIn, bleedIn, dpi } = opts;
  const bleedPx = Math.round(bleedIn * dpi);
  const trimW = Math.round(widthIn * dpi);
  const trimH = Math.round(heightIn * dpi);
  const bleedW = trimW + bleedPx * 2;
  const bleedH = trimH + bleedPx * 2;
  const safe = Math.max(bleedPx, Math.round(0.0625 * dpi));

  const bleedRect = outlineRect(0, 0, bleedW, bleedH, "#9ca3af", undefined, 1);
  const trimRect = outlineRect(bleedPx, bleedPx, trimW, trimH, "#dc2626", [6, 4], 1.5);
  const safeRect = outlineRect(bleedPx + safe, bleedPx + safe, trimW - 2 * safe, trimH - 2 * safe, "#16a34a", [4, 4], 1);

  const group = new Group([bleedRect, trimRect, safeRect], {
    left: opts.transform?.left ?? 0,
    top: opts.transform?.top ?? 0,
    scaleX: opts.transform?.scaleX ?? 1,
    scaleY: opts.transform?.scaleY ?? 1,
    subTargetCheck: false,
    objectCaching: false,
    // Default: a non-interactive guide so artwork stays freely editable. A "Move Dieline"
    // toggle in the editor makes it grabbable when the designer wants to reposition it.
    selectable: false,
    evented: false,
  } as any);

  (group as any).name = DIELINE_FRAME_NAME;
  (group as any).locked = false;
  (group as any).editable = false;
  (group as any)._displayName = "Dieline frame";
  (group as any)._physical = { widthIn, heightIn, bleedIn };
  group.set({
    borderColor: "#3b82f6", cornerColor: "#3b82f6", cornerStyle: "circle", transparentCorners: false,
  } as any);
  return group;
}

/** Bleed-region bounds of the frame, in artboard/scene coords (used by PrintExport). */
export function getDielineRegion(frame: any): { left: number; top: number; width: number; height: number } {
  return {
    left: frame.left ?? 0,
    top: frame.top ?? 0,
    width: (frame.width ?? 0) * (frame.scaleX ?? 1),
    height: (frame.height ?? 0) * (frame.scaleY ?? 1),
  };
}

/** Fixed physical size — independent of on-artboard scale. */
export function getDielinePhysical(frame: any): { widthIn: number; heightIn: number; bleedIn: number } {
  return frame?._physical ?? { widthIn: 0, heightIn: 0, bleedIn: 0 };
}

import { describe, it, expect } from "vitest";
import { computeRegionTransform, mapObjectToRegion, CANVAS_DPI } from "../regionTransform";

/**
 * Golden-size export tests (C2, contract: print-export I1/I4).
 *
 * These pin the print geometry: the output page is the template's FIXED physical size and
 * a reference object lands at the expected output position/scale, derived only from
 * widthIn/heightIn — never from the dieline frame's on-artboard scale.
 */

// 4" × 3" label, 0.125" bleed → page 4.25" × 3.25".
const W = 4;
const H = 3;
const BLEED = 0.125;
const totalW = W + BLEED * 2; // 4.25
const totalH = H + BLEED * 2; // 3.25
const baseW = totalW * CANVAS_DPI; // 637.5
const baseH = totalH * CANVAS_DPI; // 487.5

/** Output inches a mapped object reports = mapped left / CANVAS_DPI. */
const toInches = (mappedPx: number) => mappedPx / CANVAS_DPI;

describe("computeRegionTransform", () => {
  it("legacy template (no frame) is the identity over the default print area", () => {
    const rt = computeRegionTransform({}, W, H, BLEED);
    expect(rt.identity).toBe(true);
    expect(rt.RSx).toBeCloseTo(1, 9);
    expect(rt.RSy).toBeCloseTo(1, 9);
    expect(rt.left).toBe(0);
    expect(rt.top).toBe(0);
    expect(rt.width).toBeCloseTo(baseW, 6);
    expect(rt.height).toBeCloseTo(baseH, 6);
  });

  it("a frame at the default placement is still the identity", () => {
    const rt = computeRegionTransform(
      { dieline_frame: { left: 0, top: 0, scaleX: 1, scaleY: 1 } }, W, H, BLEED,
    );
    expect(rt.identity).toBe(true);
    expect(rt.RSx).toBeCloseTo(1, 9);
    expect(rt.RSy).toBeCloseTo(1, 9);
  });

  it("a 2× frame halves the region scale (art appears half size in print)", () => {
    const rt = computeRegionTransform(
      { dieline_frame: { left: 100, top: 50, scaleX: 2, scaleY: 2 } }, W, H, BLEED,
    );
    expect(rt.identity).toBe(false);
    expect(rt.left).toBe(100);
    expect(rt.top).toBe(50);
    expect(rt.width).toBeCloseTo(baseW * 2, 6);
    expect(rt.height).toBeCloseTo(baseH * 2, 6);
    expect(rt.RSx).toBeCloseTo(0.5, 9);
    expect(rt.RSy).toBeCloseTo(0.5, 9);
  });

  it("I1: physical page size is independent of the frame's on-artboard scale", () => {
    // totalW/totalH are derived only from widthIn/heightIn(+bleed), never from the frame.
    const a = computeRegionTransform({ dieline_frame: { left: 0, top: 0, scaleX: 1, scaleY: 1 } }, W, H, BLEED);
    const b = computeRegionTransform({ dieline_frame: { left: 999, top: 7, scaleX: 3.7, scaleY: 3.7 } }, W, H, BLEED);
    // The page the region maps onto is always totalW × totalH:
    expect(toInches(a.width * a.RSx)).toBeCloseTo(totalW, 6);
    expect(toInches(a.height * a.RSy)).toBeCloseTo(totalH, 6);
    expect(toInches(b.width * b.RSx)).toBeCloseTo(totalW, 6);
    expect(toInches(b.height * b.RSy)).toBeCloseTo(totalH, 6);
  });
});

describe("mapObjectToRegion", () => {
  it("identity transform returns the object unchanged (legacy = byte-identical)", () => {
    const rt = computeRegionTransform({}, W, H, BLEED);
    const obj = { type: "rect", left: 30, top: 40, scaleX: 1, scaleY: 1, width: 150, height: 150 };
    expect(mapObjectToRegion(obj, rt)).toBe(obj); // same reference, no copy
  });

  it("reference rect lands at the expected output position and scale under a 2× frame", () => {
    const rt = computeRegionTransform(
      { dieline_frame: { left: 100, top: 50, scaleX: 2, scaleY: 2 } }, W, H, BLEED,
    );
    // A 1"×1" artboard rect (150px) at the region's top-left corner.
    const rect = { type: "rect", left: 100, top: 50, scaleX: 1, scaleY: 1, width: 150, height: 150, strokeWidth: 2 };
    const m = mapObjectToRegion(rect, rt);
    // Top-left of the region → top-left of the page (0,0):
    expect(toInches(m.left)).toBeCloseTo(0, 6);
    expect(toInches(m.top)).toBeCloseTo(0, 6);
    // 1" artboard rect prints at 0.5" because the frame is 2× (art appears half size):
    expect(toInches(m.width * m.scaleX)).toBeCloseTo(0.5, 6);
    expect(toInches(m.height * m.scaleY)).toBeCloseTo(0.5, 6);
    expect(m.strokeWidth).toBeCloseTo(2 * 0.5, 6);
  });

  it("rect at the region's far corner maps to the page's far corner", () => {
    const rt = computeRegionTransform(
      { dieline_frame: { left: 100, top: 50, scaleX: 2, scaleY: 2 } }, W, H, BLEED,
    );
    const corner = { type: "rect", left: 100 + baseW * 2, top: 50 + baseH * 2, scaleX: 1, scaleY: 1, width: 1, height: 1 };
    const m = mapObjectToRegion(corner, rt);
    expect(toInches(m.left)).toBeCloseTo(totalW, 6);
    expect(toInches(m.top)).toBeCloseTo(totalH, 6);
  });

  it("text scales fontSize uniformly and preserves its own stretch", () => {
    const rt = computeRegionTransform(
      { dieline_frame: { left: 0, top: 0, scaleX: 2, scaleY: 2 } }, W, H, BLEED,
    );
    const text = { type: "i-text", left: 0, top: 0, fontSize: 30, scaleX: 1.4, scaleY: 1, text: "Hi" };
    const m = mapObjectToRegion(text, rt);
    expect(m.fontSize).toBeCloseTo(30 * 0.5, 6); // halved with the region
    expect(m.scaleX).toBe(1.4); // own horizontal stretch untouched
    expect(m.scaleY).toBe(1);
  });
});

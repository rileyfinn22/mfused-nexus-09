# ADR-002 — Dieline frame as a first-class object (fixed physical size)

## Status
Accepted

## Context
Today the trim/bleed is an HTML overlay locked to the canvas edges — the template *is* the world. The rework needs a **movable, scalable** trim/cut boundary placed over free artwork, while the **physical print size stays fixed** (confirmed rule).

## Decision
Model the dieline as a first-class Fabric object `dieline_frame` (a `Group`):
- Children: **bleed** rect (outer), **trim** rect (dashed, the cut), **safe** rect (inner), + labels.
- Its scene size = `width_inches × INTERNAL_DPI` (the template's physical size). It is **movable** (`left/top`) and **scalable** on the artboard (`scaleX/scaleY`).
- **Physical size is independent of on-artboard scale.** Scaling the frame changes *which art is captured and at what scale in the print*, not the product's printed dimensions. Physical dimensions change **only** via a numeric size field (with confirm), which rebuilds the frame's base size.
- `getRegion()` → the frame's bounds in artboard coords (left, top, w*scaleX, h*scaleY) — the **print region**.
- Persisted as a transform `{ left, top, scaleX, scaleY, widthIn, heightIn, bleedIn }` (ADR-003), not as serialized child geometry.
- Locked from customers by default; z-ordered above artwork, below trim marks/perf overlays.

## Consequences
- One clean object to move/scale/lock and to drive export (`getRegion()`).
- Replaces the HTML bleed overlay (removes the viewport-sync hack).
- Box/bag multi-panel dielines (from `dielineGenerator.ts`) are **out of scope now**; the frame is a rectangular trim. Later phase can swap in a generated dieline group behind the same `getRegion()` contract.

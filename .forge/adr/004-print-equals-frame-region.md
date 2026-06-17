# ADR-004 — Print output = the dieline-frame region at true physical size

## Status
Accepted

## Context
`printPdfExport.ts` today assumes scene == print area and renders the whole canvas. With a free artboard + movable frame, the print must be **exactly the region inside the dieline frame**, at the template's **physical size × EXPORT_DPI**, regardless of on-screen zoom or where art sits on the pasteboard (R15, R16, NFR4).

## Decision
Refactor `printPdfExport.ts` to be **region-based**:
1. Inputs: `canvasData` (artboard JSON incl. `dieline_frame`), physical `width/height/bleed inches`, `sourcePdfPath`, `EXPORT_DPI`.
2. Compute the **frame region** in artboard px from the persisted frame transform (`getRegion()` semantics).
3. Build the output transform `region → physical inches`: `outScale = (width_inches × EXPORT_DPI) / regionWidthPx`. Translate so the frame's top-left → output origin (minus bleed).
4. Render each object **through that transform** (reuse existing per-type drawing: vector text via jsPDF when standard font else raster; images; rect; line; +circle/ellipse/triangle/polygon branch). Clip to the bleed box.
5. Source PDF art: re-render via pdf.js at `EXPORT_DPI`, placed by the region transform (not the old whole-page placement rules).
6. Add crop marks at trim, perf lines, mask knockouts as today — all in output space.

- Output physical dimensions come **only** from `width_inches/height_inches` (the fixed-size rule), never from the on-artboard frame scale. Frame scale affects how art maps in, not the page size.
- Keep `generateCanvasOnlyPdf` and `generatePrintReadyPdf` but both go through the region transform.

## Consequences
- Highest-risk change → guard with **golden tests**: a known template+frame must export at exact physical size and place a reference mark at a known position (NFR4).
- Proof (on-screen frame) ≈ print, by construction (same region + transform).
- Decouples print resolution from screen re-rasterization (ADR-001).

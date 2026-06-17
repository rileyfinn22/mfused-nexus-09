# Contract — PrintExport

Renders the **dieline-frame region** to a print-ready PDF at the template's **true physical size × EXPORT_DPI**. Region-based refactor of `lib/printPdfExport.ts`.

## Entry
`generatePrintReadyPdf({ canvasData, sourcePdfPath, EXPORT_DPI })` and `generateCanvasOnlyPdf({ canvasData, EXPORT_DPI })` → `Promise<Blob>`.
- `canvasData` includes the `dieline_frame` transform → region + physical size derived from it (and the template's `widthIn/heightIn/bleedIn`).

## Algorithm
1. `region = dielineFrame.getRegion()` (artboard px). `phys = dielineFrame.getPhysical()`.
2. `outScale = (phys.widthIn * EXPORT_DPI) / region.width`. Output page = `(phys.widthIn+2*bleed) × (phys.heightIn+2*bleed)` inches.
3. For each persisted object intersecting `region` (+bleed): map artboard→output via translate(−region.left,−region.top)+scale(outScale), then draw with the existing per-type renderers (vector text / image / rect / line / +circle/ellipse/triangle/polygon). Clip to bleed box.
4. Source PDF: re-render via pdf.js at `EXPORT_DPI`, placed by the region transform (replaces whole-page placement rules).
5. Crop marks at trim, perf lines, OCR knockouts — in output space.

## Error / edge
- No `dieline_frame` (legacy) → synthesize from physical size at origin (ADR-003) before exporting.
- Objects fully outside `region`+bleed → excluded (pasteboard art doesn't print) — R16.

## Invariants
- I1: output **physical dimensions are exact**, derived only from `widthIn/heightIn` (fixed-size rule) — never from on-artboard frame scale. (NFR4)
- I2: only content within `region`+bleed is included.
- I3: on-screen proof (frame region) ≈ printed output.
- I4: covered by **golden-size tests**: known template+frame → exact page size + reference mark at expected output position.

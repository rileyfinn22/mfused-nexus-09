# Contract — DielineFrame

A first-class Fabric object (`name: "dieline_frame"`) representing the trim/bleed/safe boundary at the template's **fixed physical size**. Replaces the HTML bleed overlay.

## Construct
`createDielineFrame({ widthIn, heightIn, bleedIn, dpi, transform? })`
- Base scene size = `widthIn*dpi × heightIn*dpi`. Children: bleed rect (outer), trim rect (dashed, the cut), safe rect (inner), labels.
- `transform?: { left, top, scaleX, scaleY }` — restores persisted placement (default: centered in artboard).

## Methods
- `setPhysicalSize(widthIn, heightIn, bleedIn)` → rebuilds base size (numeric resize; physical size change, with confirm at UI).
- `getRegion(): { left, top, width, height }` — frame bounds in **artboard coords** (= `left, top, baseW*scaleX, baseH*scaleY`). The **print region**.
- `getPhysical(): { widthIn, heightIn, bleedIn }` — always the configured physical size, independent of `scaleX/scaleY`.
- `serialize(): { left, top, scaleX, scaleY, widthIn, heightIn, bleedIn }`.

## Error / edge
- `scaleX/scaleY` clamped > 0; min on-screen size enforced so it stays grabbable.
- Resizing physical size never silently changes existing art positions.

## Invariants
- I1: **physical size is independent of on-artboard scale** — `getPhysical()` ignores `scaleX/scaleY`.
- I2: `getRegion()` is the single source of truth for what prints (consumed by PrintExport).
- I3: movable/scalable in `edit` mode; locked (non-interactive) in `use` mode unless explicitly unlocked.
- I4: z-order: above artwork, below trim marks / perf overlays; excluded from artwork-only operations.
- I5: serialized inside `canvas_data` (travels with the design; no separate migration).

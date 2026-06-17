# Contract — ArtboardCanvas

Owns the Fabric canvas in **artboard space**: pasteboard, pan/zoom, fit-to-content, serialization. Rework of the canvas core in `TemplateEditor.tsx`.

## Inputs
- `canvasData: FabricJSON | null` — objects in artboard coords (incl. optional `dieline_frame`).
- `mode: "edit" | "use"`.
- `physical: { widthIn, heightIn, bleedIn }`, `productType`.
- refs: `fabricCanvasRef`.
- callbacks: `onCanvasChange(json)`.

## Provides
- `INTERNAL_DPI = 150` artboard scene; canvas element fills the workspace.
- Viewport API: `zoomTo(point, z)`, `panBy(dx,dy)`, `fitToContent()`, `setZoom`, with scroll-zoom + middle-drag pan. Viewport transform **never** mutates object coords.
- `getContentBounds()` → artboard rect of all non-guide objects (∪ dieline frame).
- `serialize()` → JSON of persisted objects in artboard coords; **excludes** guides (`_*`) and re-derivable helpers; **includes** `dieline_frame` transform + `locked/editable/name/_displayName`.
- Emits `onCanvasChange` on mutation (debounced) for undo + persistence.

## Error / edge
- Empty canvas → `fitToContent()` falls back to framing the dieline region.
- Blob-URL image srcs are stripped on (de)serialize; re-hydrated from storage.

## Invariants
- I1: persisted object coords are in artboard space at `INTERNAL_DPI`; unchanged across save/load.
- I2: viewport (zoom/pan) is view-only.
- I3: in `use` mode, locked objects + dieline frame are non-interactive; only unlocked are editable.
- I4: guide/overlay objects are never serialized and never exported.

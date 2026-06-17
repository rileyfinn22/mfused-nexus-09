# Contract — Importers + HiResRenderManager

Decompose uploaded files into editable layers placed at **natural size** in artboard coords; keep raster art sharp at zoom.

## Importers
`importFile(file): Promise<void>` (dispatch by type) — refactor of existing `loadPdfFile / importSvgFile / importPsdFile / pickedImageAsBackground`.
- **PDF** → background/art rendered high-res + real text extracted (`getTextContent`) as editable text layers; registers a HiRes source. Placed at natural size (page inches × `INTERNAL_DPI`), centered on the artboard near the dieline frame.
- **SVG** → individual vector layers (resolution-independent).
- **PSD** → per-layer (text → editable text, raster → image); registers HiRes per raster layer.
- **PNG/JPG** → single image layer (no decomposition possible).

Output per layer: `{ kind, name, x,y,w,h (artboard px), locked:true, editable:false, src? , hiResSourceId? }`. All **locked by default**; the admin unlocks.

Errors: `UnsupportedType`, `ParseError` → toast + no-op (never corrupt canvas).

## HiResRenderManager
`register(layerId, source)` · `onZoomSettled(zoom, visibleRegion)` · `dispose()`
- On zoom-settle (debounced ~150ms), re-render PDF/PSD raster at `targetDPI = clamp(INTERNAL_DPI*zoom*DPR, base, MAX_RASTER_DPI)`, swap FabricImage `src` preserving transform.
- LRU cache, total-pixel cap; eviction on cap. Off the interaction path.

## Invariants
- I1: imported layers are individually selectable/movable (never a single locked blob) — satisfies R5.
- I2: layers locked by default; positions in artboard space at natural size.
- I3: SVG/vector bypass HiRes (already sharp); raster layers always have a base raster fallback.
- I4: HiRes swaps never change object transform or print output (print renders from source at `EXPORT_DPI`).

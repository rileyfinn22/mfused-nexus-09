# ADR-001 — High-resolution rendering (sharp at deep zoom)

## Status
Accepted

## Context
Rasterized PDF/PSD artwork blurs on deep zoom because it's rendered **once** at a fixed resolution (tied to the small template) and then scaled up by the Fabric viewport zoom. Fabric cannot render PDF vector natively. We need crisp artwork from Fit through deep zoom (NFR1).

## Options
1. **Render once, very high res** — bump the single raster to e.g. 2800–8000px. Simple, but unbounded memory and still finite; blurs past that scale. (Current stopgap.)
2. **Zoom-aware re-rasterization (pdf.js)** — keep the source PDF; when zoom increases past the current raster's effective resolution, re-render the page (or the visible/frame region) via pdf.js at `renderDPI ≈ printDPI × zoomFactor`, swap the FabricImage src. Debounced on zoom-settle.
3. **Tiled rendering** — render visible tiles at full res. Best quality, most complex.

## Decision
Adopt **Option 2 (zoom-aware re-rasterization)** via a `HiResRenderManager`, with Option 1 as the initial/base raster.

- Each PDF/PSD-backed image layer registers its **source** (PDF path/buffer or PSD layer) + base raster.
- On zoom-settle (debounced ~150ms), if `currentZoom` exceeds the resolution the current raster was rendered for, re-render at `targetDPI = clamp(INTERNAL_DPI × zoom × DPR, base, MAX_RASTER_DPI)` and swap the FabricImage `src` (preserving transform).
- Cap total raster cache; evict least-recently-zoomed. Re-render off the interaction path (never blocks pan/zoom).
- **SVG / vector paths bypass** (already resolution-independent in Fabric).

## Consequences
- Sharp at any practical zoom without holding one giant bitmap.
- Adds an async render manager + cache; must be debounced and memory-capped.
- Print export is independent (renders from source at `EXPORT_DPI`), so screen re-raster never affects print fidelity.

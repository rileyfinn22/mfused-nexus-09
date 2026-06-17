# Contract — LayersPanel + PropertiesPanel

Per-layer and dieline-frame management; **lock/unlock is the admin→customer edit contract**. Builds on existing `CanvasObjectsPanel` + the in-editor Properties panel.

## LayersPanel
Input: `canvas`, `onSync`. Lists non-guide objects (incl. `dieline_frame` as a special pinned entry).
Actions: select, reorder (up/down), show/hide, rename (`_displayName`), opacity, **lock/unlock**, delete.

## PropertiesPanel (contextual to selection)
- Universal: customer-access **lock toggle**, opacity, arrange (forward/back), align, position (center / fit), delete.
- Text: font, size, bold/italic/color, split.
- Shape: fill, stroke, stroke width.
- Dieline frame (selected): **numeric physical size** (W×H in, bleed), with confirm; lock toggle.

## Mutations
All go through `applyToSelection(fn)` → mutate object → `canvas.requestRenderAll()` → `onSync()` (persist + undo). State mirrors (`objFill`, `objOpacity`, fontFamily, …) sync from selection.

## Invariants
- I1: an object's `locked` flag is the authoritative customer-edit gate; persisted; honored in `use` mode.
- I2: editing the dieline frame's numeric size calls `DielineFrame.setPhysicalSize` (physical change) — distinct from dragging/scaling it (region change).
- I3: panels operate on selection only; never mutate guides.
- I4: rename persists via `_displayName` (already in serialize whitelist).

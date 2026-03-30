

## Fix Print Workshop: Flickering + Restructure for Custom Dieline Orders

### Problem 1: Infinite Resize Flickering
The `ResizeObserver` watches `containerRef` — the same div whose dimensions change when `cssWidth`/`cssHeight` update. This creates a feedback loop: ResizeObserver fires → `containerWidth` updates → `displayScale`/`cssWidth` recalculates → div resizes → ResizeObserver fires again (alternating between 525px and 515px as seen in replay).

**Fix**: Add a stable outer wrapper div that the ResizeObserver watches, separate from the inner div whose size changes. The outer wrapper has no size dependency on canvas dimensions.

### Problem 2: Canvas Destroyed on Every Resize
The main `useEffect` (line 459) that creates the Fabric canvas depends on `canvasWidth`, `canvasHeight`, and `cssWidth`/`cssHeight`. When the container resizes, these values change, the effect re-runs, and the entire canvas is destroyed and recreated — losing state, causing flicker, and re-fetching PDFs.

**Fix**: Split into two effects:
- **Init effect**: Creates the Fabric canvas once (keyed on `canvasWidth` + `canvasHeight` + `mode` only — the logical resolution, not display size)
- **Resize effect**: When `displayScale` changes, call `canvas.setDimensions()` (CSS only) and `canvas.setZoom()` without recreating the canvas

### Problem 3: Custom Orders Need Full Editor Tools
When a custom box/bag order opens, customers need artwork upload, text tools, and image placement — not just the restricted "use" mode text editing. Currently `isCustomOrder` sets `mode="edit"` which works but is semantically wrong (it's the admin template-authoring mode).

**Fix**: No mode change needed — custom orders already use `mode="edit"`. But the toolbar needs an "Upload Artwork" button that works in both modes, and the dieline zones should show clickable "Add Art Here" overlays.

### Files to Modify

1. **`src/components/print-workshop/TemplateEditor.tsx`**
   - Add a stable `measureRef` wrapper div outside the canvas container for ResizeObserver
   - Split the canvas init effect: separate creation (depends on logical dims + mode) from display scaling (depends on containerWidth)
   - Add "Upload Artwork" button to toolbar (both modes) — lets users upload PNG/JPG/PDF and place on canvas
   - Add artwork zone click-to-upload: when dieline zones exist, show semi-transparent zone overlays users can click to upload art into that panel

2. **`src/pages/PrintWorkshop.tsx`**
   - No structural changes needed, custom order flow already passes correct props

### Implementation Details

**Stable ResizeObserver pattern:**
```text
<div ref={measureRef}>          ← ResizeObserver watches this (stable size)
  <div ref={containerRef}>      ← Contains canvas, size driven by cssWidth/cssHeight
    <canvas ref={canvasRef} />
  </div>
</div>
```

**Split effects:**
- Effect 1 (canvas init): deps = `[canvasWidth, canvasHeight, mode, dielineResult]` — destroys/recreates canvas only when logical dimensions or product type change
- Effect 2 (display scaling): deps = `[containerWidth, canvasWidth, canvasHeight]` — calls `setDimensions({cssOnly:true})` + `setZoom()` on existing canvas instance

**Artwork upload in toolbar:**
- "Upload Image" button opens file picker (PNG, JPG, SVG, PDF)
- Image is added as a Fabric.Image centered on canvas (or within clicked zone)
- User can move/scale/rotate freely
- For PDFs: render first page to image, then add as Fabric.Image

### Implementation Order
1. Fix the flickering (stable measure ref + split effects) — highest priority
2. Add artwork upload button to toolbar for both modes
3. Add clickable zone overlays for dieline panels ("Click to add art")




## Fix: Dieline Lines Too Thin to See

### Root Cause
The dieline stroke widths (1px and 1.5px) are in canvas-coordinate pixels. When the canvas is zoomed down via `displayScale` (~0.37 for a typical box), those lines render at **sub-pixel thickness** on screen (0.37–0.55px). The dash arrays also shrink to near-invisible dots.

### Fix
Scale `strokeWidth` and `strokeDashArray` inversely with `displayScale` so lines appear at a consistent visual thickness regardless of zoom level.

### File: `src/components/print-workshop/TemplateEditor.tsx`

In the dieline rendering section (~line 589-643):

1. **Compute inverse scale factor** to keep lines visually consistent:
   ```
   const invScale = 1 / displayScale;
   ```

2. **Apply to stroke widths**: Instead of `strokeW = 1` or `1.5`, use `strokeW * invScale` — so a 1.5px cut line at 0.37 zoom becomes ~4px in canvas coords, rendering as 1.5px on screen.

3. **Apply to dash arrays**: Scale `[6, 4]` to `[6 * invScale, 4 * invScale]` so dashes look correct at any zoom.

4. **Apply to label font size**: The label `fontSize: 11 * (DPI / 72)` (~23px canvas) renders as ~8.5px on screen. Scale it up similarly so panel names are legible.

This is a ~10-line change in the dieline rendering loop. The `displayScale` value is already available in scope (line 346). The `dielineResult` rendering block needs access to it — it's inside the init effect which currently captures it via closure, but since `displayScale` isn't in the effect's deps, we need to either:
- Pass the current `displayScale` via a ref so the init effect reads the latest value, OR
- Add `displayScale` to the effect deps (simpler, causes re-render of dieline on resize which is acceptable)

**Recommended**: Add `displayScale` to the effect dependency array and use it directly in the stroke calculations.


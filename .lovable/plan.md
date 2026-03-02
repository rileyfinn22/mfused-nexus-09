
Issue confirmed. The current knockout is being placed in the wrong coordinates, so the original PDF text remains visible. The main regression is in `getObjectBoundsInCanvas`: `getBoundingRect()` is already in scene/canvas coordinates (Fabric v6), so dividing by zoom shifts the mask to the wrong spot.

Plan to fix:

1) Correct coordinate math (primary bug)
- File: `src/components/print-workshop/TemplateEditor.tsx`
- Revert `getObjectBoundsInCanvas` to return raw `getBoundingRect()` values (no `/ zoom`).

2) Stop sizing knockout from rendered replacement text
- Right now the mask is based on the new `IText` bounds, which can drift from the original OCR area.
- Change knockout placement to use OCR-detected bounds directly:
  - Manual extract: use `x_percent/y_percent/w_percent/h_percent` relative to the user’s drawn crop.
  - Extract-all: use region percentages relative to full canvas.
- If OCR bounds are missing/invalid, fallback to the user-selected rectangle area (so old text still disappears reliably).

3) Make knockout placement deterministic
- Add a helper that builds canvas-space knockout bounds from OCR percentages + crop/full-canvas context.
- Keep a small configurable padding (x/y) for glyph overhang but avoid visible border effects.
- Keep z-order strict: `pdf_background` at back, knockout above it, editable text above knockout, trim guide on top.

4) Prevent stale/misleading masks
- Before creating a new knockout for a just-extracted region, clear overlapping old OCR knockout(s) in that same area to avoid stacked artifacts.
- Keep knockout objects non-selectable/non-evented and excluded from snapping interactions.

5) Validation checklist
- Re-test manual “Extract Text” on multiple words/lines and confirm old PDF text is fully hidden exactly where extracted.
- Re-test “Extract All Text” and confirm each extracted block hides the original text in place.
- Edit font, size, and color after extraction and verify no underlying original glyphs bleed through.
- Save/reload template and verify knockout alignment persists.

Technical details (for implementation):
- Root cause: coordinate-space mismatch introduced by dividing scene coords by zoom.
- Robust approach: compute knockout from OCR geometry, not from replacement text render metrics.
- No backend schema/auth changes required; this is frontend canvas-layer logic only.

# Print Workshop → Layered Design Editor (Photopea / Illustrator-style)

**Status:** Proposal / spec for review
**Author:** drafted with Claude
**Goal:** Let a user upload a design file, have the app **pull it apart into individual editable assets/layers** (text as real text, images as separate placeable images, vector shapes as paths), preserve the layer stack, and let everything be edited on the canvas — the way Photopea or Illustrator behaves — while staying integrated with templates, dielines, orders, and print-ready export.

---

## 1. The key reframe: the engine is already right

Print Workshop runs on **Fabric.js** (`fabric@^6.6.1`). Fabric is already an object-based editor: every text/image is a selectable, movable, layered object with a z-order. That is the same model Illustrator and Photopea use. **We do not need a new engine.**

What's missing is two things:

1. **Importers that *decompose* an uploaded file into objects/layers** — instead of today's behavior, which flattens an uploaded PDF into a single locked raster background (`pdf_background` in `TemplateEditor.tsx`) and then bolts editable text back on via AI/OCR (`decompose-design-image` edge function).
2. **A real Layers panel** — `CanvasObjectsPanel.tsx` already lists/selects/hides/deletes objects; it needs to become a true layer manager (drag-reorder, lock, rename, opacity, group).

So this is an **incremental build on the existing canvas**, not a rewrite.

---

## 2. Honest reality check (set expectations)

A 100%-faithful "any file → perfect editable layers" converter **does not exist in the browser**. Photopea is a multi-year WASM engine. Things that degrade on import: fonts you don't have installed/embedded, gradients, clipping masks, blend modes, live effects, overprint, and complex vector path geometry.

The achievable **80/20**:
- **SVG and PSD** decompose into true editable layers.
- **PDF/AI** give real editable **text** + separately-extracted **images**, with a **raster fallback** for complex vector art.
- **PNG/JPG** have no layers in the file at all — only AI segmentation can *guess* at separations.

We should be explicit in the UI about which parts came in editable vs. flattened, so a user is never surprised at print time.

---

## 3. What each format yields

| Format | Library / API | What we extract | Fidelity |
|--------|---------------|-----------------|----------|
| **SVG** | Fabric native `loadSVGFromString` | Every path, shape, group, and `<text>` as native editable Fabric objects | ⭐⭐⭐ Excellent (true vector) |
| **PSD** | `ag-psd` (new dep) | Each named layer → its own object; **text layers stay editable text** (`layer.text`); position, opacity, visibility, blend mode preserved | ⭐⭐⭐ Excellent (true layers) |
| **PDF / AI** | `pdfjs-dist@5` (already a dep) | Real text via `page.getTextContent()` (actual glyphs + font + transform — far better than OCR); embedded raster images via `getOperatorList()` / `OPS.paintImageXObject`; vector paths (hard) | ⭐⭐ Good for text+images; vector partial |
| **PNG / JPG** | existing `decompose-design-image` (AI) | One flat image; optional AI segmentation into pseudo-layers | ⭐ Limited (no real layers exist) |

> **AI files:** modern `.ai` files are PDF-compatible (a PDF wrapper around private Illustrator data). In practice we treat `.ai` as PDF and run it through the PDF importer. Native-only AI features won't survive.

---

## 4. Target architecture

### 4.1 Importer layer (new)
A new module `src/lib/import/` with one importer per format, all returning a **common intermediate shape** that maps cleanly onto Fabric objects:

```ts
// src/lib/import/types.ts
export interface ImportedLayer {
  kind: "text" | "image" | "path" | "group";
  name: string;                 // preserved layer/asset name
  // position/transform in inches (DPI-independent), converted to canvas px on add
  xIn: number; yIn: number; wIn: number; hIn: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;             // default editability policy
  // kind-specific payloads:
  text?: { value: string; fontFamily: string; fontSizePt: number; fill: string; weight?: string; style?: string; align?: string };
  imageDataUrl?: string;        // for image/path-rasterized layers
  svgString?: string;          // for native-vector paths
  children?: ImportedLayer[];   // for groups
}

export interface ImportResult {
  widthIn: number; heightIn: number;   // artboard size (drives template dims)
  bleedIn?: number;
  layers: ImportedLayer[];             // bottom-to-top
  warnings: string[];                  // "3 vector shapes flattened to raster", etc.
}
```

Importers:
- `importSvg(file): ImportResult`
- `importPsd(file): ImportResult`
- `importPdf(file): ImportResult`   ← also handles `.ai`
- `importImage(file): ImportResult` ← PNG/JPG, optional AI segmentation

A single `importDesignFile(file)` dispatches by MIME/extension.

### 4.2 Mapping to Fabric (reuse, don't reinvent)
A `layersToFabric(canvas, result, dpi)` helper converts `ImportedLayer[]` into Fabric objects using the **same conventions already in `TemplateEditor.tsx`**:
- text → `IText` with `name: editable_text | locked_text`, `_fontSizePt`, `locked`, `editable`
- image → `FabricImage` with `name: editable_image | locked_image | user_artwork`
- path → Fabric objects from `loadSVGFromString` (kept vector) or rasterized fallback
- group → Fabric `Group` (new: we don't use groups yet)
- z-order preserved by insertion order; `fixZOrder` keeps dieline/perf/trim on top

### 4.3 Layers panel upgrade (`CanvasObjectsPanel.tsx`)
Extend the existing panel into a real layer manager:
- **Drag to reorder** (maps to `canvas.moveObjectTo` / bring-forward/send-back)
- **Lock / unlock** toggle (already have `locked` convention)
- **Rename** (inline edit → `obj.name` / a new `_displayName`)
- **Opacity** slider per layer
- **Show/hide** (already exists)
- **Group / ungroup**
- **Editable-for-customer** toggle (the existing locked-vs-editable concept that drives "use" mode)

This single piece delivers most of the "feels like Photopea" perception and works on **everything already on the canvas**, regardless of importer.

### 4.4 Data-model / storage implications
- The Fabric scene is already persisted as `print_templates.canvas_data` (JSON). Decomposed layers are just more Fabric objects → **no schema change needed** for basic support.
- **Original uploads** should still be stored (we already upload source PDFs to the `print-files` bucket for print-ready export). Extend to store the original PSD/SVG/AI/image too, so we can re-decompose or fall back.
- Embedded images extracted from PDF/PSD must be uploaded to `print-files` (blob URLs are ephemeral — `TemplateBuilder.handleSave` already converts `blob:` images to stored URLs; reuse that path).
- Consider a `source_assets` JSON column (or reuse existing) to record provenance + warnings per template. Optional, phase 4+.

### 4.5 Print-ready export implications (`printPdfExport.ts`)
- Decomposed **text** already exports as vector text (jsPDF) or rasterized fallback — no change.
- Decomposed **images** already export. Newly-supported **paths/lines** need export branches (we just added a `line` branch for perf lines; vector paths would need a `path` branch or a rasterize-on-export fallback).
- **Groups**: flatten on export (iterate children).
- Big win: importing real PDF **text** instead of OCR means exports keep crisp vector text positioned exactly as the source intended.

---

## 5. Phased delivery plan

Each phase ships independently and is testable on its own.

### Phase 0 — Layers panel upgrade *(start here; no importer risk)*
Turn `CanvasObjectsPanel` into a real layer manager: drag-reorder, lock, rename, opacity, group/ungroup.
**Why first:** highest perceived value, works on all existing content, de-risks nothing-to-import. **Effort:** S–M.

### Phase 1 — SVG import
`importSvg` via Fabric `loadSVGFromString` → fully editable vector objects.
**Why:** smallest code, biggest "whoa," true Illustrator-like result. **Effort:** S.

### Phase 2 — PDF/AI real-text + image import
Replace/augment the flatten-then-OCR flow: on PDF upload, run `getTextContent()` for real text objects and extract embedded images as separate layers; keep a rasterized background only as a fallback for un-extractable vector.
**Why:** PDFs/AI are your most common print files; this is the core of the vision. **Effort:** L (PDF internals are fiddly). Builds on existing `pdfjs-dist` usage.

**Status — v1 shipped (text):** "Extract PDF Text" button in `TemplateEditor` uses `page.getTextContent()` to pull real, live text into locked editable layers with knockouts, placement-mapped from the on-canvas `pdf_background` rect (works regardless of crop/fit). Falls back to a hint to use AI "Extract All Text" when the PDF text is outlined.
**Still TODO (Phase 2.1):** embedded raster image extraction via `getOperatorList()` / `OPS.paintImageXObject`; merging fragmented text runs per line; recovering text color (not exposed by `getTextContent`, so v1 imports as black).

### Phase 3 — PSD import
Add `ag-psd`; map each layer → object, text layers → editable text, preserve names/opacity/visibility/blend.
**Why:** true Photoshop-style layers. **Effort:** M.

### Phase 4 — PNG/JPG + AI segmentation
Flat image import (trivial) plus optional AI-assisted segmentation reusing `decompose-design-image`/`generate-design-image`.
**Effort:** S for flat; M for segmentation.

### Phase 5 — Hardening
Vector path export branch, blend-mode approximation, font-substitution UX, "what got flattened" warnings surfaced in UI, group export, performance on large files.
**Effort:** ongoing.

**Suggested first sprint:** Phase 0 + Phase 1 together → the editor immediately *feels* layered and can import editable vector, before tackling the harder PDF/PSD parsers.

---

## 6. Risks & mitigations
- **Font availability** — imported text references fonts the browser may not have. *Mitigation:* reuse existing Google-Fonts loader + `PLATFORM_FONT_SUBSTITUTES` map in `TemplateEditor.tsx`; show a "font substituted" note.
- **Vector path fidelity (PDF)** — clean editable vectors from arbitrary PDFs is the hardest part. *Mitigation:* extract text+images cleanly; rasterize the remaining vector as a background layer rather than producing broken paths.
- **Performance** — big PSD/PDF files with many layers can be heavy in-browser. *Mitigation:* lazy-rasterize, cap layer count with a warning, do heavy parsing in a worker.
- **Print correctness** — decomposed ≠ print-faithful. *Mitigation:* always keep the original file in storage; offer "print from original" vs "print from edited" (the export already branches on `source_pdf_path`).
- **Bundle size** — `ag-psd` adds weight. *Mitigation:* dynamic `import()` only when a PSD is uploaded (the codebase already dynamic-imports heavy libs).

---

## 7. New dependencies
- `ag-psd` — PSD parsing (Phase 3). Dynamic-imported.
- *(No new dep for SVG — Fabric native. No new dep for PDF — `pdfjs-dist` already present.)*

---

## 8. Decisions (locked in)
1. **Editability default:** imported layers come in **locked by default**. Admins unlock specific layers/zones to expose them to customers (matches today's "locked-by-default, unlock zones" model).
2. **Who decomposes:** **admins / template-builders only.** The importer + Layers panel live in the template builder (`TemplateBuilder` / `TemplateEditor` `mode="edit"`), **not** in the customer order flow (`mode="use"`).
3. **Print path:** print from the **edited canvas** (decomposed + customer edits). The original upload is still stored for fallback/re-decompose, but it is not the print source.
4. **v1 layer scope:** **named, reorderable, lockable, editable objects + per-layer opacity & visibility.** **No** blend modes, masks, or adjustment layers in v1 — deferred to a later phase.

---

## 9. TL;DR
You already have the editor engine (Fabric). The work is: **(a)** upgrade the objects panel into a real Layers panel, and **(b)** add per-format importers that decompose uploads into layers — SVG and PSD give true layers, PDF/AI give real text + images with a raster fallback, PNG/JPG are inherently flat. Start with the Layers panel + SVG import for the fastest "it feels like Illustrator" moment, then tackle PDF and PSD.

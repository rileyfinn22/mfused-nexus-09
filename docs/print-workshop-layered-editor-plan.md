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

---

## 10. Phase 6+ — feature backlog (from the OnPrintShop / quadlabels reference)

The quadlabels "Live Design Studio" is **OnPrintShop's** licensed web-to-print Design Studio (Angular SPA on CloudFront + PHP backend + direct-to-S3 uploads + OpenAI). It's the same *class* of system we're building (Fabric-class canvas designer); the gap is **breadth**, not architecture. Worth pulling into our build, in rough priority:

1. **Shapes library** *(small)* — ✅ **shipped (v1):** rectangle, rounded-rect, circle, ellipse, line, triangle, star, hexagon via a "Shapes" category in the grouped toolbar. Added locked-by-default (outline style), recolour comes with the property panel (UI Stage B). *Still TODO:* octagon + extra star variants, and a `circle/ellipse/triangle/polygon` branch in the hybrid PDF export (`printPdfExport.ts`) so non-rect/line shapes print when a template also has a source PDF (canvas-only export already rasterizes them).
2. **QR code generator** *(small)* — URL / text / phone / email / WiFi / vCard payloads → QR added as a vector/image object. Very common label need. (`qrcode` lib or an edge function.)
3. **Clip-art / icon library** *(medium)* — searchable categorized gallery of pre-approved SVG art; click to place as an editable layer. (We already have `IconPickerDialog` — extend it into a real categorized library.)
4. **Curve / arc text** *(medium)* — text on a path (the reference ships preset arcs: circle, semicircle, wave, ribbon, spiral). High-impact for labels/badges.
5. **Preflight on export** *(medium)* — before accepting a print PDF, check font embedding, overprint, ICC profile, and that document dimensions match the template. Surfaces production problems early; this is the biggest *production-grade* gap.
6. **Finishes preview** *(medium)* — Spot UV, Emboss, Deboss, Foil as a per-object flag with a preview overlay (drives a separate spot layer in the print file). Premium upsell.
7. **3D fold preview** *(large)* — for boxes/bags, fold the flat dieline into a 3D proof. We already generate the dieline geometry, so the data exists.
8. **Image filters & adjustments** *(medium)* — brightness/contrast/saturation/hue + preset color matrices (sepia, vintage, etc.). Fabric has filter support built in.
9. **Predefined text snippets** *(small)* — admin-curated reusable text blocks (ingredients, warnings, compliance copy) a customer can drop in.

Out of scope for us (deliberately): calendar/month-layout/photobook flows, social-media image imports — these are OnPrintShop product lines we don't need.

---

## 11. UI/UX redesign — adopt the three-zone web-to-print layout

**Problem:** the current `TemplateEditor` toolbar is a single flat row of ~15 buttons (Draw Text, Draw Locked, Image BG, PDF BG, Locked Image, Editable Image, PDF Art, Import SVG, four AI dialogs, Draw Mask, Perf Line, Extract Editable/Locked, Extract PDF Text, Extract All Text). It's overloaded — especially the AI buttons sitting at the same level as primitives — and it doesn't scale as we add Shapes/QR/Clip-art/Curve-text.

**Target:** the same **three-zone layout** OnPrintShop/quadlabels uses, which is the web-to-print convention:

```
┌──────────────────────────────────────────────────────────────┐
│  TOP BAR: undo/redo · zoom · grid · layers · save · preview   │  ← actions only
├──────────┬───────────────────────────────────────┬───────────┤
│  LEFT    │                                       │  RIGHT    │
│  RAIL    │            CANVAS                      │  PROPERTY │
│ (add):   │       (with bleed/trim/dieline)       │  PANEL    │
│  Text    │                                       │ (context  │
│  Images  │                                       │  for the  │
│  Shapes  │                                       │  selected │
│  ClipArt │                                       │  object): │
│  Upload  │                                       │  font,    │
│  QR      │                                       │  color,   │
│  Bg      │                                       │  size,    │
│  Dieline │                                       │  align,   │
│  Layers  │                                       │  lock,    │
│          │                                       │  opacity, │
│          │                                       │  arrange  │
└──────────┴───────────────────────────────────────┴───────────┘
```

Principles:
- **Left rail = "add things."** Vertical icon rail of *categories*; clicking one opens a panel (Text, Images, Shapes, Clip Art, Upload, QR, Background, Dieline tools). Each panel holds the sub-actions currently crammed into the top toolbar.
- **Top bar = "actions only."** Undo/redo, zoom, grid/margin toggle, Layers toggle, Save, and Preview/Continue. Nothing that *adds* content.
- **Right panel = "properties of the selection."** Contextual: shows font/size/color/align for text, crop/filters/replace for images, fill/stroke for shapes, plus the universal lock / opacity / arrange (bring-forward, send-back) / align controls. Empty state when nothing is selected.
- **Demote AI.** AI is *not* a top-level category. Surface AI actions **contextually**: "AI edit / remove background / upscale" live in the **image** property panel; "AI text (rephrase/fix spelling)" lives in the **text** property panel; generative "create image" lives inside the **Images** add-panel. This alone removes ~4 buttons from the main bar.
- **Mode-aware.** In **`use` (customer order) mode**, collapse the left rail to just what customers may do (edit unlocked text, upload their art) — matching decision #2. The full rail is **`edit` (admin) mode** only.

Implementation note: this is a **layout refactor of `TemplateEditor.tsx`**, not an engine change — the same Fabric actions get reorganized into `LeftToolRail`, `TopActionBar`, and a contextual `PropertyPanel`. The `CanvasObjectsPanel` (Layers) becomes the "Layers" entry in the left rail. Best done **before** Phase 6 features land, so Shapes/QR/Clip-art/Curve-text slot into the left rail instead of growing the flat toolbar further.

---

## 12. Core differentiator: customer self-service template ordering ⭐

**This is the thing the OnPrintShop/quadlabels flow does *not* give end customers, and it is the heart of our product — so it must stay first-class as the editor grows.**

The model: an **admin builds a template once**, assigns it to one or more companies, and then **those companies' customers can self-serve** — open the template, edit only the parts we unlocked, proof it, and **place (and re-order) on demand**, with no admin in the loop per order.

This already exists in skeleton form and must be **preserved and strengthened**, never regressed, as we add importers, the new UI, and Phase 6 features:
- **Template → company assignment:** `print_template_companies` + `is_global` (who can see/order a template). Saving a template auto-creates/syncs a matching `products` row per assigned company.
- **Customer edit surface:** `TemplateEditor` `mode="use"` — only `editable`/unlocked layers are interactive; locked layers (and dielines, knockouts, perf lines) are non-selectable. This is exactly why **"locked by default" (decision #1)** matters: the admin decides the customer's editable surface.
- **Proof + order:** `OrderPanel` → `PrintCart` → `PrintCheckout`, with the edited canvas captured and a print-ready PDF generated client-side. `design_saves` records each customer design (canvas + thumbnail + print file) for liability/reuse.
- **Re-order on demand:** `WorkshopOrders` ("My Orders") + saved designs let a customer reorder or tweak a past design without starting over.

Design rules so this differentiator survives the rebuild:
1. **Every editor feature must declare its customer story.** For each new capability (shapes, QR, curve text, clip art, AI), decide explicitly whether it's **admin-only** (template construction) or **also customer-facing** (per-order personalization). Default new tools to **admin-only**; opt specific ones into `use` mode deliberately.
2. **The UI redesign (§11) is mode-aware.** `use` mode shows a **stripped left rail** — only the customer-permitted actions (edit unlocked text, upload/replace their own art/logo, maybe QR) — plus an unmistakable **"edit the highlighted fields → Add to cart"** path and a **reorder** entry. The full rail is `edit` (admin) mode only.
3. **Locked/unlocked is the contract.** The per-layer lock in the Layers panel is *the* mechanism that defines what a customer can touch. Importers set imported layers locked by default; the admin unlocks the few fields meant for personalization.
4. **On-demand means no admin bottleneck.** Pricing (`preset_price_per_unit`), proofing, and print-file generation must complete **without** an admin step for preset-priced templates. (Quote-based templates can still route to admin — that's a deliberate exception, not the default.)
5. **Don't let production features gate self-service.** Preflight (§10.5) runs at order time and should *warn/guide* the customer, not silently block a valid order.

In short: OnPrintShop is an admin/operator tool with a customer personalize step bolted on; **ours is a customer self-service ordering platform** where the admin's job is to define a safe, editable template and then get out of the way. Keep that asymmetry visible in every phase.


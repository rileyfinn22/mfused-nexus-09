# Architecture — Print Workshop Artboard Editor

Derived from `.forge/prd.md`. Labels-first. Inverts the current "canvas = template" model into a free **artboard** with a **movable dieline frame** that defines the print region at the template's fixed physical size.

---

## 1. System overview

```
                         ┌──────────────────────────────────────────────┐
                         │                PrintWorkshop                  │
                         │   (routing: browse / build / use / checkout)  │
                         └───────────────┬───────────────┬──────────────┘
                              admin/build │               │ customer/use
                                          ▼               ▼
                         ┌────────────────────────┐  ┌────────────────────────┐
                         │     TemplateBuilder     │  │   Use-view (customer)  │
                         │  size field · assign ·  │  │  edit unlocked · cart  │
                         │  price · save           │  │                        │
                         └───────────┬─────────────┘  └───────────┬────────────┘
                                     └──────────┬─────────────────┘
                                                ▼
                         ┌──────────────────────────────────────────────┐
                         │                ArtboardEditor                  │  ← rework of TemplateEditor
                         │  ┌──────────┐  ┌─────────────┐  ┌───────────┐ │
                         │  │ LeftRail │  │ ArtboardCanvas│ │ Properties│ │
                         │  │ (tools)  │  │  (Fabric +    │ │  + Layers │ │
                         │  └──────────┘  │   viewport)   │ └───────────┘ │
                         │                └──────┬────────┘               │
                         └───────────────────────┼─────────────────────────┘
                                                 │ owns ↓
            ┌────────────────────┬───────────────┼────────────────┬──────────────────┐
            ▼                    ▼               ▼                ▼                  ▼
   ┌────────────────┐  ┌──────────────────┐ ┌───────────┐ ┌────────────────┐ ┌──────────────┐
   │   Importers    │  │  HiResRender     │ │ Dieline   │ │ Layers/        │ │  PrintExport │
   │ pdf/svg/psd/img│  │  Manager         │ │ Frame     │ │ Properties     │ │ (frame region│
   │ → layers       │  │ (zoom→re-raster) │ │ (object)  │ │ (lock/edit)    │ │  @ true size)│
   └────────────────┘  └──────────────────┘ └───────────┘ └────────────────┘ └──────────────┘
                                                 │
                                                 ▼
                                    Supabase (print_templates, storage,
                                    print_template_companies, design_saves, orders)
```

## 2. Coordinate systems (the spine of the rework)

- **Artboard space** — the Fabric *scene* coordinate system, in px at `INTERNAL_DPI` (150). Large and unbounded; the pasteboard is just empty scene area. **All persisted objects live here.** This replaces today's "scene == print area."
- **Viewport** — Fabric `viewportTransform` (zoom + pan). Pure view; never mutates object coords. Already in place (scroll-zoom / middle-drag pan / Fit).
- **Print/output space** — the dieline-frame region mapped to the template's **physical size** (`width_inches × height_inches`) at `EXPORT_DPI` (600). The export transform = output = (frameRegion → physical inches).

**Print scale rule (confirmed):** physical size is fixed by `width_inches/height_inches`. Moving/scaling the dieline frame changes *which art is captured and at what scale*, never the physical size (that changes only via the numeric size field).

## 3. Components & responsibilities

- **ArtboardEditor** (rework of `TemplateEditor.tsx`) — composition root: owns the Fabric canvas, wires LeftRail / ArtboardCanvas / Properties+Layers, exposes mode (`edit`/`use`).
- **ArtboardCanvas** — Fabric init in artboard space, pasteboard, pan/zoom, fit-to-content, high-res render hook, serialization (excludes guides + frame internals appropriately).
- **DielineFrame** — first-class Fabric object (trim/bleed/safe) at fixed physical size; movable/scalable; numeric resize; persisted transform; `getRegion()` for export.
- **Importers** — PDF/SVG/PSD/image → decomposed editable layers placed at natural size in artboard coords (refactor of existing import fns). PDF registers a HiRes source.
- **HiResRenderManager** — keeps rasterized PDF/PSD crisp by re-rendering at a DPI tied to zoom (debounced, memory-capped). SVG/vector bypasses.
- **LayersPanel / PropertiesPanel** — per-layer + frame lock/unlock (the customer-edit contract), opacity, arrange, align, fill/stroke/font.
- **PrintExport** (refactor of `printPdfExport.ts`) — renders only the dieline-frame region at physical size × `EXPORT_DPI`.
- **Host flows** — `TemplateBuilder` (admin: size field, assign, price, save), `PrintWorkshop` use-view (customer: edit unlocked, cart). Templates-only.

## 4. Tech-stack decisions

- **Fabric.js v6** stays the engine (objects, selection, viewportTransform). Already on zoom-based rendering.
- **pdf.js** is the sharpness lever: it rasterizes a PDF page to any scale crisply → drive re-rasterization by zoom (ADR-001). No third-party viewer.
- **ag-psd** stays dynamic-imported.
- **Supabase** storage keeps original PDF/PSD/SVG/image for hi-res re-render + print; `print_templates.canvas_data` holds artboard JSON; add a persisted dieline-frame transform (ADR-003).
- **No coordinate-DPI change** (would break saved data); pasteboard/frame added via artboard space + viewport, preserving `INTERNAL_DPI=150` object coords.

## 5. Risks

- **Back-compat:** legacy templates must open unchanged → migration synthesizes a dieline frame from the old print area (ADR-003).
- **Export refactor** is the highest-risk change (print correctness) → contract + golden-size tests (PrintExport contract).
- **Re-rasterization performance/memory** → debounce, clamp DPI, cap cache (ADR-001).
- **Concurrent Lovable edits** to editor files → land changes in tight, contract-bounded modules; merge carefully.

Run `/plan` to break this into tasks.

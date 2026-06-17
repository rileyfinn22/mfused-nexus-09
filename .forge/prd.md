# PRD — Print Workshop Artboard Editor Rework

**Status:** Draft for architecture
**Owner:** Riley (Vantage / VibePKG)
**Surface:** `/print-workshop` (admin builder + customer order), in `mfused-nexus-09`
**Stack:** React + Fabric.js v6 + Supabase + `pdfjs-dist` + `ag-psd`, deployed via Lovable from GitHub `main`

---

## 1. Problem statement

The Print Workshop editor today treats the **canvas as the template**: a fixed, small print area that artwork is forced into. Designers can't work the way they do in Adobe Illustrator / the Quad "Live Design Studio":

- Uploaded files are sized/cropped to the template instead of placed at natural size, so a full artwork sheet looks wrong and can only be moved as one locked blob.
- The canvas is small and document-locked; there's no free workspace (pasteboard) to arrange assets.
- Raster previews blur on deep zoom-in (fixed-resolution backing).
- There's no way to position a **trim/cut boundary** over the art — the template edge *is* the world.

**Goal:** invert the model into a true **artboard**. The canvas is a large free workspace; designers upload art at natural size and high resolution; a **movable, scalable dieline/trim frame** is placed over the art to define exactly what prints, at the template's true physical size. Admins build + lock these templates; customers open them, edit only what's unlocked, and order.

---

## 2. Personas

- **Designer / Admin (Vibe admin)** — builds reusable templates: uploads artwork, decomposes into editable layers, positions the dieline frame, locks/unlocks elements, assigns templates to companies, sets price, saves.
- **Customer (company user)** — opens a template provided to their company, edits only the unlocked fields/art, proofs, adds to cart, and orders/re-orders. Cannot create from scratch (templates-only).

---

## 3. Core concept — the artboard model

- **Artboard:** a large, pannable/zoomable workspace (the Fabric canvas) much bigger than any single label, with a neutral pasteboard area around the work.
- **Artwork layers:** uploaded files (PDF/SVG/PSD/image) are decomposed into editable layers placed at natural size on the artboard; individually selectable/movable, not a single locked blob.
- **Dieline frame:** a first-class object representing the **trim/cut boundary**. It defaults to the template's configured physical size (e.g. 2.0″ × 1.0″) and renders the trim line, bleed, and safe area. It is **movable and scalable on the artboard** to position it over the art.
- **Fixed print size (decision):** the dieline frame **always represents the template's set physical dimensions**. Scaling/moving the frame chooses *which art falls inside and at what scale* — it does **not** change the physical print size. Physical size is only changed via an explicit numeric size field, not by free-dragging.
- **Print output:** exactly the region inside the dieline frame, rendered at the template's real physical dimensions and target DPI (print resolution), independent of on-screen zoom.

---

## 4. Requirements (Given / When / Then)

### Artboard & navigation
- **R1** — Given the editor is open, When it loads, Then the canvas is a large artboard that **frames all content** (artwork + dieline) centered, not zoomed into the template.
- **R2** — Given content on the artboard, When the user scrolls / middle-drags / uses Fit·+·−, Then the view zooms toward cursor and pans smoothly; Fit re-frames all content.
- **R3** — Given the user zooms in deeply, Then raster artwork (rasterized PDF/PSD) stays **sharp** — content is re-rendered/served at sufficient resolution for the current zoom (vector PDF render or progressive re-rasterization), not a fixed low-res backing.

### Upload & decompose
- **R4** — Given a designer uploads a file (PDF/SVG/PSD/PNG/JPG), When it loads, Then it is placed on the artboard at **natural size** and decomposed into individually editable/selectable layers (text → editable text, raster → image layers, vector → paths), locked by default.
- **R5** — Given a multi-element artwork, When placed, Then the designer can select, move, scale, copy, and delete **individual assets** — not only the whole file.

### Dieline frame
- **R6** — Given a template with a configured size, When the editor opens, Then a **dieline frame** object appears showing trim + bleed + safe lines at that physical size.
- **R7** — Given the dieline frame, When the designer drags/scales/positions it, Then it moves over the art; the trim/bleed/safe guides move with it; physical print size is unchanged.
- **R8** — Given the designer wants a different physical size, When they enter new dimensions in a numeric size field, Then the frame resizes to the new true physical size (with confirm) and the export size updates.
- **R9** — Given the dieline frame position/scale, When the template is saved, Then the frame transform (position, on-artboard scale) **persists** and reloads identically.

### Lock / unlock (admin → customer contract)
- **R10** — Given any layer or the dieline frame, When the admin toggles lock state in Properties, Then locked elements are non-editable by customers and unlocked elements are editable; this persists with the template.
- **R11** — Given a customer opens a template (use mode), Then only unlocked elements are interactive; the dieline frame and locked art are fixed.

### Templates & ordering
- **R12** — Given an admin saves a template, When assigned to companies (or global) with a price, Then it appears in those customers' Shop.
- **R13** — Given a customer in Shop, When they open a template → edit unlocked parts → Add to cart → Checkout, Then the order captures their edited design and a print-ready file.
- **R14** — Given a placed order, When re-ordering, Then the customer can reopen and tweak a past design.

### Print output
- **R15** — Given a finished design, When exported/submitted, Then the print-ready file contains **only the region inside the dieline frame**, at the template's true physical dimensions and print DPI, with bleed, trim marks, and any perf lines — matching the on-screen proof.
- **R16** — Given art that extends beyond the frame (pasteboard), Then it is excluded from the print output (used only as working/bleed material as appropriate).

---

## 5. Non-functional requirements

- **NFR1 — Sharpness:** artwork legible/crisp from Fit through deep zoom (target: no visible softening at ≤ 800% on vector/high-res sources).
- **NFR2 — Performance:** pan/zoom stays smooth (~60fps) with a decomposed multi-layer template; heavy re-rasterization is debounced/off-main-thread where feasible.
- **NFR3 — No data regression:** existing saved templates continue to open and print correctly (migration/back-compat path for the new dieline-frame model).
- **NFR4 — Print fidelity:** exported physical dimensions are exact (±0); on-screen proof ≈ printed output.
- **NFR5 — Roles:** admin-only capabilities never exposed to customers; lock/unlock is the enforced contract.
- **NFR6 — Bundle:** heavy libs (`ag-psd`) stay dynamically imported.

---

## 6. Data model (deltas)

- `print_templates` — add persisted **dieline frame transform** (artboard position + scale) and ensure physical `width_inches`/`height_inches`/`bleed_inches` remain the source of truth for print size. Artwork layers persist in `canvas_data` (Fabric JSON) in **artboard coordinates** (not template-relative).
- Keep `source_pdf_path` (and store original PSD/SVG/image) for high-res re-render and print export.
- `print_template_companies`, `products`, `design_saves`, `workshop_orders` — unchanged in shape; `design_saves`/order capture the edited artboard + the dieline frame region used for print.
- Open: whether a separate `artboard` metadata blob (pasteboard size, frame transform, print DPI) lives as its own column vs inside `canvas_data`.

---

## 7. Module design (target)

- **ArtboardCanvas** — Fabric setup, pasteboard, pan/zoom, high-res render strategy, coordinate system (artboard space).
- **DielineFrame** — the movable/scalable trim/bleed/safe frame object; fixed physical size; numeric resize; serialization.
- **Importers** (existing, refactored) — PDF (vector/high-res) · SVG · PSD · image → decomposed layers placed in artboard coords at natural size.
- **LayersPanel / PropertiesPanel** (existing) — per-layer + frame lock/unlock, opacity, arrange, align, fill/stroke, font.
- **LeftToolRail** (existing) — Upload · Text · Shapes · Images · AI · Dieline · Extract.
- **PrintExport** — render the dieline-frame region at physical size/DPI (refactor of `printPdfExport.ts`).
- **Host flows** — `TemplateBuilder` (admin) and `PrintWorkshop` use-view (customer), templates-only.

---

## 8. Release phases

- **Phase A — Artboard foundation:** pasteboard + pan/zoom + high-res rendering + frame-to-content. Canvas decoupled from template size.
- **Phase B — Dieline frame object:** movable/scalable trim/bleed/safe frame at fixed physical size; numeric resize; persistence.
- **Phase C — Print = frame region:** export refactor so output is exactly the frame region at true size/DPI; proof = print.
- **Phase D — Decompose-at-natural-size + per-asset editing polish:** ensure uploads land as individual editable layers in artboard space.
- **Phase E — Back-compat + role/lock hardening + box/bag dielines (later).**

---

## 9. Out of scope (this rework)

- Box/bag multi-panel **fold dielines** (labels first; deferred to a later phase).
- From-scratch **custom orders** (templates-only).
- Server-side PDF rendering, spot-color separations, true CMYK pipeline (future).
- The unrelated `/artwork` section (separate internal feature).

---

## 10. Open assumptions

- "Fixed physical size, frame scales art" is the print-size rule (confirmed).
- Labels-first scope (confirmed).
- High-res sharpness achieved via pdf.js vector/zoom-aware rendering and/or progressive re-rasterization (to be decided in architecture).
- Existing templates can be migrated by treating their current print-area coords as the initial dieline-frame region.
- Lovable continues to deploy `main`; concurrent edits to editor files require careful merges.

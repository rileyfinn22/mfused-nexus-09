

## Print Workshop Enhancement Plan

### Current State
The Print Workshop currently works as a **template editing system** where Vibe Admins upload a source PDF (dieline), extract text fields via AI OCR, and mark them as editable/locked. Customers then fill in the editable fields. It has:
- Canvas editor with text tools, image upload, AI image generation, masking
- Three product types (label, box, bag) but no structural differences between them
- Manual dimension entry (width/height/bleed) with no presets
- Image upload exists (locked/editable images, Image BG, PDF BG) but is admin-only ("edit" mode)
- Customer "use" mode only allows editing highlighted text fields and replacing editable images

### What's Missing (Your Concerns)
1. **No preset sizes** -- admins manually enter dimensions every time
2. **No auto-generated dielines** -- bags/boxes get the same flat rectangle as labels
3. **Customers can't upload artwork** -- "use" mode is text-edit only; no drag-and-drop art placement
4. **No Sinalite-style workflow** -- where you pick a product, pick a size, get a dieline template, then place artwork into designated zones

### Proposed Plan

#### 1. Preset Size Library
Add a database-driven preset sizes system so admins and users can pick from standard packaging sizes instead of typing dimensions manually.

- Create a `print_presets` table: `id`, `product_type` (label/box/bag), `name` (e.g. "4x6 Label", "12x12x6 Mailer Box"), `width_inches`, `height_inches`, `bleed_inches`, `dieline_svg` (optional vector dieline path), `panel_zones` (JSON defining artwork placement areas for multi-panel products like boxes/bags)
- Seed with common industry sizes for labels, boxes, and bags
- Add a size picker dropdown in the TemplateBuilder that auto-fills dimensions when a preset is selected
- Show preset picker in the storefront when a customer starts a new order

#### 2. Auto-Generated Dieline Overlays for Boxes & Bags
Unlike flat labels, boxes and bags have fold lines, panels, and flaps. Generate visual dieline guides on the canvas.

- For boxes: generate fold lines, glue flap, and panel boundaries based on L x W x H dimensions
- For bags: generate front/back panels, side gussets, and bottom fold
- Render these as non-selectable, non-printable guide lines on the Fabric canvas (similar to the existing trim guide)
- Define "artwork zones" -- regions where customers can place their art (e.g., front panel, back panel, side panels)

#### 3. Customer Artwork Upload & Placement
Enable customers in "use" mode to upload their own artwork files and position them within designated zones.

- Add an "Upload Artwork" button to the "use" mode toolbar
- Allow drag-and-drop of images (PNG, JPG, SVG) and PDFs onto the canvas
- Uploaded art is constrained/snapped to the designated artwork zones
- Add basic transform controls: scale, rotate, position within zone
- Support "fill zone" and "fit zone" placement modes

#### 4. Storefront Flow Redesign (Sinalite-style)
Restructure the customer journey: **Pick Product Type → Pick Size → Get Dieline → Place Art → Order**.

- Step 1: Customer picks product type (label, box, bag) from storefront categories
- Step 2: Size selector shows preset sizes with visual previews and a "Custom Size" option
- Step 3: Canvas loads with the auto-generated dieline and artwork zones highlighted
- Step 4: Customer uploads art, positions it in zones, edits text fields
- Step 5: Add to cart and checkout (existing flow)

### Technical Details

**New table: `print_presets`**
```sql
CREATE TABLE print_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL DEFAULT 'label',
  name TEXT NOT NULL,
  width_inches NUMERIC NOT NULL,
  height_inches NUMERIC NOT NULL,
  depth_inches NUMERIC DEFAULT 0,
  bleed_inches NUMERIC DEFAULT 0.125,
  panel_zones JSONB DEFAULT '[]',
  dieline_data JSONB DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**panel_zones JSON structure** (defines where art goes):
```json
[
  { "name": "Front Panel", "x": 0.125, "y": 0.125, "w": 4, "h": 6, "required": true },
  { "name": "Back Panel", "x": 4.375, "y": 0.125, "w": 4, "h": 6, "required": false }
]
```

**Dieline rendering**: A new `generateDieline()` utility that takes product_type + dimensions and returns Fabric.js objects (dashed lines for folds, solid lines for cuts) to overlay on the canvas.

**Files to create/modify**:
- `supabase/migrations/` -- new `print_presets` table + seed data
- `src/lib/dielineGenerator.ts` -- generates fold/cut lines for boxes and bags
- `src/components/print-workshop/SizePresetPicker.tsx` -- preset selection UI
- `src/components/print-workshop/ArtworkZoneOverlay.tsx` -- visual zone indicators
- `src/components/print-workshop/TemplateEditor.tsx` -- add artwork upload to "use" mode, render dieline guides and zones
- `src/components/print-workshop/TemplateBuilder.tsx` -- integrate preset picker
- `src/components/print-workshop/WorkshopStorefront.tsx` -- add guided flow for new orders
- `src/pages/PrintWorkshop.tsx` -- wire up new flow steps

### Implementation Order
1. Preset sizes table + picker UI
2. Dieline generator for boxes/bags
3. Artwork upload in "use" mode (customer-facing)
4. Artwork zone system (snap-to-zone, constrain)
5. Storefront flow redesign

This is a significant feature set. We can tackle it incrementally, starting with presets and customer artwork upload (the most impactful pieces), then layering on dieline generation and the full guided flow.


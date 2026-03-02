

## Print Workshop - On-Demand Label Printing

### Overview
A new "Print Workshop" section accessible to Vibe Admins where they can create label templates with locked/editable zones, customize them on demand, and generate print-ready files that flow into the existing order system.

### Architecture

```text
┌─────────────────────────────────────────────────┐
│                 Print Workshop                   │
├──────────────┬──────────────────────────────────┤
│  Template    │                                   │
│  Browser     │   Label Canvas Editor             │
│              │   ┌─────────────────────────┐     │
│  ☐ Compliance│   │  [LOCKED] Brand Logo    │     │
│  ☐ Nutrition │   │  [LOCKED] Layout Frame  │     │
│  ☐ Custom    │   │                         │     │
│              │   │  [EDITABLE] Lot #: ___  │     │
│              │   │  [EDITABLE] Date: ___   │     │
│              │   │  [EDITABLE] THC %: ___  │     │
│              │   └─────────────────────────┘     │
│              │                                   │
│              │   Material: [Matte ▼]             │
│              │   Quantity: [____]                 │
│              │   Price: $0.12/ea = $120.00        │
│              │   [Generate Print File & Order]    │
└──────────────┴──────────────────────────────────┘
```

### Database Schema

**`print_templates`** - Master label templates created by admins
- `id`, `company_id`, `name`, `description`, `product_type` (label, box, bag)
- `width_inches`, `height_inches`, `bleed_inches`
- `canvas_data` (JSONB - stores Fabric.js canvas state with locked/editable flags)
- `thumbnail_url`, `preset_price_per_unit`, `material_options` (JSONB array)
- `created_by`, `created_at`, `updated_at`
- RLS: vibe_admin only

**`print_orders`** - Orders generated from the workshop
- `id`, `company_id`, `print_template_id`, `template_name`
- `canvas_data` (JSONB - snapshot of the customized design)
- `print_file_url` - generated print-ready PDF
- `material`, `quantity`, `price_per_unit`, `total`
- `status` (draft, pending_quote, quoted, approved, in_production, completed)
- `quoted_price`, `quoted_by`, `quoted_at`
- `order_id` (FK to orders table, created when finalized)
- `created_by`, `created_at`
- RLS: vibe_admin only

**Storage**: New `print-files` bucket for generated print PDFs and template assets.

### Frontend Implementation

**New dependency**: `fabric` (Fabric.js) - canvas library for the label editor with object locking, layering, and JSON serialization.

**New pages/components**:

1. **`src/pages/PrintWorkshop.tsx`** - Main page with two modes:
   - **Browse mode**: Grid of available templates filtered by company, with thumbnails and descriptions
   - **Editor mode**: Full canvas editor loaded when a template is selected

2. **`src/components/print-workshop/TemplateEditor.tsx`** - Fabric.js canvas wrapper
   - Loads template `canvas_data` and renders objects
   - Objects with `locked: true` are non-editable (brand elements, layout frames)
   - Objects with `locked: false` are editable (text fields for dates, lot numbers, percentages)
   - Editable text fields highlighted with a subtle border/glow
   - Toolbar for font size, bold/italic on editable text only

3. **`src/components/print-workshop/TemplateBuilder.tsx`** - Admin tool to create templates
   - Upload background artwork/dieline
   - Add text fields and mark them as locked or editable
   - Set label dimensions and bleed
   - Configure material options and preset pricing

4. **`src/components/print-workshop/OrderPanel.tsx`** - Right sidebar
   - Material dropdown (from template's `material_options`)
   - Quantity input
   - Auto-calculated price if preset, or "Request Quote" button if not
   - "Generate Print File" button that exports canvas to PDF with proper dimensions/bleed

5. **Print file generation**: Client-side PDF generation using existing `jspdf` dependency
   - Export Fabric.js canvas at print resolution (300 DPI)
   - Add crop marks and bleed area
   - Upload to `print-files` storage bucket

**Navigation**: Add "Print Workshop" to `vibeAdminNavigationItems` in AppSidebar with a `Printer` icon.

**Route**: `/print-workshop` wrapped in `DashboardLayout`.

### Workflow

1. Admin creates a label template in the Template Builder (uploads base artwork, adds editable text zones, sets dimensions/pricing)
2. User opens Print Workshop, selects a template
3. Canvas loads with locked branding + editable fields
4. User modifies editable text (lot #, date, THC %, etc.)
5. User selects material and quantity
6. If price is preset: total auto-calculates, user clicks "Create Order"
7. If no preset price: user clicks "Request Quote", status = `pending_quote`, admin quotes it
8. System generates print-ready PDF, creates a `print_orders` record, and optionally links to a standard `orders` record

### Phased Approach
- **Phase 1** (this implementation): Template browsing, canvas editor with locked/editable zones, material/quantity selection, print file generation, order creation
- **Phase 2** (future): Image upload into editable zones, multi-page labels, template versioning, company user access


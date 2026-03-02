

## Layerable Print-Ready Pipeline

### Problem
The current approach rasterizes the PDF background into a PNG, losing vector quality. No matter how much we oversample, it will never match the sharpness of a native PDF, and the final "print-ready" export is just a Fabric.js canvas rasterization -- not a true press-ready file.

### Architecture

```text
Upload Flow:
  PDF file → Upload original to `print-files` bucket → Store path in template
                ↓
  Rasterize at 2x for on-screen preview only (existing pdfThumbnail logic)

Export Flow:
  Original PDF (from storage)
    + Fabric.js overlay objects (text, images) rendered at 300 DPI
    = Merged PDF via jsPDF (original as base page, overlays drawn on top)
```

### Implementation Steps

**1. Database: Add `source_pdf_path` column to `print_templates`**
- Migration: `ALTER TABLE print_templates ADD COLUMN source_pdf_path text;`
- Stores the storage path of the original uploaded PDF (e.g., `templates/{id}/source.pdf`)

**2. TemplateEditor: Store original PDF on upload**
- When user clicks "PDF BG", upload the original file to `print-files` bucket at `templates/{templateId}/source.pdf`
- Store the path in component state and pass it up via a new `onSourcePdfChange` callback
- Continue using the rasterized preview for the canvas display (existing logic, kept as-is for the editor preview)

**3. TemplateBuilder: Persist `source_pdf_path`**
- Accept `onSourcePdfChange` from TemplateEditor
- Include `source_pdf_path` in the save payload to the database

**4. New utility: `src/lib/printPdfExport.ts` — Hybrid PDF merge**
- Fetch original PDF from storage as ArrayBuffer
- Use `pdfjs-dist` to render the first page at 300 DPI onto a jsPDF page
- Iterate Fabric.js canvas objects (excluding background and trim guide), and for each:
  - **Text objects**: Use `jsPDF.text()` with correct font, size (in pt), position, color — this keeps text as native vector in the output PDF
  - **Image objects**: Render to a temp canvas, embed via `jsPDF.addImage()`
- Add crop marks and bleed indicators
- Return the final PDF Blob

**5. OrderPanel: "Generate Print File" button**
- Add a "Generate Print-Ready PDF" button
- Calls the new export utility with the template's `source_pdf_path` and current Fabric.js canvas data
- Uploads the generated PDF to `print-files` bucket
- Stores the URL in the `print_orders.print_file_url` column

**6. PrintWorkshop "use" mode: Pass source PDF path through**
- When selecting a template, pass `source_pdf_path` to both TemplateEditor (for preview re-rendering) and OrderPanel (for export)

### Key Technical Details

- **Preview remains rasterized** — the on-screen canvas still uses the 2x oversampled PNG for interactive editing. This is fast and good enough for proofing.
- **Export is hybrid** — the final PDF uses the original vector PDF as the base layer, with Fabric.js edits rendered on top at 300 DPI. Text objects are written as native PDF text (vector), not rasterized.
- **Font mapping** — jsPDF ships with Helvetica/Courier/Times. For Google Fonts, we fall back to rendering the text object to a high-res canvas and embedding as an image in the PDF. This preserves visual fidelity while keeping common fonts as vectors.
- **No new dependencies** — uses existing `jspdf` and `pdfjs-dist`.
- **Storage** — reuses existing `print-files` bucket (already public).


// Branding helpers for the pull & ship documents.
//
// The header these used to draw was a #4CAF50 "Vibe Packaging" set in 16pt
// Helvetica with the address stacked opposite — no wordmark at all in the sync
// path, because it "would be loaded async in enhanced version" and never was.
// They now delegate to src/lib/pdfDocument.ts, the single owner of the house
// style, so a packing list and an invoice come off the same press.
import jsPDF from 'jspdf';
import {
  DOC,
  DOC_COLORS,
  drawFooter,
  drawMastheadSync,
  preloadPrintLogo,
} from '@/lib/pdfDocument';

// Company branding constants. Kept here because the Send* email dialogs read
// the structured address off it; the PDF masthead uses COMPANY in pdfDocument.
export const VIBE_COMPANY = {
  name: 'Vibe Packaging',
  address: {
    street: '1415 S 700 W, Ste FLEXETC',
    city: 'Salt Lake City',
    state: 'UT',
    zip: '84104'
  },
  logoPath: '/images/vibe-logo-print.png'
};

/** @deprecated Use preloadPrintLogo from @/lib/pdfDocument. */
export const preloadLogo = preloadPrintLogo;

interface BrandingOptions {
  documentTitle?: string;
  /**
   * Retained for call-site compatibility. The masthead always carries the
   * company address now, so this no longer toggles anything.
   */
  showAddress?: boolean;
  titleAlign?: 'left' | 'center' | 'right';
}

function drawTitleUnderMasthead(doc: jsPDF, options: BrandingOptions): number {
  const { documentTitle } = options;
  if (!documentTitle) return DOC.MASTHEAD_H + 14;

  const yPos = DOC.MASTHEAD_H + 16;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DOC_COLORS.ink);
  doc.text(documentTitle, DOC.MARGIN, yPos);
  doc.setTextColor(...DOC_COLORS.body);
  return yPos + 6;
}

/**
 * Adds the house masthead plus an optional document title.
 * @returns The Y position after the header.
 */
export async function addPdfBranding(doc: jsPDF, options: BrandingOptions = {}): Promise<number> {
  await preloadPrintLogo();
  drawMastheadSync(doc);
  return drawTitleUnderMasthead(doc, options);
}

/**
 * Synchronous masthead for callers that are not async. The wordmark is
 * preloaded when pdfDocument is imported, so it is normally warm by the time a
 * user clicks Download; if not, the charcoal band still carries the company
 * name and the document reads correctly.
 */
export function addPdfBrandingSync(doc: jsPDF, options: BrandingOptions = {}): number {
  drawMastheadSync(doc);
  return drawTitleUnderMasthead(doc, options);
}

/** Rule, closing line and `Page n of m` on every page. */
export function addPdfFooter(doc: jsPDF): void {
  drawFooter(doc);
}

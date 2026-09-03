// One house style for every PDF this app hands to a customer or a vendor.
//
// The quote PDF was rebuilt first (see the masthead notes below) and it is the
// look we settled on. Everything else — invoices, order confirmations, purchase
// orders, packing lists — was still carrying the original layout: a 16pt
// #4CAF50 company name, a green rule, a green table header band, and the
// dark-ground wordmark dropped on white as an opaque black box, stretched ~31%
// wide. Six near-identical copies of that header had been pasted across the
// codebase, so fixing it in one place was not possible.
//
// This module is that one place. It owns the palette, the masthead, the title
// block, the table styling, the totals stack and the footer. Document modules
// supply content; they no longer draw chrome.
import jsPDF from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';

// ---------------------------------------------------------------------------
// Palette — charcoal / slate. Deliberately no lime green: it read as clip art
// next to real print work, and at 9pt on white it fails contrast.
// ---------------------------------------------------------------------------
export const DOC_COLORS = {
  ink: [35, 41, 49] as [number, number, number],           // headings / emphasis
  body: [70, 78, 89] as [number, number, number],          // body text
  muted: [120, 128, 138] as [number, number, number],      // labels / secondary
  rule: [220, 224, 230] as [number, number, number],       // dividers
  headerBg: [245, 246, 248] as [number, number, number],   // table header band
  rowAlt: [250, 251, 252] as [number, number, number],     // subtle zebra
  band: [232, 235, 239] as [number, number, number],       // grouping band
  onInkMuted: [168, 176, 187] as [number, number, number], // secondary on charcoal
  white: [255, 255, 255] as [number, number, number],
};

export const DOC = {
  MARGIN: 16,
  /** Height of the charcoal masthead band. */
  MASTHEAD_H: 30,
  /** Space kept clear at the bottom of every page for the footer. */
  FOOTER_RESERVE: 30,
  /** True w/h of vibe-logo-print.png (689x507) once its plate is keyed out. */
  LOGO_ASPECT: 1.359,
};

export const COMPANY = {
  legalName: 'ArmorPak Inc. DBA Vibe Packaging',
  contactLine: '1415 S 700 W  ·  Salt Lake City, UT 84104  ·  www.vibepkg.com',
};

const PRINT_LOGO_PATH = '/images/vibe-logo-print.png';

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------
let cachedPrintLogo: string | null = null;
let inFlight: Promise<string | null> | null = null;

/**
 * Fetches the print wordmark once and caches it. Started eagerly on import so
 * the synchronous masthead path (packing lists, pull & ship) normally finds it
 * warm; every caller that can await should await this instead.
 */
export function preloadPrintLogo(): Promise<string | null> {
  if (cachedPrintLogo) return Promise.resolve(cachedPrintLogo);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch(PRINT_LOGO_PATH);
      if (!response.ok) return null;
      const blob = await response.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      cachedPrintLogo = dataUrl;
      return dataUrl;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

if (typeof window !== 'undefined') {
  // Fire and forget; failure just means the masthead renders wordmark-free.
  void preloadPrintLogo();
}

function paintMasthead(doc: jsPDF, logoBase64: string | null): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // The wordmark is white script with a green shadow — artwork drawn for dark
  // grounds. On a white page it arrived as a black plate that read as pasted
  // on, and recolouring is not an option because the mark itself is white. So
  // make the dark ground deliberate: a full-width charcoal band the mark
  // belongs in. vibe-logo-print.png has its slate plate keyed out, so it sits
  // on DOC_COLORS.ink with no visible edge.
  doc.setFillColor(...DOC_COLORS.ink);
  doc.rect(0, 0, pageWidth, DOC.MASTHEAD_H, 'F');

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DOC_COLORS.white);
  doc.text(COMPANY.legalName, DOC.MARGIN, 14);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DOC_COLORS.onInkMuted);
  doc.text(COMPANY.contactLine, DOC.MARGIN, 21);

  if (logoBase64) {
    try {
      // Height-driven so the mark keeps its true proportions. The old call
      // passed a fixed 40x25 against a 1.249 source and squashed it.
      const logoH = 15;
      const logoW = logoH * DOC.LOGO_ASPECT;
      doc.addImage(
        logoBase64,
        'PNG',
        pageWidth - DOC.MARGIN - logoW,
        (DOC.MASTHEAD_H - logoH) / 2,
        logoW,
        logoH
      );
    } catch {
      // Band + company name still reads as a masthead without the mark.
    }
  }

  doc.setTextColor(...DOC_COLORS.ink);
  return DOC.MASTHEAD_H;
}

/** Draws the masthead, waiting for the wordmark. Returns the band's bottom Y. */
export async function drawMasthead(doc: jsPDF): Promise<number> {
  return paintMasthead(doc, await preloadPrintLogo());
}

/**
 * Synchronous masthead for callers that cannot await. Uses the cached wordmark
 * when the preload has landed and degrades to the bare charcoal band otherwise.
 */
export function drawMastheadSync(doc: jsPDF): number {
  return paintMasthead(doc, cachedPrintLogo);
}

// ---------------------------------------------------------------------------
// Title block
// ---------------------------------------------------------------------------
export interface DocumentTitleOptions {
  /** Small caps kicker above the number, e.g. 'INVOICE'. */
  label: string;
  /** The document number, set large. */
  value: string;
  /** Right-hand stat, e.g. Issued / Jan 4, 2026. */
  metaLabel?: string;
  metaValue?: string;
}

/**
 * Kicker + document number on the left, a single dated stat on the right.
 * Returns the Y to continue at.
 */
export function drawDocumentTitle(doc: jsPDF, opts: DocumentTitleOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const yPos = DOC.MASTHEAD_H + 16;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DOC_COLORS.muted);
  doc.text(opts.label, DOC.MARGIN, yPos);

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DOC_COLORS.ink);
  doc.text(opts.value, DOC.MARGIN, yPos + 9);

  if (opts.metaLabel && opts.metaValue) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DOC_COLORS.muted);
    doc.text(opts.metaLabel, pageWidth - DOC.MARGIN, yPos, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DOC_COLORS.ink);
    doc.text(opts.metaValue, pageWidth - DOC.MARGIN, yPos + 6, { align: 'right' });
  }

  return yPos + 18;
}

// ---------------------------------------------------------------------------
// Address / party blocks
// ---------------------------------------------------------------------------
export interface PartyBlock {
  /** Uppercase label, e.g. 'BILLED TO'. */
  label: string;
  /** Set bold — the company or person's name. */
  name?: string | null;
  /** Address and contact lines; empty entries are skipped. */
  lines?: Array<string | null | undefined>;
}

/** Renders one labelled address block at (x, y). Returns the Y below it. */
export function drawPartyBlock(doc: jsPDF, x: number, y: number, block: PartyBlock): number {
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DOC_COLORS.muted);
  doc.text(block.label, x, y);

  let cursor = y + 7;
  if (block.name) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DOC_COLORS.ink);
    doc.text(block.name, x, cursor);
    cursor += 6;
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DOC_COLORS.body);
  (block.lines || []).forEach((line) => {
    if (!line) return;
    doc.text(line, x, cursor);
    cursor += 5;
  });

  return cursor;
}

/**
 * Right-hand label/value stack — the document's metadata (numbers, dates,
 * terms). Returns the Y below it.
 */
export function drawDetailRows(
  doc: jsPDF,
  x: number,
  y: number,
  rows: Array<[string, string]>,
  opts: { label?: string; valueOffset?: number } = {}
): number {
  const { label = 'DETAILS', valueOffset = 38 } = opts;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DOC_COLORS.muted);
  doc.text(label, x, y);

  rows.forEach(([rowLabel, rowValue], i) => {
    const rowY = y + 7 + i * 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DOC_COLORS.muted);
    doc.text(rowLabel, x, rowY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DOC_COLORS.ink);
    doc.text(rowValue, x + valueOffset, rowY);
  });

  return y + 7 + rows.length * 6;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
/**
 * The house line-items table: light header band with muted small-caps labels,
 * hairline row rules, no outer border, no zebra fill. Spread it into an
 * autoTable call and override columnStyles per document.
 */
export function docTableStyles(): Partial<UserOptions> {
  return {
    theme: 'plain',
    headStyles: {
      fillColor: DOC_COLORS.headerBg,
      textColor: DOC_COLORS.muted,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 6 },
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 6 },
      textColor: DOC_COLORS.body,
      lineWidth: 0,
    },
    margin: { left: DOC.MARGIN, right: DOC.MARGIN, bottom: DOC.FOOTER_RESERVE },
    showHead: 'firstPage',
    rowPageBreak: 'avoid',
    tableLineWidth: 0,
    didParseCell: (data: any) => {
      if (data.section !== 'body') return;
      data.cell.styles.lineColor = DOC_COLORS.rule;
      data.cell.styles.lineWidth = { top: 0, right: 0, bottom: 0.1, left: 0 };
    },
  } as Partial<UserOptions>;
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------
export interface TotalsRow {
  label: string;
  value: string;
  /** Small italic line under the row, e.g. a shipping note. */
  note?: string | null;
  /** Set bold in ink — used for a deposit line. */
  emphasis?: boolean;
}

export interface TotalsOptions {
  rows: TotalsRow[];
  grandLabel: string;
  grandValue: string;
  width?: number;
}

/** Right-aligned totals stack closed by a rule and the grand total. */
export function drawTotals(doc: jsPDF, y: number, opts: TotalsOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const width = opts.width ?? 80;
  const x = pageWidth - width - DOC.MARGIN;
  let cursor = y;

  opts.rows.forEach((row) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', row.emphasis ? 'bold' : 'normal');
    doc.setTextColor(...(row.emphasis ? DOC_COLORS.ink : DOC_COLORS.body));

    const labelLines = doc.splitTextToSize(row.label, width - 30);
    doc.text(labelLines, x, cursor);
    doc.text(row.value, x + width, cursor, { align: 'right' });
    cursor += Math.max(7, labelLines.length * 5 + 2);

    if (row.note) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...DOC_COLORS.muted);
      const noteLines = doc.splitTextToSize(row.note, width);
      doc.text(noteLines, x, cursor);
      cursor += noteLines.length * 4 + 2;
    }
  });

  doc.setDrawColor(...DOC_COLORS.rule);
  doc.setLineWidth(0.3);
  doc.line(x, cursor, x + width, cursor);
  cursor += 6;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DOC_COLORS.ink);
  doc.text(opts.grandLabel, x, cursor);
  doc.text(opts.grandValue, x + width, cursor, { align: 'right' });

  return cursor + 6;
}

// ---------------------------------------------------------------------------
// Notes + footer
// ---------------------------------------------------------------------------
/** Labelled plain-text note block spanning the content width. */
export function drawNotes(doc: jsPDF, y: number, label: string, text: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const width = pageWidth - DOC.MARGIN * 2;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DOC_COLORS.muted);
  doc.text(label, DOC.MARGIN, y);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DOC_COLORS.body);
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, DOC.MARGIN, y + 6);

  return y + 6 + lines.length * 5;
}

/**
 * Hairline rule, a closing line on the left and `Page n of m` on the right —
 * stamped on every page, so it must run after all content is laid out.
 */
export function drawFooter(doc: jsPDF, note = 'Thank you for your business.'): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();

  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...DOC_COLORS.rule);
    doc.setLineWidth(0.2);
    doc.line(DOC.MARGIN, pageHeight - 14, pageWidth - DOC.MARGIN, pageHeight - 14);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DOC_COLORS.muted);
    doc.text(note, DOC.MARGIN, pageHeight - 8);
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - DOC.MARGIN, pageHeight - 8, {
      align: 'right',
    });
  }
}

/**
 * Adds a page when `needed` mm will not fit above the footer.
 * Returns the Y to draw at.
 */
export function ensureRoom(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - DOC.FOOTER_RESERVE) {
    doc.addPage();
    return 20;
  }
  return y;
}

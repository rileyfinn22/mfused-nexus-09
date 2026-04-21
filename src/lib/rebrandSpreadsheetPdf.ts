import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const BRAND_GREEN: [number, number, number] = [76, 175, 80];
const DARK_GRAY: [number, number, number] = [51, 51, 51];
const MEDIUM_GRAY: [number, number, number] = [100, 100, 100];
const PAGE_MARGIN = 24;
// Minimal header — just enough room for the Vibe logo at the top
const HEADER_BOTTOM = 60;
const TABLE_TOP = HEADER_BOTTOM + 8;
const MAX_COLUMNS_PER_PAGE = 8;

interface SpreadsheetPdfOptions {
  sourceFileName: string;
  invoiceNumber?: string | null;
  orderNumber?: string | null;
  logoPath?: string;
}

const readWorkbook = async (file: File) => {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    return XLSX.read(text, { type: "string", raw: false, dense: false });
  }

  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, {
    type: "array",
    raw: false,
    dense: false,
    cellDates: true,
  });
};

const formatCellValue = (cell?: XLSX.CellObject) => {
  if (!cell) return "";
  const formatted = XLSX.utils.format_cell(cell);
  if (formatted != null && String(formatted).trim() !== "") return String(formatted);
  if (cell.v == null) return "";
  return String(cell.v);
};

const getSheetMatrix = (sheet: XLSX.WorkSheet) => {
  const ref = sheet["!ref"];
  if (!ref) return [] as string[][];

  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r - range.s.r + 1;
  const colCount = range.e.c - range.s.c + 1;

  const matrix = Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => ""));

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      matrix[row - range.s.r][col - range.s.c] = formatCellValue(sheet[address]);
    }
  }

  // Note: We intentionally do NOT propagate merged cell values across spanned cells.
  // Doing so creates duplicate values in adjacent rows/columns, which makes the
  // rebranded output look like it has repeated rows and columns. The value lives
  // only in the top-left cell of the merge, which is the correct visual behavior.

  const nonEmptyRows = matrix.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (nonEmptyRows.length === 0) return [] as string[][];

  const populatedColumns = nonEmptyRows[0]
    .map((_, colIndex) => colIndex)
    .filter((colIndex) => nonEmptyRows.some((row) => (row[colIndex] || "").trim() !== ""));

  return nonEmptyRows.map((row) => populatedColumns.map((colIndex) => row[colIndex] || ""));
};

const normalizeText = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

const countNonEmptyCells = (row: string[]) => row.filter((cell) => cell.trim() !== "").length;

const isRepeatedValueRow = (row: string[]) => {
  const nonEmpty = row.filter((cell) => cell.trim() !== "");
  if (nonEmpty.length < 3) return false;
  const first = normalizeText(nonEmpty[0]);
  return nonEmpty.every((cell) => normalizeText(cell) === first);
};

const isVendorInfoRow = (row: string[]) => {
  const joined = row.map(normalizeText).join(" ");
  return (
    isRepeatedValueRow(row) ||
    /\b(co\.?,?\s*ltd|inc\b|corp\b|llc\b|gmbh\b|technology\b.*co)/i.test(joined) &&
      isRepeatedValueRow(row)
  );
};

const sliceColumns = (matrix: string[][]) => {
  const usedColumns = matrix[0]
    .map((_, colIndex) => colIndex)
    .filter((colIndex) => matrix.some((row) => (row[colIndex] || "").trim() !== ""));

  return matrix.map((row) => usedColumns.map((colIndex) => row[colIndex] || ""));
};

const extractRelevantSection = (matrix: string[][]) => {
  if (matrix.length === 0) return matrix;

  // Strip rows where the same vendor company info is repeated across all columns
  const cleaned = matrix.filter((row) => !isRepeatedValueRow(row));
  if (cleaned.length === 0) return matrix;

  const tableHeaderRowIndex = cleaned.findIndex((row) => {
    const normalizedRow = row.map(normalizeText);
    return normalizedRow.includes("s/n")
      && normalizedRow.includes("items")
      && normalizedRow.some((cell) => cell.includes("qty"))
      && normalizedRow.includes("cartons");
  });

  if (tableHeaderRowIndex === -1) {
    return sliceColumns(cleaned);
  }

  const startSearchIndex = Math.max(0, tableHeaderRowIndex - 8);
  const sectionStartCandidates: number[] = [];

  for (let index = startSearchIndex; index <= tableHeaderRowIndex; index += 1) {
    const normalizedRow = cleaned[index].map(normalizeText);
    if (normalizedRow.includes("packing list") || normalizedRow.some((cell) => cell.includes("ship to"))) {
      sectionStartCandidates.push(index);
    }
  }

  const startRow = sectionStartCandidates[0] ?? Math.max(0, tableHeaderRowIndex - 5);

  let lastMeaningfulRow = tableHeaderRowIndex;
  let hasSeenDataRow = false;
  let blankStreak = 0;

  for (let index = tableHeaderRowIndex + 1; index < cleaned.length; index += 1) {
    const nonEmptyCount = countNonEmptyCells(cleaned[index]);

    if (nonEmptyCount >= 2) {
      hasSeenDataRow = true;
      lastMeaningfulRow = index;
      blankStreak = 0;
      continue;
    }

    if (hasSeenDataRow) {
      blankStreak += 1;
      if (blankStreak >= 2) break;
    }
  }

  return sliceColumns(cleaned.slice(startRow, lastMeaningfulRow + 1));
};

const splitColumnGroups = (columnCount: number) => {
  const groups: number[][] = [];
  for (let start = 0; start < columnCount; start += MAX_COLUMNS_PER_PAGE) {
    groups.push(
      Array.from(
        { length: Math.min(MAX_COLUMNS_PER_PAGE, columnCount - start) },
        (_, index) => start + index,
      ),
    );
  }
  return groups;
};

const loadLogoDataUrl = async (logoPath: string) => {
  const response = await fetch(logoPath);
  if (!response.ok) throw new Error("Could not load logo");

  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read logo"));
    reader.readAsDataURL(blob);
  });
};

const drawPageChrome = (
  doc: jsPDF,
  _options: SpreadsheetPdfOptions,
  logoDataUrl: string | null,
) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Just the Vibe logo at the top — no other branding, titles, or metadata
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", PAGE_MARGIN, 14, 70, 32);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("Vibe Packaging", PAGE_MARGIN, 32);
  }

  // Footer — page number only
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MEDIUM_GRAY);
  doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - PAGE_MARGIN, pageHeight - 16, {
    align: "right",
  });
};

/** Parse a spreadsheet file and return the extracted matrix */
export const parseSpreadsheetToMatrix = async (file: File): Promise<string[][]> => {
  const workbook = await readWorkbook(file);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found");
  const sheet = workbook.Sheets[sheetName];
  const matrix = extractRelevantSection(getSheetMatrix(sheet));
  if (matrix.length === 0) throw new Error("Could not read any data from the spreadsheet");
  return matrix;
};

/** Generate a branded PDF from a pre-parsed matrix */
export const matrixToBrandedPdf = async (
  matrix: string[][],
  options: SpreadsheetPdfOptions,
): Promise<Blob> => {
  if (matrix.length === 0) throw new Error("No data to render");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const logoDataUrl = await loadLogoDataUrl(options.logoPath || "/images/vibe-logo.png").catch(() => null);

  const columnGroups = splitColumnGroups(matrix[0].length || 1);

  columnGroups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      doc.addPage("letter", "landscape");
    }

    const [headerRow, ...dataRows] = matrix;
    const head = headerRow ? [group.map((columnIndex) => headerRow[columnIndex] || "")] : undefined;
    const body = dataRows.map((row) => group.map((columnIndex) => row[columnIndex] || ""));

    autoTable(doc, {
      startY: TABLE_TOP,
      head,
      body,
      theme: "grid",
      margin: { top: TABLE_TOP, left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 24 },
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 3,
        overflow: "linebreak",
        textColor: DARK_GRAY,
        lineColor: [210, 210, 210],
        lineWidth: 0.25,
        valign: "middle",
      },
      alternateRowStyles: { fillColor: LIGHT_GRAY },
      columnStyles: Object.fromEntries(group.map((_, index) => [index, { cellWidth: "auto" }])),
      didDrawPage: () => {
        drawPageChrome(doc, options, logoDataUrl);
      },
    });
  });

  return doc.output("blob");
};

export const rebrandSpreadsheetToPdf = async (
  file: File,
  options: SpreadsheetPdfOptions,
) => {
  const matrix = await parseSpreadsheetToMatrix(file);
  return matrixToBrandedPdf(matrix, options);
};
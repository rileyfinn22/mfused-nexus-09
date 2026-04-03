import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const BRAND_GREEN: [number, number, number] = [76, 175, 80];
const DARK_GRAY: [number, number, number] = [51, 51, 51];
const MEDIUM_GRAY: [number, number, number] = [100, 100, 100];
const LIGHT_GRAY: [number, number, number] = [248, 248, 248];
const PAGE_MARGIN = 40;
const TABLE_TOP = 108;
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

  for (const merge of sheet["!merges"] || []) {
    const mergedValue = matrix[merge.s.r - range.s.r]?.[merge.s.c - range.s.c] || "";
    if (!mergedValue) continue;

    for (let row = merge.s.r; row <= merge.e.r; row += 1) {
      for (let col = merge.s.c; col <= merge.e.c; col += 1) {
        const targetRow = row - range.s.r;
        const targetCol = col - range.s.c;
        if (!matrix[targetRow]?.[targetCol]) {
          matrix[targetRow][targetCol] = mergedValue;
        }
      }
    }
  }

  const nonEmptyRows = matrix.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (nonEmptyRows.length === 0) return [] as string[][];

  const populatedColumns = nonEmptyRows[0]
    .map((_, colIndex) => colIndex)
    .filter((colIndex) => nonEmptyRows.some((row) => (row[colIndex] || "").trim() !== ""));

  return nonEmptyRows.map((row) => populatedColumns.map((colIndex) => row[colIndex] || ""));
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
  options: SpreadsheetPdfOptions,
  sectionTitle: string,
  logoDataUrl: string | null,
) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("ArmorPak Inc. DBA Vibe Packaging", PAGE_MARGIN, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MEDIUM_GRAY);
  doc.text("1415 S 700 W", PAGE_MARGIN, 43);
  doc.text("Salt Lake City, UT 84104", PAGE_MARGIN, 54);
  doc.text("www.vibepkg.com", PAGE_MARGIN, 65);

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", pageWidth - PAGE_MARGIN - 58, 18, 58, 30);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("VIBE", pageWidth - PAGE_MARGIN, 38, { align: "right" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK_GRAY);
  doc.text(`Source file: ${options.sourceFileName}`, pageWidth - PAGE_MARGIN, 58, { align: "right" });

  if (options.invoiceNumber) {
    doc.text(`Invoice #: ${options.invoiceNumber}`, pageWidth - PAGE_MARGIN, 70, { align: "right" });
  }

  if (options.orderNumber) {
    doc.text(`Order #: ${options.orderNumber}`, pageWidth - PAGE_MARGIN, 82, { align: "right" });
  }

  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN, 90, pageWidth - PAGE_MARGIN, 90);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK_GRAY);
  doc.text(sectionTitle, PAGE_MARGIN, TABLE_TOP - 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MEDIUM_GRAY);
  doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - PAGE_MARGIN, pageHeight - 16, {
    align: "right",
  });
};

export const rebrandSpreadsheetToPdf = async (
  file: File,
  options: SpreadsheetPdfOptions,
) => {
  const workbook = await readWorkbook(file);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const logoDataUrl = await loadLogoDataUrl(options.logoPath || "/images/vibe-logo.png").catch(() => null);

  let hasPages = false;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = getSheetMatrix(sheet);
    if (matrix.length === 0) return;

    const columnGroups = splitColumnGroups(matrix[0].length || 1);

    columnGroups.forEach((group, groupIndex) => {
      if (hasPages) {
        doc.addPage("letter", "landscape");
      }
      hasPages = true;

      const body = matrix.map((row) => group.map((columnIndex) => row[columnIndex] || ""));
      const sectionTitle =
        columnGroups.length > 1
          ? `${sheetName} — columns ${group[0] + 1}-${group[group.length - 1] + 1}`
          : sheetName;

      autoTable(doc, {
        startY: TABLE_TOP,
        body,
        theme: "grid",
        margin: { top: TABLE_TOP, left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 24 },
        styles: {
          font: "helvetica",
          fontSize: 7,
          cellPadding: 4,
          overflow: "linebreak",
          textColor: DARK_GRAY,
          lineColor: [210, 210, 210],
          lineWidth: 0.25,
          valign: "middle",
        },
        alternateRowStyles: {
          fillColor: LIGHT_GRAY,
        },
        columnStyles: Object.fromEntries(group.map((_, index) => [index, { cellWidth: "auto" }])),
        didDrawPage: () => {
          drawPageChrome(doc, options, sectionTitle, logoDataUrl);
        },
      });
    });
  });

  if (!hasPages) {
    throw new Error("Could not read any data from the spreadsheet");
  }

  return doc.output("blob");
};
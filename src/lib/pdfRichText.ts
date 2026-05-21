import type jsPDF from "jspdf";

export type RichRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  sizePt: number;
};

export type RichLine = {
  runs: RichRun[];
  bullet?: boolean;
  width: number;
  height: number;
};

const SIZE_FROM_FONT_ATTR: Record<string, number> = {
  "1": 7,
  "2": 8,
  "3": 9,
  "4": 11,
  "5": 14,
  "6": 18,
  "7": 22,
};

function fontSizeFromStyle(style: string, fallback: number): number {
  const m = style.match(/font-size\s*:\s*([\d.]+)\s*(px|pt)/i);
  if (!m) return fallback;
  const n = parseFloat(m[1]);
  if (m[2].toLowerCase() === "px") return Math.round((n * 0.75) * 10) / 10;
  return n;
}

type Style = { bold: boolean; italic: boolean; underline: boolean; sizePt: number };

function walk(node: Node, style: Style, out: { runs: RichRun[]; bullet: boolean }[], current: { runs: RichRun[]; bullet: boolean }) {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = (node.textContent || "").replace(/\u00a0/g, " ");
    // Respect embedded newlines as hard line breaks
    const parts = raw.split(/\n/);
    parts.forEach((piece, i) => {
      if (piece) current.runs.push({ text: piece, ...style });
      if (i < parts.length - 1) {
        out.push({ runs: current.runs, bullet: current.bullet });
        current.runs = [];
        current.bullet = false;
      }
    });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const next: Style = { ...style };

  if (tag === "b" || tag === "strong") next.bold = true;
  if (tag === "i" || tag === "em") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "font") {
    const sz = el.getAttribute("size");
    if (sz && SIZE_FROM_FONT_ATTR[sz]) next.sizePt = SIZE_FROM_FONT_ATTR[sz];
  }
  const inline = el.getAttribute("style") || "";
  if (inline) {
    if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(inline)) next.bold = true;
    if (/font-style\s*:\s*italic/i.test(inline)) next.italic = true;
    if (/text-decoration[^;]*underline/i.test(inline)) next.underline = true;
    next.sizePt = fontSizeFromStyle(inline, next.sizePt);
  }

  const isBlock = ["p", "div", "li", "ul", "ol"].includes(tag);
  const isBullet = tag === "li";

  if (tag === "br") {
    out.push({ runs: current.runs, bullet: current.bullet });
    current.runs = [];
    current.bullet = false;
    return;
  }

  if (isBlock && current.runs.length > 0) {
    out.push({ ...current });
    current.runs = [];
    current.bullet = false;
  }
  if (isBullet) current.bullet = true;

  el.childNodes.forEach((c) => walk(c, next, out, current));

  if (isBlock) {
    out.push({ ...current });
    current.runs = [];
    current.bullet = false;
  }
}

export function parseHtmlToParagraphs(html: string, defaultSizePt = 9): { runs: RichRun[]; bullet: boolean }[] {
  if (!html) return [];
  // Treat plain text (no tags) as a single paragraph
  if (!/<[a-z]/i.test(html)) {
    return html.split(/\n/).map((line) => ({
      runs: [{ text: line, bold: false, italic: false, underline: false, sizePt: defaultSizePt }],
      bullet: false,
    }));
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const paragraphs: { runs: RichRun[]; bullet: boolean }[] = [];
  const current = { runs: [] as RichRun[], bullet: false };
  const baseStyle: Style = { bold: false, italic: false, underline: false, sizePt: defaultSizePt };
  tmp.childNodes.forEach((n) => walk(n, baseStyle, paragraphs, current));
  paragraphs.push({ ...current });
  // Collapse runs of >2 trailing blank paragraphs but keep single blanks as spacer lines
  while (paragraphs.length > 1 && paragraphs[paragraphs.length - 1].runs.length === 0 && paragraphs[paragraphs.length - 2].runs.length === 0) {
    paragraphs.pop();
  }
  // Strip leading blank paragraphs
  while (paragraphs.length > 0 && paragraphs[0].runs.length === 0 && !paragraphs[0].bullet) {
    paragraphs.shift();
  }
  return paragraphs;
}

function setFontForRun(doc: jsPDF, run: RichRun) {
  let style: "normal" | "bold" | "italic" | "bolditalic" = "normal";
  if (run.bold && run.italic) style = "bolditalic";
  else if (run.bold) style = "bold";
  else if (run.italic) style = "italic";
  doc.setFont("helvetica", style);
  doc.setFontSize(run.sizePt);
}

// pt → mm
const PT_TO_MM = 0.3528;
const LINE_SPACING = 1.25;

function wrapParagraph(
  doc: jsPDF,
  para: { runs: RichRun[]; bullet: boolean },
  maxWidth: number,
  bulletIndent: number,
  defaultSizePt: number
): RichLine[] {
  const indent = para.bullet ? bulletIndent : 0;
  const effWidth = maxWidth - indent;
  const lines: RichLine[] = [];
  let currentLine: RichRun[] = [];
  let currentWidth = 0;
  let currentMaxPt = 0;

  const pushLine = (isFirst: boolean) => {
    const maxPt = currentMaxPt || defaultSizePt;
    lines.push({
      runs: currentLine,
      bullet: para.bullet && isFirst,
      width: currentWidth,
      height: maxPt * PT_TO_MM * LINE_SPACING,
    });
    currentLine = [];
    currentWidth = 0;
    currentMaxPt = 0;
  };

  let isFirstLine = true;

  // Empty paragraph → blank spacer line
  if (para.runs.length === 0) {
    pushLine(true);
    return lines;
  }

  for (const run of para.runs) {
    setFontForRun(doc, run);
    const tokens = run.text.split(/(\s+)/);
    for (const tok of tokens) {
      if (!tok) continue;
      const w = doc.getTextWidth(tok);
      if (currentWidth + w > effWidth && currentLine.length > 0) {
        pushLine(isFirstLine);
        isFirstLine = false;
        if (/^\s+$/.test(tok)) continue;
      }
      currentLine.push({ ...run, text: tok });
      currentWidth += w;
      currentMaxPt = Math.max(currentMaxPt, run.sizePt);
    }
  }
  if (currentLine.length > 0) pushLine(isFirstLine);
  return lines;
}

export function measureRichText(
  doc: jsPDF,
  html: string,
  maxWidth: number,
  defaultSizePt = 9
): { lines: (RichLine & { _paraIndex: number })[]; totalHeight: number } {
  const paragraphs = parseHtmlToParagraphs(html, defaultSizePt);
  const allLines: (RichLine & { _paraIndex: number })[] = [];
  paragraphs.forEach((para, pIdx) => {
    const wrapped = wrapParagraph(doc, para, maxWidth, 4, defaultSizePt);
    wrapped.forEach((l) => allLines.push({ ...l, _paraIndex: pIdx }));
  });
  const totalHeight = allLines.reduce((s, l) => s + l.height, 0);
  return { lines: allLines, totalHeight };
}

export function drawRichText(
  doc: jsPDF,
  html: string,
  x: number,
  y: number,
  maxWidth: number,
  defaultSizePt = 9
): number {
  const { lines } = measureRichText(doc, html, maxWidth, defaultSizePt);
  let cursorY = y;
  for (const line of lines) {
    // Baseline = top of line + ascent. Approximate ascent as 0.8 * fontSize in mm.
    const maxPt = line.runs.reduce((m, r) => Math.max(m, r.sizePt), defaultSizePt);
    const ascent = maxPt * PT_TO_MM * 0.85;
    const baselineY = cursorY + ascent;
    let cursorX = x;
    if (line.bullet) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(defaultSizePt);
      doc.text("•", x, baselineY);
      cursorX = x + 4;
    }
    for (const run of line.runs) {
      setFontForRun(doc, run);
      const w = doc.getTextWidth(run.text);
      doc.text(run.text, cursorX, baselineY);
      if (run.underline && run.text.trim()) {
        const uy = baselineY + 0.6;
        doc.setLineWidth(0.2);
        doc.line(cursorX, uy, cursorX + w, uy);
      }
      cursorX += w;
    }
    cursorY += line.height;
  }
  return cursorY;
}


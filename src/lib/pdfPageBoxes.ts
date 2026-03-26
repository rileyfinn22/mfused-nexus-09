export type PdfPageBox = {
  left: number;
  bottom: number;
  right: number;
  top: number;
  width: number;
  height: number;
  widthIn: number;
  heightIn: number;
};

export type ParsedPdfPageBoxes = {
  mediaBox?: PdfPageBox;
  cropBox?: PdfPageBox;
  bleedBox?: PdfPageBox;
  trimBox?: PdfPageBox;
  artBox?: PdfPageBox;
};

const BOX_NAMES = ["MediaBox", "CropBox", "BleedBox", "TrimBox", "ArtBox"] as const;

function toPdfPageBox(values: number[]): PdfPageBox | undefined {
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return undefined;

  const [left, bottom, right, top] = values;
  const width = Math.abs(right - left);
  const height = Math.abs(top - bottom);

  return {
    left,
    bottom,
    right,
    top,
    width,
    height,
    widthIn: width / 72,
    heightIn: height / 72,
  };
}

function parsePdfBox(text: string, name: (typeof BOX_NAMES)[number]): PdfPageBox | undefined {
  const match = text.match(
    new RegExp(`/${name}\\s*\\[\\s*([-+]?\\d*\\.?\\d+)\\s+([-+]?\\d*\\.?\\d+)\\s+([-+]?\\d*\\.?\\d+)\\s+([-+]?\\d*\\.?\\d+)\\s*\\]`)
  );

  if (!match) return undefined;

  return toPdfPageBox(match.slice(1).map(Number));
}

export function extractPdfPageBoxes(pdfData: ArrayBuffer): ParsedPdfPageBoxes {
  const text = new TextDecoder("latin1").decode(new Uint8Array(pdfData));

  return {
    mediaBox: parsePdfBox(text, "MediaBox"),
    cropBox: parsePdfBox(text, "CropBox"),
    bleedBox: parsePdfBox(text, "BleedBox"),
    trimBox: parsePdfBox(text, "TrimBox"),
    artBox: parsePdfBox(text, "ArtBox"),
  };
}

export function computePdfBoxPlacement({
  imageWidth,
  imageHeight,
  mediaBox,
  box,
  targetLeft,
  targetTop,
  targetWidth,
  targetHeight,
}: {
  imageWidth: number;
  imageHeight: number;
  mediaBox?: PdfPageBox;
  box?: PdfPageBox;
  targetLeft: number;
  targetTop: number;
  targetWidth: number;
  targetHeight: number;
}) {
  if (!mediaBox || !box || !mediaBox.width || !mediaBox.height || !box.width || !box.height) {
    return null;
  }

  const widthFraction = box.width / mediaBox.width;
  const heightFraction = box.height / mediaBox.height;
  const leftFraction = (box.left - mediaBox.left) / mediaBox.width;
  const topFraction = (mediaBox.top - box.top) / mediaBox.height;

  const scaleFromWidth = targetWidth / (imageWidth * widthFraction);
  const scaleFromHeight = targetHeight / (imageHeight * heightFraction);
  const scale = Math.min(scaleFromWidth, scaleFromHeight);

  const renderedBoxWidth = imageWidth * scale * widthFraction;
  const renderedBoxHeight = imageHeight * scale * heightFraction;

  return {
    scale,
    left: targetLeft - leftFraction * imageWidth * scale + (targetWidth - renderedBoxWidth) / 2,
    top: targetTop - topFraction * imageHeight * scale + (targetHeight - renderedBoxHeight) / 2,
  };
}

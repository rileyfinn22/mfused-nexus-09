import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

let workerConfigured = false;

function ensureWorker() {
  if (workerConfigured) return;
  // pdfjs types in some builds don't expose this cleanly; runtime supports it.
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;
  workerConfigured = true;
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to create PNG blob"));
        resolve(blob);
      },
      "image/png",
      0.92
    );
  });
}

export async function generatePdfThumbnailFromArrayBuffer(
  pdfData: ArrayBuffer,
  options?: { scale?: number; maxWidth?: number }
): Promise<Blob> {
  ensureWorker();

  const scale = options?.scale ?? 1;
  const maxWidth = options?.maxWidth ?? 600;

  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  // Always render at exactly maxWidth so the output is a 1:1 pixel match with the target canvas
  const initialViewport = page.getViewport({ scale });
  const targetScale = maxWidth / initialViewport.width * scale;
  const viewport = page.getViewport({ scale: targetScale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const renderTask = page.render({ canvas, viewport });
  await renderTask.promise;

  return await canvasToPngBlob(canvas);
}

export async function generatePdfThumbnailFromFile(
  file: File,
  options?: { scale?: number; maxWidth?: number }
): Promise<Blob> {
  const buf = await file.arrayBuffer();
  return generatePdfThumbnailFromArrayBuffer(buf, options);
}

export async function generatePdfThumbnailFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
  const buf = await res.arrayBuffer();
  return generatePdfThumbnailFromArrayBuffer(buf);
}

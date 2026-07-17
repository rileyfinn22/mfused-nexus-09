import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import { signStorageUrl } from "@/lib/storageUrl";

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured) return;
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;
  workerConfigured = true;
}

interface PdfThumbnailProps {
  pdfUrl: string;
  alt?: string;
  className?: string;
  maxWidth?: number;
}

const PdfThumbnail = ({ pdfUrl, alt, className = "", maxWidth = 400 }: PdfThumbnailProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        setLoaded(false);
        setError(false);
        ensureWorker();
        const signedPdfUrl = await signStorageUrl('artwork', pdfUrl);
        if (cancelled) return;

        const loadingTask = pdfjsLib.getDocument({ url: signedPdfUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = maxWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({ canvas, viewport }).promise;
        if (!cancelled) setLoaded(true);
      } catch (e) {
        console.warn("Failed to render PDF thumbnail", e);
        if (!cancelled) setError(true);
      }
    };

    render();
    return () => { cancelled = true; };
  }, [pdfUrl, maxWidth]);

  if (error) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-label={alt}
      className={`${className} ${loaded ? "" : "opacity-0"}`}
      style={{ transition: "opacity 0.2s" }}
    />
  );
};

export default PdfThumbnail;

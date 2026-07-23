import { useEffect, useState, ImgHTMLAttributes } from "react";
import { getSignedArtworkUrl } from "@/lib/signedArtworkUrl";

interface SignedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  fallback?: string;
}

/**
 * Drop-in replacement for <img> when the src points to a private storage bucket
 * (artwork, product-images, production-images, print-files). Resolves the stored
 * URL/path into a fresh signed URL. Falls back to the original src for any URL
 * that isn't in a known private bucket.
 */
const SignedImage = ({ src, fallback, alt = "", ...rest }: SignedImageProps) => {
  const [resolved, setResolved] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      setResolved(fallback ?? "");
      return;
    }
    getSignedArtworkUrl(src)
      .then((url) => {
        if (!cancelled) setResolved(url || fallback || "");
      })
      .catch(() => {
        if (!cancelled) setResolved(fallback ?? src);
      });
    return () => {
      cancelled = true;
    };
  }, [src, fallback]);

  if (!resolved) return null;
  return <img src={resolved} alt={alt} {...rest} />;
};

export default SignedImage;

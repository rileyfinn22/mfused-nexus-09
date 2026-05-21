import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

type Props = {
  html?: string | null;
  className?: string;
};

const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "br", "p", "div", "span", "ul", "ol", "li", "font"];
const ALLOWED_ATTR = ["style", "size"];

export function RichText({ html, className }: Props) {
  if (!html) return null;
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
  return (
    <div
      className={cn("rich-text text-sm whitespace-pre-wrap break-words", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

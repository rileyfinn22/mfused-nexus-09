import { useEffect, useRef } from "react";
import { Bold, Italic, Underline as UnderlineIcon, List, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClass?: string;
};

const SIZES: { label: string; px: string; cmd: string }[] = [
  { label: "Small", px: "12px", cmd: "2" },
  { label: "Normal", px: "14px", cmd: "3" },
  { label: "Large", px: "18px", cmd: "5" },
  { label: "Heading", px: "22px", cmd: "6" },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Type here…",
  className,
  minHeightClass = "min-h-[80px]",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  return (
    <div className={cn("border rounded-md overflow-hidden bg-background", className)}>
      <div className="flex items-center gap-1 border-b px-1 py-1 bg-muted/30">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}>
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}>
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onMouseDown={(e) => e.preventDefault()}>
              <Type className="h-3.5 w-3.5" />
              <span className="text-xs">Size</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SIZES.map((s) => (
              <DropdownMenuItem
                key={s.cmd}
                onMouseDown={(e) => { e.preventDefault(); exec("fontSize", s.cmd); }}
              >
                <span style={{ fontSize: s.px }}>{s.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}>
          <List className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => ref.current && onChange(ref.current.innerHTML)}
        onBlur={() => ref.current && onChange(ref.current.innerHTML)}
        className={cn(
          "rich-text-editor px-3 py-2 text-sm outline-none focus:outline-none whitespace-pre-wrap break-words",
          minHeightClass,
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60"
        )}
      />
    </div>
  );
}

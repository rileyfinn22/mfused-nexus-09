import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type EditableDescriptionProps = {
  value?: string | null;
  placeholder?: string;
  onSave: (newValue: string) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
};

export function EditableDescription({
  value,
  placeholder = "Add description…",
  onSave,
  className,
  disabled,
}: EditableDescriptionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef<string>((value ?? "").trim());

  useEffect(() => {
    const next = value ?? "";
    // Keep the DOM in sync when external value changes.
    if (ref.current && !ref.current.matches(":focus")) {
      ref.current.textContent = next;
    }
    lastSavedRef.current = next.trim();
  }, [value]);

  const handleBlur = async () => {
    if (!ref.current) return;

    const next = (ref.current.textContent ?? "").trim();
    if (next === lastSavedRef.current) return;

    try {
      setSaving(true);
      await onSave(next);
      lastSavedRef.current = next;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={ref}
      data-placeholder={placeholder}
      contentEditable={!disabled && !saving}
      suppressContentEditableWarning
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "editable-description text-sm text-foreground whitespace-pre-wrap break-words cursor-text rounded px-2 py-1.5 min-h-[32px] border border-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:outline-none transition-colors",
        "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60",
        (disabled || saving) && "opacity-70 cursor-not-allowed",
        className
      )}
    />
  );
}

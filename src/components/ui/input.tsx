import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, onClick, onWheel, ...props }, ref) => {
    const isNumber = type === "number";

    const selectAll = (el: HTMLInputElement) => {
      // Chrome ignores select() on type=number; temporarily switch to text
      try {
        if (el.type === "number") {
          el.type = "text";
          el.select();
          el.type = "number";
        } else {
          el.select();
        }
      } catch {
        try { el.select(); } catch {}
      }
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
          isNumber &&
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0",
          className
        )}
        ref={ref}
        onFocus={(e) => {
          if (isNumber) {
            const el = e.currentTarget;
            // Defer to ensure focus settled, then select content so typing replaces it
            setTimeout(() => selectAll(el), 0);
          }
          onFocus?.(e);
        }}
        onClick={(e) => {
          if (isNumber) {
            const el = e.currentTarget;
            setTimeout(() => selectAll(el), 0);
          }
          onClick?.(e);
        }}
        onWheel={(e) => {
          if (isNumber) {
            // Prevent scroll-wheel from incrementing the value
            (e.currentTarget as HTMLInputElement).blur();
          }
          onWheel?.(e);
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

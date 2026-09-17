import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Status labels, not pills: small, square-cornered, tinted lightly so a page of them
// stays quiet. Colour carries meaning (success / warning / danger / info) and nothing else.
const badgeVariants = cva(
  "inline-flex items-center rounded border px-1.5 py-px text-xs font-medium leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-danger/25 bg-danger/8 text-danger",
        outline:
          "border-border bg-transparent text-muted-foreground",
        success:
          "border-success/25 bg-success/8 text-success",
        warning:
          "border-warning/25 bg-warning/8 text-warning",
        danger:
          "border-danger/25 bg-danger/8 text-danger",
        info:
          "border-info/25 bg-info/8 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

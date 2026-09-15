import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrderPickerConfig } from "@/hooks/useCompanyPortalFeatures";
import type { KindFilterValue } from "@/hooks/useKindFilter";
import { cn } from "@/lib/utils";

interface KindSelectProps {
  config: OrderPickerConfig | null;
  value: KindFilterValue;
  onChange: (value: KindFilterValue) => void;
  className?: string;
}

/**
 * Product-kind filter (Boxes / Foils / Other). Renders nothing for companies without
 * order_picker groups in portal_features, so their filter row is unchanged.
 */
export function KindSelect({ config, value, onChange, className }: KindSelectProps) {
  if (!config) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full sm:w-40", className)}>
        <SelectValue placeholder="All types" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All types</SelectItem>
        {config.groups.map((g) => (
          <SelectItem key={g.key} value={g.key}>
            {g.label}
          </SelectItem>
        ))}
        <SelectItem value="__other__">{config.other_label}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default KindSelect;

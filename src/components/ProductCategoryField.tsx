import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyPortalFeatures } from "@/hooks/useCompanyPortalFeatures";

export const OTHER_CATEGORY = "__other__";

/**
 * Required category (Boxes / Foils / Other…) for companies with an order-picker config,
 * e.g. Nutrastrips — the same choice customers make when they add a product.
 * `value` is a group key, OTHER_CATEGORY, or "". Use `productTypeFor` to get the stored type.
 */
export function ProductCategoryField({
  companyId,
  value,
  onChange,
  onRequiredChange,
}: {
  companyId: string | null | undefined;
  value: string;
  onChange: (key: string) => void;
  onRequiredChange?: (required: boolean, productTypeFor: (key: string) => string | null) => void;
}) {
  const { orderPicker } = useCompanyPortalFeatures(companyId);
  const required = !!orderPicker && orderPicker.groups.length > 0;

  useEffect(() => {
    onRequiredChange?.(required, (key) => {
      const g = orderPicker?.groups.find((x) => x.key === key);
      return g ? g.product_types[0] ?? null : null;
    });
  }, [required, orderPicker]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!required || !orderPicker) return null;
  return (
    <div className="space-y-2">
      <Label>
        Category <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a category" />
        </SelectTrigger>
        <SelectContent>
          {orderPicker.groups.map((g) => (
            <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>
          ))}
          <SelectItem value={OTHER_CATEGORY}>{orderPicker.other_label}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default ProductCategoryField;

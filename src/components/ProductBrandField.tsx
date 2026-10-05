import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrandFilter } from "@/hooks/useBrandFilter";

/**
 * Required brand picker for product creation. Renders only when the company uses brands
 * (e.g. Nutrastrips), so staff-created products get a brand the same way customers' do.
 * Reports `required` so callers can block saving until a brand is picked.
 */
export function ProductBrandField({
  companyId,
  value,
  onChange,
  onRequiredChange,
  hint,
}: {
  companyId: string | null | undefined;
  value: string;
  onChange: (brandId: string) => void;
  onRequiredChange?: (required: boolean) => void;
  hint?: string;
}) {
  const { brands } = useBrandFilter(companyId);
  const required = brands.length > 0;

  useEffect(() => {
    onRequiredChange?.(required);
    if (brands.length > 0 && value && !brands.some((b) => b.id === value)) onChange("");
  }, [required, brands]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!required) return null;
  return (
    <div className="space-y-2">
      <Label>
        Brand <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a brand" />
        </SelectTrigger>
        <SelectContent>
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default ProductBrandField;

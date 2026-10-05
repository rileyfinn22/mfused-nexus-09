import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
  const { brands, refresh } = useBrandFilter(companyId);
  const required = brands.length > 0;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const addBrand = async () => {
    const name = newName.trim();
    if (!name || !companyId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("product_brands")
      .insert({ company_id: companyId, name, sort_order: brands.length + 1 })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast.error((error as any).code === "23505" ? "A brand with that name already exists." : error.message);
      return;
    }
    await refresh();
    onChange(data.id);
    setNewName("");
    setAdding(false);
  };

  useEffect(() => {
    onRequiredChange?.(required);
    if (brands.length > 0 && value && !brands.some((b) => b.id === value)) onChange("");
  }, [required, brands]); // eslint-disable-line react-hooks/exhaustive-deps

  const isNew = value === "__new__";
  useEffect(() => {
    if (isNew) { setAdding(true); onChange(""); }
  }, [isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!required && !companyId) return null;
  if (!required && !adding) {
    return (
      <Button type="button" variant="ghost" size="sm" className="px-0 h-auto" onClick={() => setAdding(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add a brand (optional)
      </Button>
    );
  }
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
          <SelectItem value="__new__">
            <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> New brand</span>
          </SelectItem>
        </SelectContent>
      </Select>
      {adding && (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New brand name"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addBrand(); } }}
            autoFocus
          />
          <Button type="button" onClick={addBrand} disabled={!newName.trim() || saving}>Add</Button>
          <Button type="button" variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</Button>
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default ProductBrandField;

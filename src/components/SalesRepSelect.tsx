import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/useActiveCompany";

export const SALES_REPS = [
  { email: "justin@vibepkg.com", name: "Justin Finn", title: "President" },
  { email: "riley@vibepkg.com", name: "Riley Finn", title: "VP Sales" },
  { email: "jack@vibepkg.com", name: "Jack Finn", title: "Account Executive" },
  { email: "carrie@vibepkg.com", name: "Carrie Arnold", title: "Graphic Design & Administration" },
  { email: "taz@vibepkg.com", name: "Taz Finn", title: "Admin and Sales Support" },
];

export const salesRepName = (email?: string | null) =>
  SALES_REPS.find((r) => r.email === email?.toLowerCase())?.name ?? email ?? "";

interface Props {
  value: string | null | undefined;
  onChange: (email: string) => void;
  invalid?: boolean;
  id?: string;
  className?: string;
}

export function SalesRepSelect({ value, onChange, invalid, id, className }: Props) {
  const { isVibeAdmin } = useActiveCompany();
  // Internal-only field: never render on customer/vendor portal pages.
  if (!isVibeAdmin) return null;
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger id={id} className={`${className ?? ""} ${invalid ? "border-destructive" : ""}`}>
        <SelectValue placeholder="Select salesperson" />
      </SelectTrigger>
      <SelectContent>
        {SALES_REPS.map((r) => (
          <SelectItem key={r.email} value={r.email}>
            {r.name} <span className="text-muted-foreground">· {r.title}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

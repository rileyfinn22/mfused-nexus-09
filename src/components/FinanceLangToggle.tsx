import { Button } from "@/components/ui/button";
import type { FinanceLang } from "@/lib/financeI18n";

interface Props {
  lang: FinanceLang;
  onToggle: () => void;
}

export function FinanceLangToggle({ lang, onToggle }: Props) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
      className="h-8 px-3 text-xs font-medium gap-1"
    >
      {lang === "en" ? "中文" : "EN"}
    </Button>
  );
}

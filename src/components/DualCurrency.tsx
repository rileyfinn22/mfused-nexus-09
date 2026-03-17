import { formatUSD, formatRMB } from "@/lib/financeUtils";
import type { FinanceLang } from "@/lib/financeI18n";

interface Props {
  usd: number;
  rmb: number;
  lang: FinanceLang;
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
}

export function DualCurrency({
  usd,
  rmb,
  lang,
  className = "",
  primaryClassName = "",
  secondaryClassName = "block text-[9px] text-muted-foreground/50",
}: Props) {
  const primary = lang === "en" ? formatUSD(usd) : formatRMB(rmb);
  const secondary = lang === "en" ? formatRMB(rmb) : formatUSD(usd);

  return (
    <span className={className}>
      <span className={primaryClassName}>{primary}</span>
      <span className={secondaryClassName}>{secondary}</span>
    </span>
  );
}

interface CardCurrencyProps {
  usd: number;
  rmb: number;
  lang: FinanceLang;
  colorClass?: string;
}

export function CardCurrency({ usd, rmb, lang, colorClass = "" }: CardCurrencyProps) {
  const primary = lang === "en" ? formatUSD(usd) : formatRMB(rmb);
  const secondary = lang === "en" ? formatRMB(rmb) : formatUSD(usd);

  return (
    <div>
      <p className={`text-2xl font-bold ${colorClass}`}>{primary}</p>
      <p className="text-[10px] text-muted-foreground/50">{secondary}</p>
    </div>
  );
}

// Fee calculation for PO financing
export function calculateFinanceFee(financedAmount: number, financedDate: string, paidBackAmount: number = 0, paidBackDate?: string | null): {
  daysAging: number;
  feeTier: string;
  feePercent: number;
  feeAmount: number;
  balance: number;
  dailyRate: number;
} {
  const balanceCheck = financedAmount - paidBackAmount;
  // If fully paid and we have a paid-back date, stop the clock there.
  const now = balanceCheck <= 0 && paidBackDate
    ? new Date(String(paidBackDate).split("T")[0] + "T00:00:00")
    : new Date();
  const dateStr = String(financedDate).split("T")[0];
  const start = new Date(dateStr + "T00:00:00");
  const daysAging = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const balance = financedAmount - paidBackAmount;

  let feePercent: number;
  let feeTier: string;
  let dailyRate = 0;

  feePercent = 5;
  feeTier = 'Flat 5%';

  const feeAmount = balance * (feePercent / 100);

  return { daysAging, feeTier, feePercent, feeAmount, balance, dailyRate };
}

export function getAgingColor(days: number): string {
  if (days <= 60) return 'text-green-500';
  if (days <= 75) return 'text-amber-500';
  return 'text-red-500';
}

export function getAgingBadgeVariant(days: number): 'default' | 'secondary' | 'destructive' {
  if (days <= 60) return 'default';
  if (days <= 75) return 'secondary';
  return 'destructive';
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatRMB(amount: number): string {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount);
}

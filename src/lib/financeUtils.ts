// Fee calculation for PO financing
export function calculateFinanceFee(financedAmount: number, financedDate: string, paidBackAmount: number = 0): {
  daysAging: number;
  feeTier: string;
  feePercent: number;
  feeAmount: number;
  balance: number;
  dailyRate: number;
} {
  const now = new Date();
  const start = new Date(financedDate);
  const daysAging = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const balance = financedAmount - paidBackAmount;

  let feePercent: number;
  let feeTier: string;
  let dailyRate = 0;

  if (daysAging <= 60) {
    feePercent = 5;
    feeTier = '0-60 days (5%)';
  } else if (daysAging <= 90) {
    feePercent = 7;
    feeTier = '61-90 days (7%)';
  } else {
    const extraDays = daysAging - 90;
    dailyRate = 0.05; // 0.05% per day
    feePercent = 7 + (extraDays * dailyRate);
    feeTier = `90+ days (7% + ${extraDays}d × 0.05%)`;
  }

  const feeAmount = balance * (feePercent / 100);

  return { daysAging, feeTier, feePercent, feeAmount, balance, dailyRate };
}

export function getAgingColor(days: number): string {
  if (days <= 60) return 'text-green-500';
  if (days <= 90) return 'text-amber-500';
  return 'text-red-500';
}

export function getAgingBadgeVariant(days: number): 'default' | 'secondary' | 'destructive' {
  if (days <= 60) return 'default';
  if (days <= 90) return 'secondary';
  return 'destructive';
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatRMB(amount: number): string {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount);
}

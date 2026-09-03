import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format currency for display - use for totals, subtotals, amounts
 * Shows 2 decimal places
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Format unit price for display - use for per-item prices and costs
 * Shows 3 decimal places for precision
 */
export function formatUnitPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }).format(amount);
}

/**
 * Format a stored calendar date — invoice_date, due_date, order_date,
 * expected_delivery_date, bill_date.
 *
 * These are timestamptz columns that hold a *day*, not an instant, and two
 * writers put different instants in them. A calendar picker sends
 * `date.toISOString()`, which is local midnight — 2026-08-20T06:00:00Z from
 * Mountain Time. An `<input type="date">` sends the bare string "2026-08-20",
 * which Postgres coerces to UTC midnight — 2026-08-20T00:00:00Z. Rendering in
 * local time is correct for the first and a day early for the second, so an
 * invoice dated the 20th printed as the 19th.
 *
 * Reading the calendar day in UTC yields the intended day for both writers, at
 * every negative UTC offset. Use this for stored day columns only — a genuine
 * instant (created_at, a payment timestamp, `new Date()`) must stay local.
 */
export function formatDocDate(
  value: string | Date | null | undefined,
  style: 'long' | 'medium' | 'numeric' = 'medium'
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : style === 'medium'
        ? { year: 'numeric', month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'numeric', day: 'numeric' };

  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date);
}

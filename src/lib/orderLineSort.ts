/** Keep document rows in the saved order without changing the caller's array. */
export function sortOrderLines<T extends { line_number?: number | null }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    (a.line_number ?? Number.POSITIVE_INFINITY) - (b.line_number ?? Number.POSITIVE_INFINITY)
  );
}
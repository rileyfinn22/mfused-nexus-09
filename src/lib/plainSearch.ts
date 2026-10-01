/**
 * Plain-language matching shared by the global search and page searches.
 * Every word typed must appear somewhere in the record, in any order, so
 * "tin merch" matches "Tin Merch Pack" and "17971.20" matches "$17,971.20".
 */
export const normalize = (s: unknown): string =>
  String(s ?? "").toLowerCase().replace(/[$,]/g, "");

export const tokenize = (q: string): string[] =>
  normalize(q).split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean);

/** Flatten nested objects/arrays (line items, company, dates) into one searchable string. */
export function haystack(value: unknown, depth = 0): string {
  if (value == null || depth > 4) return "";
  if (Array.isArray(value)) return value.map((v) => haystack(v, depth + 1)).join(" ");
  if (value instanceof Date) return dateForms(value);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map((v) => haystack(v, depth + 1)).join(" ");
  if (typeof value === "number") return `${value} ${value.toFixed(2)}`;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return `${s} ${dateForms(d)}`;
  }
  return s;
}

function dateForms(d: Date): string {
  const m = d.getUTCMonth() + 1, day = d.getUTCDate(), y = d.getUTCFullYear();
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${m}/${day}/${y} ${String(m).padStart(2, "0")}/${String(day).padStart(2, "0")}/${y} ${mon} ${day} ${y}`;
}

/** True when every typed word is found in the record (any field, any nesting). */
export function matchesQuery(record: unknown, query: string): boolean {
  const toks = tokenize(query);
  if (!toks.length) return true;
  const hay = normalize(haystack(record));
  return toks.every((t) => hay.includes(t));
}

/** Filter a list in plain language. */
export function plainFilter<T>(items: T[], query: string, pick?: (item: T) => unknown): T[] {
  if (!tokenize(query).length) return items;
  return items.filter((i) => matchesQuery(pick ? pick(i) : i, query));
}

/** Split text into parts, marking the pieces that matched a typed word. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const toks = tokenize(query).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!toks.length || !text) return [{ text, hit: false }];
  const re = new RegExp(`(${toks.join("|")})`, "gi");
  return text.split(re).filter(Boolean).map((p) => ({ text: p, hit: re.test(p) && (re.lastIndex = 0, true) }));
}

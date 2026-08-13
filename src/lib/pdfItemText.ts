// Shared helper so every generated PDF shows the FULL product description
// under the product name in the DESCRIPTION column (not just the name).
export function pdfItemDescription(
  item: { name?: string | null; description?: string | null } | null | undefined
): string {
  const name = (item?.name || "").trim();
  const description = (item?.description || "").trim();
  if (!description) return name;
  if (!name) return description;
  // Avoid duplicating when the description already repeats the name
  if (description === name) return name;
  return `${name}\n${description}`;
}

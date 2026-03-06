

## Problem

38 products have stacked/duplicate template prefixes. The template name is **"AZ Sleeves"** but during creation, the input variant name already contained "AZ Sleeve -", so the prefixing logic produced:

`AZ Sleeves - AZ Sleeve - Twisted - Sour Applez`

When it should be:

`AZ Sleeves - Twisted - Sour Applez`

## Fix

### 1. Database cleanup -- rename 38 affected products

Strip the redundant "AZ Sleeve - " segment from all products matching the pattern `AZ Sleeves - AZ Sleeve - %`:

```sql
UPDATE products
SET name = REPLACE(name, 'AZ Sleeves - AZ Sleeve - ', 'AZ Sleeves - ')
WHERE name LIKE 'AZ Sleeves - AZ Sleeve - %';
```

### 2. Harden prefix logic to prevent future stacking

In both `QuickAddProductsDialog.tsx` (line ~131) and `AnalyzePOProductsDialog.tsx`, before prepending the template name, strip any existing occurrence of the template name (or close variant) from the input name. This is the same anti-stacking pattern referenced in the memory notes.

The check: if the variant label already starts with the template name (case-insensitive, with or without trailing "s"), strip it before building `[Template Name] - [Variant Label]`.

```typescript
// Before: "AZ Sleeve - Twisted - Sour Applez"
// Template: "AZ Sleeves"
// Normalize: strip "AZ Sleeve(s) - " prefix → "Twisted - Sour Applez"
// Result: "AZ Sleeves - Twisted - Sour Applez"
```

### Summary
- One DB update to fix 38 product names
- One code guard in the Quick Add and PO analysis flows to prevent recurrence


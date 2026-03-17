

## Language Toggle for Finance Section

### Overview
Add a Chinese/English language toggle to the Financing page and the public FinanceView page. The toggle switches all labels, and also changes which currency is displayed as the primary amount (USD for English, RMB for Chinese), with the secondary currency shown smaller underneath.

### How it works
- **Toggle button** in the header area (e.g., a `中/EN` button or a small dropdown) that stores the preference in `localStorage`
- **When English**: USD amounts are primary (large), RMB shown as small muted text below
- **When Chinese**: RMB amounts are primary (large), USD shown as small muted text below
- Both currencies always visible — just different visual hierarchy

### Files to change

**1. New file: `src/lib/financeI18n.ts`**
- A translations dictionary with keys for all labels used in the finance pages (e.g., `"Active Financed"` / `"融资总额"`, `"Description"` / `"描述"`, `"Aging"` / `"账龄"`, etc.)
- A helper hook `useFinanceLang()` that reads/writes `localStorage("finance-lang")` and returns `{ lang, setLang, t }` where `t(key)` returns the translated string

**2. `src/pages/Financing.tsx`**
- Add the language toggle button next to the refresh/export buttons
- Replace all hardcoded English labels with `t("key")` calls
- Summary cards: show dual currency with primary/secondary styling based on lang
- Table cells for amounts: render primary currency large, secondary currency as `<span className="block text-[9px] text-muted-foreground/50">` underneath
- Each invoice already has `financed_amount` (USD) and `financed_amount_rmb` (RMB), plus `exchange_rate` — use these for conversion

**3. `src/pages/FinanceView.tsx`**
- Same language toggle (this page is already in Chinese by default)
- Same dual-currency display pattern
- Replace hardcoded Chinese strings with `t()` calls

**4. `src/components/FinanceConfirmationsTab.tsx`**
- Translate the tab's labels using the same `t()` helper

**5. `src/components/AcceptFinanceRequestDialog.tsx`**
- Translate dialog labels

### Dual Currency Display Pattern
```text
English mode:          Chinese mode:
  $1,250.00              ¥9,000.00
  ¥9,000.00              $1,250.00   (small/muted)
```

A reusable `DualCurrency` component will render this pattern given `usd`, `rmb`, and `lang`.


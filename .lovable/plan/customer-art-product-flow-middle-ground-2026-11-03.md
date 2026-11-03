# Customer art + product flow: middle ground

Goal: customers upload art and create products fast (no required specs, no waiting on Carrie), while Carrie gets everything she needs in one place and can clean up products easily.

## Decisions (from Riley)

- Specs: one optional text box, not line-by-line required fields.
- Artwork must always be attached to a product — one the customer made or one Vibe made. No orphan art floating without a product.
- New-submission email goes to Carrie + the existing staff alert list.
- "Proofs to review" email to the customer is sent by a button Carrie clicks, not automatically.

## What changes

### 1. Customer upload flow (fast path stays fast)

- When a customer uploads art, they must pick a product: either an existing one, or "New product" which quick-creates one with just a name + product type (Labels/Tubes/etc. per their company's groups).
- The upload dialog gets one optional **Specs / notes** box (big textarea). Anything they type is saved with the product and shown to staff.
- No required fields beyond name + type + the art file. No waiting on Carrie for SKUs or order numbers.

### 2. What Carrie sees (staff side)

- Customer-submitted art already lands on the Customer Art tab with the blue "action needed" dot — keep that.
- On the product's art page, Carrie sees the customer's spec notes alongside the files, so she doesn't hunt for them.
- New email: **"Customer art submitted"** to Carrie + admin alert list, containing company, product name, SKU, the spec notes, and a link straight to that product's art.

### 3. Easy cleanup for Carrie

- Customer-created products are flagged (e.g. "Customer added" badge) so Carrie can find them quickly on the Products page.
- On Edit Product she can already rename, set brand/template, and edit specs. Add: **change the SKU** — when she assigns Justin's real SKU, the product's artwork rows are re-keyed to the new SKU in the same action, so art stays connected (today art is keyed by SKU, so renaming breaks the link — this fixes Carrie's "no way to connect our proofs to their art" complaint).
- Convert-to-template (already built) stays available if the product later needs SKUs.

### 4. Proof notification button

- When Carrie uploads a Vibe proof on a product, a **"Notify customer"** button appears. Clicking it sends the customer a branded email: "You have proofs to review" with a link to the product's art page.
- Button is disabled until at least one proof exists; shows when it was last sent.

## What we're NOT doing

- No required line-by-line spec forms for customers (Carrie's full questionnaire) — Riley chose the optional single box.
- No automatic proof emails — Carrie controls when the customer is notified.
- No changes to order/invoice flows.

## Technical notes

- Specs text: reuse `product_states.specs` (already written by AddProductDialog) or product `description`; display it in CustomerArtworkTab product view and include it in the submission email.
- SKU change: staff-only path (vibe_admin) on EditProduct; updates `products.item_id` and re-keys `artwork_files.sku` (customer + vibe_proof rows) in one transaction via a SECURITY INVOKER RPC, following the `save_order_lines`/`convert_product_to_template` pattern. Refuse if the new SKU already exists on another product.
- "Customer added" flag: new nullable column `products.created_by_role` (or reuse existing metadata if present) set by `create_customer_product`; badge + filter on Products page for staff.
- Emails: two new React Email templates in `supabase/functions/_shared/transactional-email-templates/` (`customer-art-submitted`, `proofs-ready`), registered in `registry.ts`, sent via `send-transactional-email`. Recipients: Carrie + the internal alert subscriber list used by `alert_on_customer_art`. Proof email goes to the company's users.
- Customer-art-submitted trigger: extend the existing customer-art alert path so the email carries product name, SKU, and spec notes.
- Migration needed for the new column; GRANTs included per public-schema rules.

## Verification

- Vitest: SKU re-key RPC (renames art rows, rejects duplicate SKU), spec text round-trip.
- Playwright: customer uploads art with specs on a quick-created product → Carrie's view shows art + specs + badge; SKU change keeps art attached; "Notify customer" sends and shows sent state.

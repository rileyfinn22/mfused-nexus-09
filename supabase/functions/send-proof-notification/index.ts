// "Notify customer" button on the artwork page: emails a company's users that proofs are
// ready to review for one product. Staff-only (vibe_admin). The caller passes only a
// product id — recipients and content are built here so nobody can spoof them.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { renderEmail, paragraph, detailCard, buttons, escapeHtml } from "../_shared/emailLayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = Deno.env.get("PUBLIC_APP_URL") || "https://vibepkgportal.com";
const FROM = "VibePKG Portal <noreply@vibepkgportal.com>";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sign in required" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return json({ error: "sign in required" }, 401);

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "vibe_admin" });
  if (!isAdmin) return json({ error: "staff only" }, 403);

  let productId: string | undefined;
  try {
    const body = await req.json();
    productId = typeof body?.product_id === "string" ? body.product_id : undefined;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!productId) return json({ error: "product_id required" }, 400);

  const { data: product, error: productError } = await admin
    .from("products")
    .select("id, name, item_id, company_id")
    .eq("id", productId)
    .maybeSingle();
  if (productError) return json({ error: productError.message }, 500);
  if (!product) return json({ error: "product not found" }, 404);
  if (!product.item_id) return json({ error: "product has no SKU yet" }, 400);

  // There must be at least one proof (non-customer artwork) to review.
  const { count: proofCount, error: proofError } = await admin
    .from("artwork_files")
    .select("id", { count: "exact", head: true })
    .eq("sku", product.item_id)
    .eq("company_id", product.company_id)
    .or("artwork_type.is.null,artwork_type.neq.customer");
  if (proofError) return json({ error: proofError.message }, 500);
  if (!proofCount) return json({ error: "no proofs uploaded for this product yet" }, 400);

  // Recipients: the company's portal users.
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "company")
    .eq("company_id", product.company_id);
  if (rolesError) return json({ error: rolesError.message }, 500);

  const emails = new Set<string>();
  for (const r of roles ?? []) {
    const { data } = await admin.auth.admin.getUserById(r.user_id);
    if (data?.user?.email) emails.add(data.user.email.toLowerCase());
  }
  if (emails.size === 0) return json({ error: "no portal users found for this company" }, 400);

  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", product.company_id)
    .maybeSingle();
  const companyName = company?.name || "your company";

  const url = `${PORTAL_URL}/artwork?tab=proofs&sku=${encodeURIComponent(product.item_id)}`;
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  const sent = await resend.emails.send({
    from: FROM,
    to: [...emails],
    subject: `Proofs to review: ${product.name}`,
    html: renderEmail({
      documentLabel: "PROOFS READY",
      heading: `You have proofs to review for ${escapeHtml(product.name)}`,
      bodyHtml:
        paragraph(`VibePKG has uploaded proofs for <strong>${escapeHtml(companyName)}</strong>. Please review and approve them, or leave a note if something needs to change.`) +
        detailCard([
          { label: "Product", value: escapeHtml(product.name), emphasis: true },
          { label: "SKU", value: escapeHtml(product.item_id), mono: true },
        ]) +
        buttons([{ label: "Review proofs", url }]),
      noReply: true,
    }),
  });
  if (sent.error) return json({ error: `Resend: ${JSON.stringify(sent.error)}` }, 500);

  await admin
    .from("products")
    .update({ proof_notified_at: new Date().toISOString() })
    .eq("id", product.id);

  return json({ success: true, recipients: emails.size });
});

// Emails the subscribed VibePKG admins (internal_alert_subscribers) when a customer acts in the portal.
//
// Called by the database, not the browser: the triggers in
// supabase/migrations/20260925120000_internal_alerts.sql insert a row into
// public.internal_alert_log and POST { alert_id } here through pg_net. This function
// owns the rest — it loads the record with the service role, builds the message,
// sends it through Resend, and marks the log row sent / failed / skipped.
//
// The body is only ever an alert id, so a caller can't choose recipients or content.
// A row that is no longer 'queued' is skipped, which makes retries harmless.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { renderEmail, paragraph, detailCard, buttons, escapeHtml, EMAIL } from "../_shared/emailLayout.ts";

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

type AlertRow = {
  id: string;
  event: string;
  record_id: string;
  company_id: string | null;
  status: string;
};

type Message = { subject: string; html: string; to?: string[] };

const money = (n: unknown) =>
  `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        timeZone: "America/Denver",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

const dateOnly = (iso: string | null | undefined) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

/** Email addresses of the subscribed admins: internal_alert_subscribers ∩ vibe_admin. */
async function subscriberEmails(admin: ReturnType<typeof createClient>): Promise<string[]> {
  const { data: roles, error } = await admin.from("user_roles").select("user_id").eq("role", "vibe_admin");
  if (error) throw new Error(`user_roles: ${error.message}`);
  const admins = new Set((roles ?? []).map((r: { user_id: string }) => r.user_id));

  const { data: subs, error: subsError } = await admin.from("internal_alert_subscribers").select("user_id");
  if (subsError) throw new Error(`internal_alert_subscribers: ${subsError.message}`);
  const ids = new Set((subs ?? []).map((s: { user_id: string }) => s.user_id).filter((id: string) => admins.has(id)));
  if (ids.size === 0) return [];

  const { data, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw new Error(`listUsers: ${usersError.message}`);

  const emails = new Set<string>();
  for (const u of data.users) {
    if (ids.has(u.id) && u.email) emails.add(u.email.toLowerCase());
  }
  return [...emails];
}

async function companyName(admin: ReturnType<typeof createClient>, id: string | null): Promise<string> {
  if (!id) return "A customer";
  const { data } = await admin.from("companies").select("name").eq("id", id).maybeSingle();
  return data?.name || "A customer";
}

async function orderSubmitted(admin: ReturnType<typeof createClient>, alert: AlertRow): Promise<Message> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, order_number, company_id, po_number, due_date, customer_name, customer_email, memo, created_at")
    .eq("id", alert.record_id)
    .maybeSingle();
  if (error) throw new Error(`orders: ${error.message}`);
  if (!order) throw new Error(`order ${alert.record_id} not found`);

  // Customer-facing columns only. Never vendor_cost / vendor_id / vibenotes.
  const { data: items } = await admin
    .from("order_items")
    .select("name, sku, quantity, unit_price, total")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  const company = await companyName(admin, order.company_id ?? alert.company_id);
  const lines = items ?? [];
  const orderTotal = lines.reduce((sum: number, i: { total: unknown }) => sum + Number(i.total ?? 0), 0);

  const itemRows = lines
    .map(
      (i: { name: string; sku: string | null; quantity: number; unit_price: unknown; total: unknown }) => `
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid ${EMAIL.rule}; color: ${EMAIL.ink}; font-size: 14px;">
            ${escapeHtml(i.name)}${i.sku ? `<br><span style="color: ${EMAIL.muted}; font-size: 12px; font-family: 'SF Mono', Menlo, Consolas, monospace;">${escapeHtml(i.sku)}</span>` : ""}
          </td>
          <td align="right" style="padding: 8px 0 8px 12px; border-top: 1px solid ${EMAIL.rule}; color: ${EMAIL.body}; font-size: 14px; white-space: nowrap;">${escapeHtml(i.quantity)} × ${escapeHtml(money(i.unit_price))}</td>
          <td align="right" style="padding: 8px 0 8px 12px; border-top: 1px solid ${EMAIL.rule}; color: ${EMAIL.ink}; font-size: 14px; font-weight: 600; white-space: nowrap;">${escapeHtml(money(i.total))}</td>
        </tr>`,
    )
    .join("");

  const itemsTable = lines.length
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
        <tr>
          <td style="padding: 0 0 6px 0; color: ${EMAIL.muted}; font-size: 12px; font-weight: 600;">ITEMS</td>
          <td></td>
          <td align="right" style="padding: 0 0 6px 0; color: ${EMAIL.muted}; font-size: 12px; font-weight: 600;">TOTAL ${escapeHtml(money(orderTotal))}</td>
        </tr>
        ${itemRows}
      </table>`
    : "";

  const due = dateOnly(order.due_date);
  const rows = [
    { label: "Customer", value: escapeHtml(company), emphasis: true },
    { label: "Order", value: escapeHtml(order.order_number), mono: true },
    ...(order.po_number ? [{ label: "Customer PO", value: escapeHtml(order.po_number), mono: true }] : []),
    ...(due ? [{ label: "Requested due date", value: escapeHtml(due) }] : []),
    ...(order.customer_name || order.customer_email
      ? [{ label: "Placed by", value: escapeHtml([order.customer_name, order.customer_email].filter(Boolean).join(" · ")) }]
      : []),
    { label: "Submitted", value: escapeHtml(when(order.created_at)) },
  ];

  const memo = order.memo ? paragraph(`<strong>Customer note:</strong> ${escapeHtml(order.memo)}`) : "";

  return {
    subject: `New order ${order.order_number} from ${company}`,
    html: renderEmail({
      documentLabel: "NEW CUSTOMER ORDER",
      heading: `${company} placed order ${order.order_number}`,
      bodyHtml:
        paragraph("A customer submitted an order through the portal. It is pending and waiting for VibePKG approval.") +
        detailCard(rows) +
        memo +
        itemsTable +
        buttons([{ label: "Review order", url: `${PORTAL_URL}/orders/${order.id}` }]),
      noReply: true,
    }),
  };
}

async function artworkUploaded(admin: ReturnType<typeof createClient>, alert: AlertRow): Promise<Message> {
  const { data: art, error } = await admin
    .from("artwork_files")
    .select("id, sku, filename, artwork_url, preview_url, notes, company_id, created_at")
    .eq("id", alert.record_id)
    .maybeSingle();
  if (error) throw new Error(`artwork_files: ${error.message}`);
  if (!art) throw new Error(`artwork ${alert.record_id} not found`);

  const company = await companyName(admin, art.company_id ?? alert.company_id);

  let productName: string | null = null;
  if (art.company_id) {
    const { data: product } = await admin
      .from("products")
      .select("name")
      .eq("company_id", art.company_id)
      .eq("item_id", art.sku)
      .limit(1)
      .maybeSingle();
    productName = product?.name ?? null;
  }

  const rows = [
    { label: "Customer", value: escapeHtml(company), emphasis: true },
    ...(productName ? [{ label: "Product", value: escapeHtml(productName) }] : []),
    { label: "SKU", value: escapeHtml(art.sku), mono: true },
    { label: "File", value: escapeHtml(art.filename || "(unnamed file)") },
    ...(art.notes ? [{ label: "Notes", value: escapeHtml(art.notes) }] : []),
    { label: "Uploaded", value: escapeHtml(when(art.created_at)) },
  ];

  const preview = art.preview_url
    ? `<p style="margin: 0 0 24px 0;"><img src="${escapeHtml(art.preview_url)}" alt="${escapeHtml(art.filename || art.sku)}" style="display: block; max-width: 100%; height: auto; border: 1px solid ${EMAIL.rule}; border-radius: 6px;" /></p>`
    : "";

  return {
    subject: `New artwork from ${company}: ${art.sku}`,
    html: renderEmail({
      documentLabel: "NEW CUSTOMER ARTWORK",
      heading: `${company} uploaded artwork for ${art.sku}`,
      bodyHtml:
        paragraph("A customer added artwork through the portal. It is unapproved and waiting for review.") +
        detailCard(rows) +
        preview +
        buttons([
          { label: "Review in portal", url: `${PORTAL_URL}/artwork?tab=customer&sku=${encodeURIComponent(art.sku)}` },
          ...(art.artwork_url ? [{ label: "Open file", url: art.artwork_url, secondary: true }] : []),
        ]),
      noReply: true,
    }),
  };
}

async function artworkRejected(admin: ReturnType<typeof createClient>, alert: AlertRow): Promise<Message> {
  const { data: rej, error } = await admin
    .from("rejected_artwork_files")
    .select("id, sku, filename, rejection_reason, company_id, rejected_at, artwork_type")
    .eq("id", alert.record_id)
    .maybeSingle();
  if (error) throw new Error(`rejected_artwork_files: ${error.message}`);
  if (!rej) throw new Error(`rejected artwork ${alert.record_id} not found`);
  const companyId = rej.company_id ?? alert.company_id;
  const company = await companyName(admin, companyId);

  let productName: string | null = null;
  if (companyId) {
    const { data: product } = await admin.from("products").select("name")
      .eq("company_id", companyId).eq("item_id", rej.sku).limit(1).maybeSingle();
    productName = product?.name ?? null;
  }

  // Recipients: the customer's own portal users (never VibePKG staff-only addresses).
  const to = new Set<string>();
  if (companyId) {
    const { data: roles } = await admin.from("user_roles").select("user_id, role").eq("company_id", companyId);
    const ids = new Set((roles ?? []).filter((r: any) => ["company", "customer", "admin"].includes(r.role)).map((r: any) => r.user_id));
    if (ids.size) {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of data?.users ?? []) if (ids.has(u.id) && u.email && !u.email.endsWith("@vendor.local")) to.add(u.email.toLowerCase());
    }
  }

  const tab = rej.artwork_type === "vibe_proof" ? "proofs" : "customer";
  const url = `${PORTAL_URL}/artwork?tab=${tab}&sku=${encodeURIComponent(rej.sku)}`;
  return {
    subject: `Artwork needs changes: ${productName || rej.sku}`,
    html: renderEmail({
      documentLabel: "ARTWORK RETURNED",
      heading: `Please resubmit artwork for ${productName || rej.sku}`,
      bodyHtml:
        paragraph(`VibePKG reviewed the artwork ${escapeHtml(company)} submitted and it needs changes before we can proof it. The file has been moved to your rejected archive.`) +
        detailCard([
          ...(productName ? [{ label: "Product", value: escapeHtml(productName), emphasis: true }] : []),
          { label: "SKU", value: escapeHtml(rej.sku), mono: true },
          { label: "File", value: escapeHtml(rej.filename || "(unnamed file)") },
          { label: "Reason", value: escapeHtml(rej.rejection_reason || ""), danger: true },
          { label: "Returned", value: escapeHtml(when(rej.rejected_at)) },
        ]) +
        buttons([{ label: "Upload new artwork", url }]),
      noReply: true,
    }),
    to: [...to],
  };
}

async function orderCreated(admin: ReturnType<typeof createClient>, alert: AlertRow): Promise<Message> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, order_number, company_id, created_by, customer_name, customer_email, created_at")
    .eq("id", alert.record_id)
    .maybeSingle();
  if (error) throw new Error(`orders: ${error.message}`);
  if (!order) throw new Error(`order ${alert.record_id} not found`);

  const company = await companyName(admin, order.company_id ?? alert.company_id);
  let enteredBy = "";
  if (order.created_by) {
    const { data } = await admin.auth.admin.getUserById(order.created_by);
    const u = data?.user;
    enteredBy = (u?.user_metadata?.full_name as string) || u?.email || "";
  }
  if (!enteredBy) enteredBy = [order.customer_name, order.customer_email].filter(Boolean).join(" · ") || "Unknown";

  return {
    subject: `New order ${order.order_number} — ${company}`,
    html: renderEmail({
      documentLabel: "NEW ORDER",
      heading: `New order ${order.order_number}`,
      bodyHtml:
        detailCard([
          { label: "Order", value: escapeHtml(order.order_number), mono: true, emphasis: true },
          { label: "Date", value: escapeHtml(when(order.created_at)) },
          { label: "Customer", value: escapeHtml(company) },
          { label: "Entered by", value: escapeHtml(enteredBy) },
        ]) + buttons([{ label: "Open order", url: `${PORTAL_URL}/orders/${order.id}` }]),
      noReply: true,
    }),
  };
}

const VENDOR_KINDS: Record<string, { label: string; userCol: string; poCol?: string }> = {
  vendor_po_status_history: { label: "Status update", userCol: "changed_by", poCol: "vendor_po_id" },
  vendor_po_production_updates: { label: "Production update", userCol: "created_by", poCol: "vendor_po_id" },
  vendor_po_packing_lists: { label: "Packing list uploaded", userCol: "created_by", poCol: "vendor_po_id" },
  production_stage_updates: { label: "Production stage update", userCol: "updated_by" },
  shipment_legs: { label: "Shipment added", userCol: "created_by", poCol: "vendor_po_id" },
};

async function vendorUpdate(admin: ReturnType<typeof createClient>, alert: AlertRow): Promise<Message> {
  const table = alert.event.split(":")[1];
  const kind = VENDOR_KINDS[table];
  if (!kind) throw new Error(`unknown vendor table ${table}`);
  const { data: row, error } = await admin.from(table).select("*").eq("id", alert.record_id).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  if (!row) throw new Error(`${table} ${alert.record_id} not found`);
  const r = row as Record<string, any>;

  let poId: string | null = kind.poCol ? r[kind.poCol] ?? null : null;
  let orderId: string | null = r.order_id ?? null;
  if (table === "production_stage_updates" && r.stage_id) {
    const { data: st } = await admin.from("production_stages").select("order_id, stage_name").eq("id", r.stage_id).maybeSingle();
    orderId = st?.order_id ?? null;
    if (st?.stage_name) r.__stage = st.stage_name;
  }

  let poNumber = "", vendorName = "", customer = "", orderNumber = "";
  let customerId: string | null = null;
  let orderRep: string | null = null;
  if (poId) {
    const { data: po } = await admin.from("vendor_pos").select("po_number, vendor_id, order_id, customer_company_id").eq("id", poId).maybeSingle();
    if (po) {
      poNumber = po.po_number ?? "";
      orderId = orderId ?? po.order_id;
      if (po.vendor_id) {
        const { data: v } = await admin.from("vendors").select("name").eq("id", po.vendor_id).maybeSingle();
        vendorName = v?.name ?? "";
      }
      if (po.customer_company_id) { customerId = po.customer_company_id; customer = await companyName(admin, po.customer_company_id); }
    }
  }
  if (orderId) {
    const { data: o } = await admin.from("orders").select("order_number, company_id, sales_rep_email").eq("id", orderId).maybeSingle();
    orderNumber = o?.order_number ?? "";
    if (o?.sales_rep_email) orderRep = o.sales_rep_email;
    if (!customerId && o?.company_id) { customerId = o.company_id; customer = await companyName(admin, o.company_id); }
  }

  let who = "";
  const uid = r[kind.userCol];
  if (uid) {
    const { data } = await admin.auth.admin.getUserById(uid);
    who = (data?.user?.user_metadata?.full_name as string) || data?.user?.email || "";
  }
  if (!who) who = vendorName || "Vendor (shipment link)";

  const detail =
    r.new_status ? `${r.previous_status ?? "—"} → ${r.new_status}` : "";
  const note = r.note ?? r.note_text ?? r.notes ?? "";
  const rows = [
    { label: "Update", value: escapeHtml(kind.label + (r.__stage ? ` — ${r.__stage}` : "")), emphasis: true },
    ...(vendorName ? [{ label: "Vendor", value: escapeHtml(vendorName) }] : []),
    ...(poNumber ? [{ label: "Vendor PO", value: escapeHtml(poNumber), mono: true }] : []),
    ...(orderNumber ? [{ label: "Order", value: escapeHtml(orderNumber), mono: true }] : []),
    ...(customer ? [{ label: "Customer", value: escapeHtml(customer) }] : []),
    ...(detail ? [{ label: "Status", value: escapeHtml(detail) }] : []),
    ...(r.committed_ship_date ? [{ label: "Committed ship date", value: escapeHtml(dateOnly(r.committed_ship_date) ?? "") }] : []),
    ...(r.is_delayed ? [{ label: "Delayed", value: escapeHtml(r.delay_reason || "Yes"), danger: true }] : []),
    ...(r.percent_at_time != null ? [{ label: "Progress", value: `${escapeHtml(r.percent_at_time)}%` }] : []),
    ...(r.file_name ? [{ label: "File", value: escapeHtml(r.file_name) }] : []),
    ...(r.tracking_number ? [{ label: "Tracking", value: escapeHtml(`${r.carrier ?? ""} ${r.tracking_number}`.trim()), mono: true }] : []),
    ...(note ? [{ label: "Note", value: escapeHtml(note) }] : []),
    { label: "Updated by", value: escapeHtml(who) },
    { label: "When", value: escapeHtml(when(r.created_at)) },
  ];

  const url = poId ? `${PORTAL_URL}/vendor-pos/${poId}` : orderId ? `${PORTAL_URL}/orders/${orderId}` : PORTAL_URL;
  const to = new Set(["carrie@vibepkg.com", "taz@vibepkg.com"]);
  if (orderRep) to.add(orderRep.toLowerCase());
  else if (customerId) {
    const { data: c } = await admin.from("companies").select("sales_rep_email").eq("id", customerId).maybeSingle();
    if (c?.sales_rep_email) to.add(c.sales_rep_email.toLowerCase());
  }
  const ref = poNumber ? `PO ${poNumber}` : orderNumber ? `order ${orderNumber}` : "a PO";
  return {
    subject: `Vendor update: ${kind.label} on ${ref}${vendorName ? ` (${vendorName})` : ""}`,
    html: renderEmail({
      documentLabel: "VENDOR UPDATE",
      heading: `${vendorName || "A vendor"} updated ${ref}`,
      bodyHtml: detailCard(rows) + buttons([{ label: "Open in portal", url }]),
      noReply: true,
    }),
    to: [...to],
  };
}

const FIXED_RECIPIENTS: Record<string, string[]> = {
  order_created: ["justin@vibepkg.com", "carrie@vibepkg.com"],
};

const builders: Record<string, (admin: ReturnType<typeof createClient>, alert: AlertRow) => Promise<Message>> = {
  order_submitted: orderSubmitted,
  artwork_uploaded: artworkUploaded,
  artwork_rejected: artworkRejected,
  order_created: orderCreated,
  ...Object.fromEntries(Object.keys(VENDOR_KINDS).map((t) => [`vendor_update:${t}`, vendorUpdate])),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let alertId: string | undefined;
  try {
    const body = await req.json();
    alertId = typeof body?.alert_id === "string" ? body.alert_id : undefined;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!alertId) return json({ error: "alert_id required" }, 400);

  const { data: alert, error: alertError } = await admin
    .from("internal_alert_log")
    .select("id, event, record_id, company_id, status")
    .eq("id", alertId)
    .maybeSingle();
  if (alertError) return json({ error: alertError.message }, 500);
  if (!alert) return json({ error: "alert not found" }, 404);
  if (alert.status !== "queued") return json({ skipped: true, status: alert.status });

  const fail = async (message: string, status = 500) => {
    console.error(`notify-internal ${alert.event} ${alert.record_id}: ${message}`);
    await admin.from("internal_alert_log").update({ status: "failed", error: message.slice(0, 2000) }).eq("id", alert.id);
    return json({ error: message }, status);
  };

  const build = builders[alert.event];
  if (!build) return fail(`unknown event ${alert.event}`, 400);

  try {
    const message = await build(admin, alert as AlertRow);
    const recipients = message.to ?? FIXED_RECIPIENTS[alert.event] ?? await subscriberEmails(admin);
    if (recipients.length === 0) {
      await admin.from("internal_alert_log").update({ status: "skipped", error: "no subscribed vibe_admin recipients" }).eq("id", alert.id);
      return json({ skipped: true, reason: "no recipients" });
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const sent = await resend.emails.send({ from: FROM, to: recipients, subject: message.subject, html: message.html });
    if (sent.error) throw new Error(`Resend: ${JSON.stringify(sent.error)}`);

    await admin
      .from("internal_alert_log")
      .update({ status: "sent", recipients, sent_at: new Date().toISOString(), error: null })
      .eq("id", alert.id);

    return json({ success: true, recipients: recipients.length, messageId: sent.data?.id });
  } catch (e) {
    return fail(String((e as Error)?.message ?? e));
  }
});

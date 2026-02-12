import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map spreadsheet column headers to stage_name values
const SHEET_STAGE_MAP: Record<string, string> = {
  "ESTIMATE SENT": "estimate_sent",
  "ART APPROVED": "art_approved",
  "DEPOSIT PAID": "deposit_paid",
  "ORDER CONFIRMED": "order_confirmed",
  "PO SENT": "po_sent",
  "MATERIALS ORDERED": "materials_ordered",
  "PRE-PRESS": "pre_press",
  "PROOF APPROVED": "proof_approved",
  "VENDOR DEPOSIT": "vendor_deposit",
  "PRODUCTION COMPLETE": "production_complete",
  "IN TRANSIT": "in_transit",
  "DELIVERED": "delivered",
};

// All 12 stages in order
const ALL_STAGES = [
  "estimate_sent",
  "art_approved",
  "deposit_paid",
  "order_confirmed",
  "po_sent",
  "materials_ordered",
  "pre_press",
  "proof_approved",
  "vendor_deposit",
  "production_complete",
  "in_transit",
  "delivered",
];

function parseStageStatus(value: string | undefined | null): string {
  if (!value) return "pending";
  const v = String(value).trim().toLowerCase();
  if (["done", "complete", "completed", "yes", "x", "✓", "✔"].includes(v)) return "completed";
  if (["in progress", "in_progress", "started", "wip", "working"].includes(v)) return "in_progress";
  if (v.length > 0 && v !== "pending" && v !== "no" && v !== "n/a") return "in_progress";
  return "pending";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const googleApiKey = Deno.env.get("GOOGLE_SHEETS_API_KEY")!;

    // Auth check
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { spreadsheetId, sheetName, companyId } = body;

    if (!spreadsheetId || !companyId) {
      return new Response(JSON.stringify({ error: "spreadsheetId and companyId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const range = sheetName ? `${sheetName}!A1:Z1000` : "A1:Z1000";
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${googleApiKey}`;

    const sheetsRes = await fetch(sheetsUrl);
    if (!sheetsRes.ok) {
      const errText = await sheetsRes.text();
      return new Response(JSON.stringify({ error: "Google Sheets API error", details: errText }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sheetsData = await sheetsRes.json();
    const rows: string[][] = sheetsData.values || [];
    if (rows.length < 2) {
      return new Response(JSON.stringify({ error: "No data rows found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = rows[0].map((h: string) => h.trim().toUpperCase());
    const dataRows = rows.slice(1);

    // Find column indices
    const colIdx = (name: string) => headers.indexOf(name);
    const orderCol = colIdx("ORDER #");
    if (orderCol === -1) {
      return new Response(JSON.stringify({ error: "Column 'ORDER #' not found in sheet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trackingCol = colIdx("TRACKING");
    const etaCol = headers.findIndex(h => h.includes("ETA"));
    const lastActionCol = colIdx("LAST / NEXT ACTION");
    const notesCol = colIdx("NOTES");
    const vendorCol = colIdx("VENDOR");
    const vendorCostCol = colIdx("VENDOR COST");
    const vibePOCol = colIdx("VIBE PO #");

    // Build stage column map
    const stageColMap: Record<string, number> = {};
    for (const [sheetHeader, stageName] of Object.entries(SHEET_STAGE_MAP)) {
      const idx = colIdx(sheetHeader);
      if (idx !== -1) stageColMap[stageName] = idx;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let synced = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const row of dataRows) {
      const orderNumber = row[orderCol]?.trim();
      if (!orderNumber) { skipped++; continue; }

      // Find matching order
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, company_id")
        .eq("order_number", orderNumber)
        .eq("company_id", companyId)
        .maybeSingle();

      if (orderErr || !order) {
        skipped++;
        continue;
      }

      // Update tracking number and ETA
      const updates: Record<string, any> = {};
      if (trackingCol !== -1 && row[trackingCol]?.trim()) {
        updates.tracking_number = row[trackingCol].trim();
      }
      if (etaCol !== -1 && row[etaCol]?.trim()) {
        // Try to parse date
        const dateStr = row[etaCol].trim();
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          updates.estimated_delivery_date = parsed.toISOString().split("T")[0];
        }
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from("orders").update(updates).eq("id", order.id);
      }

      // Sync production stages - ensure all 12 exist
      const { data: existingStages } = await supabase
        .from("production_stages")
        .select("id, stage_name, status, sequence_order")
        .eq("order_id", order.id);

      const existingMap = new Map((existingStages || []).map(s => [s.stage_name, s]));

      for (let i = 0; i < ALL_STAGES.length; i++) {
        const stageName = ALL_STAGES[i];
        const sheetColIdx = stageColMap[stageName];
        const sheetValue = sheetColIdx !== undefined ? row[sheetColIdx] : undefined;
        const newStatus = parseStageStatus(sheetValue);

        const existing = existingMap.get(stageName);
        if (existing) {
          // Only update if status differs
          if (existing.status !== newStatus) {
            await supabase
              .from("production_stages")
              .update({ status: newStatus, sequence_order: i })
              .eq("id", existing.id);
          }
        } else {
          // Create missing stage
          await supabase.from("production_stages").insert({
            order_id: order.id,
            stage_name: stageName,
            status: newStatus,
            sequence_order: i,
          });
        }
      }

      // Sync notes (Last/Next Action)
      if (lastActionCol !== -1 && row[lastActionCol]?.trim()) {
        const noteText = row[lastActionCol].trim();
        // Check if this note already exists to avoid duplicates
        const { data: existingNotes } = await supabase
          .from("order_production_updates")
          .select("id, update_text")
          .eq("order_id", order.id)
          .eq("update_text", noteText)
          .limit(1);

        if (!existingNotes || existingNotes.length === 0) {
          await supabase.from("order_production_updates").insert({
            order_id: order.id,
            update_text: `[Sheet Sync] ${noteText}`,
            user_id: user.id,
          });
        }
      }

      // Sync vendor PO data
      if (vibePOCol !== -1 && row[vibePOCol]?.trim()) {
        const poNumber = row[vibePOCol].trim();
        const vendorName = vendorCol !== -1 ? row[vendorCol]?.trim() : null;
        const vendorCostStr = vendorCostCol !== -1 ? row[vendorCostCol]?.trim() : null;
        const vendorCost = vendorCostStr ? parseFloat(vendorCostStr.replace(/[$,]/g, "")) : null;

        // Check if vendor PO exists
        const { data: existingPO } = await supabase
          .from("vendor_pos")
          .select("id, total")
          .eq("po_number", poNumber)
          .eq("order_id", order.id)
          .maybeSingle();

        if (existingPO) {
          // Update total if vendor cost changed
          if (vendorCost !== null && vendorCost !== existingPO.total) {
            await supabase
              .from("vendor_pos")
              .update({ total: vendorCost })
              .eq("id", existingPO.id);
          }
        }
        // We don't auto-create vendor POs from the sheet - that requires vendor assignment
      }

      synced++;
    }

    return new Response(
      JSON.stringify({ success: true, synced, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

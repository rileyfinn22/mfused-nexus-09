import { renderEmail, paragraph, detailCard, buttons, escapeHtml } from "../_shared/emailLayout.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  type: "new_pending" | "request_accepted";
  poNumber?: string;
  description?: string;
  amount?: number;
  financedDate?: string;
  notes?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: NotifyRequest = await req.json();
    const { type, poNumber, description, amount, financedDate, notes } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get finance user emails
    const { data: financeUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "finance");

    // Get vibe admin emails
    const { data: vibeAdmins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "vibe_admin");

    const getUserEmails = async (userIds: string[]) => {
      if (!userIds.length) return [];
      const emails: string[] = [];
      for (const uid of userIds) {
        const { data } = await supabase.auth.admin.getUserById(uid);
        if (data?.user?.email) emails.push(data.user.email);
      }
      return emails;
    };

    const amtFormatted = amount ? `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "N/A";

    if (type === "new_pending") {
      // Notify finance company about new pending request
      const financeEmails = await getUserEmails(
        (financeUsers || []).map((u: any) => u.user_id)
      );
      if (financeEmails.length === 0) {
        return new Response(JSON.stringify({ success: true, skipped: "no_finance_users" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await resend.emails.send({
        from: "VibePKG Portal <noreply@vibepkgportal.com>",
        to: financeEmails,
        subject: `New Financing Request — ${amtFormatted}`,
        html: renderEmail({
          documentLabel: "FINANCING REQUEST",
          heading: "New financing request",
          bodyHtml:
            paragraph("A new vendor PO has been submitted for financing and is awaiting your review.") +
            detailCard([
              ...(poNumber ? [{ label: "Vendor PO", value: escapeHtml(`PO #${poNumber}`), emphasis: true }] : []),
              ...(description ? [{ label: "Description", value: escapeHtml(description) }] : []),
              { label: "Amount", value: escapeHtml(amtFormatted), emphasis: true },
              ...(notes ? [{ label: "Notes", value: escapeHtml(notes) }] : []),
            ]) +
            buttons([{ label: "Review in portal", url: "https://vibepkgportal.com/financing" }]),
        }),
      });
    } else if (type === "request_accepted") {
      // Notify vibe admins that finance accepted
      const adminEmails = await getUserEmails(
        (vibeAdmins || []).map((u: any) => u.user_id)
      );
      if (adminEmails.length === 0) {
        return new Response(JSON.stringify({ success: true, skipped: "no_admins" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await resend.emails.send({
        from: "VibePKG Portal <noreply@vibepkgportal.com>",
        to: adminEmails,
        subject: `Financing Accepted — ${amtFormatted}`,
        html: renderEmail({
          documentLabel: "FINANCING ACCEPTED",
          heading: "Financing request accepted",
          bodyHtml:
            paragraph("The finance company has accepted and processed a financing request.") +
            detailCard([
              ...(poNumber ? [{ label: "Vendor PO", value: escapeHtml(`PO #${poNumber}`), emphasis: true }] : []),
              { label: "Amount", value: escapeHtml(amtFormatted), emphasis: true },
              ...(financedDate ? [{ label: "Financed", value: escapeHtml(financedDate) }] : []),
            ]) +
            buttons([{ label: "View in portal", url: "https://vibepkgportal.com/financing" }]),
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Finance notification error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);

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
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
            <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a1a;">New Financing Request</h2>
            <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0 0 24px;">
              A new vendor PO has been submitted for financing and is awaiting your review.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              ${poNumber ? `<tr><td style="padding: 8px 0; color: #999; font-size: 13px; width: 120px;">Vendor PO</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">PO #${poNumber}</td></tr>` : ""}
              ${description ? `<tr><td style="padding: 8px 0; color: #999; font-size: 13px;">Description</td><td style="padding: 8px 0; font-size: 14px;">${description}</td></tr>` : ""}
              <tr><td style="padding: 8px 0; color: #999; font-size: 13px;">Amount</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${amtFormatted}</td></tr>
              ${notes ? `<tr><td style="padding: 8px 0; color: #999; font-size: 13px;">Notes</td><td style="padding: 8px 0; font-size: 14px;">${notes}</td></tr>` : ""}
            </table>
            <a href="https://vibepkgportal.com/financing" style="display: inline-block; padding: 10px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
              Review in Portal
            </a>
            <p style="margin-top: 32px; font-size: 11px; color: #cc0000;">
              This is an automated notification. Do not reply to this email.
            </p>
          </div>
        `,
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
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
            <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a1a;">Financing Request Accepted</h2>
            <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0 0 24px;">
              The finance company has accepted and processed a financing request.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              ${poNumber ? `<tr><td style="padding: 8px 0; color: #999; font-size: 13px; width: 120px;">Vendor PO</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">PO #${poNumber}</td></tr>` : ""}
              <tr><td style="padding: 8px 0; color: #999; font-size: 13px;">Amount</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${amtFormatted}</td></tr>
              ${financedDate ? `<tr><td style="padding: 8px 0; color: #999; font-size: 13px;">Financed Date</td><td style="padding: 8px 0; font-size: 14px;">${financedDate}</td></tr>` : ""}
            </table>
            <a href="https://vibepkgportal.com/financing" style="display: inline-block; padding: 10px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
              View in Portal
            </a>
            <p style="margin-top: 32px; font-size: 11px; color: #cc0000;">
              This is an automated notification. Do not reply to this email.
            </p>
          </div>
        `,
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    if (token !== serviceKey) {
      const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
      if (!caller) return json({ error: "Unauthorized" }, 401);

      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id)
        .eq("role", "vibe_admin");

      if (!roles || roles.length === 0) return json({ error: "Forbidden" }, 403);
    }

    const { email, redirect_to } = await req.json();
    if (!email) return json({ error: "email is required" }, 400);

    const redirectTo = redirect_to || "https://vibepkgportal.com/reset-password";

    let linkType: "recovery" | "invite" = "recovery";
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo },
      });
      if (inviteError || !inviteData?.properties?.action_link) {
        return json({ error: linkError?.message || inviteError?.message || "Could not generate link" }, 400);
      }
      linkType = "invite";
      return json({ link: inviteData.properties.action_link, type: linkType, email });
    }

    return json({ link: linkData.properties.action_link, type: linkType, email });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

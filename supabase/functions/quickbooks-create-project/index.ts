import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(supabase: any, companyId: string, refreshToken: string) {
  const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
  const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");

  console.log("Attempting token refresh for company:", companyId);

  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Token refresh failed:", data);
    throw new Error(data.error_description || data.error || "Failed to refresh access token");
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  const refreshTokenExpiresAt = new Date(Date.now() + (data.x_refresh_token_expires_in || 8726400) * 1000);

  await supabase
    .from("quickbooks_settings")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: expiresAt.toISOString(),
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
      last_error: null,
      last_error_at: null,
    })
    .eq("company_id", companyId);

  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { orderId } = await req.json();

    console.log("Creating QB Project for order:", orderId);

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        companies:company_id(name, id, quickbooks_id)
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error("Order not found");
    }

    // If order already has a project, return it
    if (order.qb_project_id) {
      console.log("Order already has QB Project ID:", order.qb_project_id);
      return new Response(
        JSON.stringify({
          success: true,
          qb_project_id: order.qb_project_id,
          message: "QuickBooks Project already exists",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get VibePKG's company_id (the vibe_admin's company that manages QuickBooks)
    const { data: vibeAdmin, error: vibeAdminError } = await supabase
      .from("user_roles")
      .select("company_id")
      .eq("role", "vibe_admin")
      .limit(1)
      .single();

    if (vibeAdminError || !vibeAdmin) {
      throw new Error("VibePKG company not found");
    }

    // Get QuickBooks settings from VibePKG
    const { data: qbSettings, error: qbError } = await supabase
      .from("quickbooks_settings")
      .select("*")
      .eq("company_id", vibeAdmin.company_id)
      .single();

    if (qbError || !qbSettings || !qbSettings.is_connected) {
      throw new Error("QuickBooks not connected");
    }

    // Get access token (refresh if needed)
    let accessToken = qbSettings.access_token;
    const refreshToken = qbSettings.refresh_token;

    const tokenExpiry = qbSettings.token_expires_at ? new Date(qbSettings.token_expires_at) : new Date(0);
    if (!qbSettings.token_expires_at || tokenExpiry <= new Date()) {
      console.log("Refreshing access token...");
      accessToken = await refreshAccessToken(supabase, vibeAdmin.company_id, refreshToken);
    }

    const realmId = qbSettings.realm_id;
    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;

    // Step 1: Find or create the parent customer (company)
    const companyName = (order.companies as any)?.name || order.customer_name;
    console.log("Looking for parent customer:", companyName);

    let parentCustomerId: string;

    // Search for existing customer
    const customerSearchResponse = await fetch(
      `${qbApiUrl}/query?query=${encodeURIComponent(
        `SELECT * FROM Customer WHERE DisplayName='${companyName.replace(/'/g, "\\'")}' MAXRESULTS 1`,
      )}&minorversion=65`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    const customerSearchData = await customerSearchResponse.json();

    if (customerSearchData.QueryResponse?.Customer?.length > 0) {
      parentCustomerId = customerSearchData.QueryResponse.Customer[0].Id;
      console.log("Found existing parent customer:", parentCustomerId);
    } else {
      // Create parent customer
      console.log("Creating parent customer:", companyName);
      const customerPayload = {
        DisplayName: companyName,
        BillAddr: {
          Line1: order.billing_street || order.shipping_street || "",
          City: order.billing_city || order.shipping_city || "",
          CountrySubDivisionCode: order.billing_state || order.shipping_state || "",
          PostalCode: order.billing_zip || order.shipping_zip || "",
        },
      };

      const createCustomerResponse = await fetch(`${qbApiUrl}/customer?minorversion=65`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customerPayload),
      });

      const newCustomer = await createCustomerResponse.json();

      if (!createCustomerResponse.ok) {
        // Check for duplicate - search again
        if (newCustomer.Fault?.Error?.[0]?.Message?.includes("Duplicate")) {
          const retrySearch = await fetch(
            `${qbApiUrl}/query?query=${encodeURIComponent(
              `SELECT * FROM Customer WHERE DisplayName LIKE '%${companyName.replace(/'/g, "\\'")}%' MAXRESULTS 10`,
            )}&minorversion=65`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
              },
            },
          );
          const retryData = await retrySearch.json();
          const match = retryData.QueryResponse?.Customer?.find(
            (c: any) => c.DisplayName?.toLowerCase().trim() === companyName.toLowerCase().trim(),
          );
          if (match) {
            parentCustomerId = match.Id;
          } else {
            throw new Error(`Customer "${companyName}" exists but cannot be located`);
          }
        } else {
          throw new Error(newCustomer.Fault?.Error?.[0]?.Message || "Failed to create customer");
        }
      } else {
        parentCustomerId = newCustomer.Customer.Id;
        console.log("Created parent customer:", parentCustomerId);
      }
    }

    // Step 2: Create a Project using the QuickBooks Projects API
    // The Projects API uses a different endpoint than the standard v3 API
    const projectName = `${order.order_number} - ${order.customer_name}`.substring(0, 100);
    console.log("Creating Project via Projects API. Customer:", parentCustomerId, "Name:", projectName);

    // QuickBooks Projects API endpoint
    const projectsApiUrl = `https://quickbooks.api.intuit.com/quickbooks/v4/customers/${parentCustomerId}/projects`;

    const projectPayload = {
      name: projectName,
      description: `Order: ${order.order_number}\nPO: ${order.po_number || "N/A"}`.substring(0, 1000),
    };

    console.log("Projects API URL:", projectsApiUrl);
    console.log("Project payload:", JSON.stringify(projectPayload));

    const createProjectResponse = await fetch(projectsApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(projectPayload),
    });

    const projectResponseText = await createProjectResponse.text();
    console.log("Create project response status:", createProjectResponse.status);
    console.log("Create project response:", projectResponseText);

    let qbProjectId: string;

    if (!createProjectResponse.ok) {
      // Try to parse error
      let errorData: any;
      try {
        errorData = JSON.parse(projectResponseText);
      } catch {
        errorData = { message: projectResponseText };
      }

      console.error("Failed to create project:", JSON.stringify(errorData));

      // Check if it's a duplicate name error - try to find existing project
      const errorMessage = errorData?.errors?.[0]?.message || errorData?.message || "";
      if (errorMessage.toLowerCase().includes("duplicate") || errorMessage.toLowerCase().includes("already exists")) {
        console.log("Project may already exist, searching...");
        
        // List projects for this customer to find existing one
        const listProjectsResponse = await fetch(
          `https://quickbooks.api.intuit.com/quickbooks/v4/customers/${parentCustomerId}/projects`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          },
        );

        if (listProjectsResponse.ok) {
          const projectsList = await listProjectsResponse.json();
          console.log("Existing projects:", JSON.stringify(projectsList));
          
          const existingProject = projectsList?.find?.((p: any) => 
            p.name?.toLowerCase().trim() === projectName.toLowerCase().trim()
          );
          
          if (existingProject?.id) {
            qbProjectId = existingProject.id;
            console.log("Found existing project:", qbProjectId);
          } else {
            throw new Error(errorMessage || "Failed to create project and could not find existing one");
          }
        } else {
          throw new Error(errorMessage || "Failed to create project");
        }
      } else {
        throw new Error(errorMessage || `Failed to create project: ${createProjectResponse.status}`);
      }
    } else {
      const newProject = JSON.parse(projectResponseText);
      qbProjectId = newProject.id;
      console.log("Created Project:", qbProjectId);
    }

    // Step 3: Update order with QB Project ID
    await supabase.from("orders").update({ qb_project_id: qbProjectId }).eq("id", orderId);

    console.log("Order updated with QB Project ID:", qbProjectId);

    return new Response(
      JSON.stringify({
        success: true,
        qb_project_id: qbProjectId,
        message: "QuickBooks Project created successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Create project error:", error);

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

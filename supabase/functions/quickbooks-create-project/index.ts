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

    // If we've already linked a Job/Project for this order, don't call QuickBooks again.
    // We still continue so we can ensure the existing Job is flagged as a "Project" in QBO.
    const existingQbProjectId: string | null = order.qb_project_id ? String(order.qb_project_id) : null;
    if (existingQbProjectId) {
      console.log(
        "Order already has QB Project/Job ID:",
        existingQbProjectId,
        "- will verify it is marked as a Project.",
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

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    // Step 1: Find or create the parent customer (company)
    const companyName = (order.companies as any)?.name || order.customer_name;
    console.log("Looking for parent customer:", companyName);

    let parentCustomerId;

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

    // Step 2: Create a Job (sub-customer) under the parent customer.
    // In QuickBooks Online, the "Projects" UI is backed by Customers with Job=true AND IsProject=true.
    const projectName = `${order.order_number} - ${order.customer_name}`.substring(0, 100);
    console.log("Creating Job (Project) under customer:", parentCustomerId, "Name:", projectName);

    async function ensureJobMarkedAsProject(jobCustomerId: string) {
      try {
        const getResp = await fetch(`${qbApiUrl}/customer/${jobCustomerId}?minorversion=65`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        });

        if (!getResp.ok) {
          console.warn("Could not fetch Job to verify IsProject flag:", jobCustomerId, getResp.status);
          return;
        }

        const getData = await getResp.json();
        const cust = getData?.Customer;

        if (!cust?.Id || cust?.SyncToken == null) {
          console.warn("Unexpected customer payload when verifying Job/Project:", JSON.stringify(getData));
          return;
        }

        const needsUpdate = cust.Job !== true || cust.IsProject !== true;
        if (!needsUpdate) {
          console.log("Job already marked as Project:", jobCustomerId);
          return;
        }

        const updatePayload: any = {
          sparse: true,
          Id: cust.Id,
          SyncToken: cust.SyncToken,
          Job: true,
          IsProject: true,
          ParentRef: cust.ParentRef?.value ? { value: cust.ParentRef.value } : { value: parentCustomerId },
          BillWithParent: typeof cust.BillWithParent === "boolean" ? cust.BillWithParent : true,
        };

        const updResp = await fetch(`${qbApiUrl}/customer?minorversion=65`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatePayload),
        });

        const updData = await updResp.json();
        if (!updResp.ok) {
          console.warn("Failed to mark Job as Project:", jobCustomerId, JSON.stringify(updData));
          return;
        }

        console.log("Marked Job as Project in QBO:", jobCustomerId);
      } catch (e) {
        console.warn("ensureJobMarkedAsProject failed:", jobCustomerId, e);
      }
    }

    // Check if the job already exists.
    // Note: Some QBO realms do NOT allow querying ParentRef, so we query by DisplayName then filter in code.
    const findExistingJob = async () => {
      const exactQuery = `SELECT * FROM Customer WHERE DisplayName='${projectName.replace(/'/g, "\\'")}' MAXRESULTS 10`;
      const resp = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(exactQuery)}&minorversion=65`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        },
      );

      const data = await resp.json();
      console.log("Job lookup response:", JSON.stringify(data));

      const customers: any[] = data?.QueryResponse?.Customer || [];
      const match = customers.find((c: any) => {
        const parentVal = c?.ParentRef?.value;
        const isJob = c?.Job === true;
        return isJob && String(parentVal || "") === String(parentCustomerId);
      });

      return match?.Id as string | undefined;
    };

    let qbProjectId = existingQbProjectId || (await findExistingJob());

    if (qbProjectId) {
      console.log("Using existing Job (Project):", qbProjectId);
    } else {
      const jobPayload: any = {
        DisplayName: projectName,
        ParentRef: { value: parentCustomerId },
        Job: true,
        IsProject: true,
        // Keep billing behavior simple/compatible; the important part is Job + IsProject + ParentRef.
        BillWithParent: true,
        Notes: `Order: ${order.order_number}\nPO: ${order.po_number || "N/A"}`.substring(0, 4000),
      };

      console.log("Creating Job payload:", JSON.stringify(jobPayload));

      const createJobResponse = await fetch(`${qbApiUrl}/customer?minorversion=65`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jobPayload),
      });

      const newJob = await createJobResponse.json();
      console.log("Create job response:", JSON.stringify(newJob));

      if (!createJobResponse.ok) {
        const qbErr = newJob?.Fault?.Error?.[0];
        const isDuplicate = qbErr?.code === "6240" || String(qbErr?.Message || "").toLowerCase().includes("duplicate");

        if (isDuplicate) {
          console.warn("Duplicate job name reported by QBO; searching to locate existing job...");
          qbProjectId = await findExistingJob();
        }

        if (!qbProjectId) {
          console.error("Failed to create Job (Project):", JSON.stringify(newJob));
          const errorMsg = qbErr?.Message || qbErr?.Detail || "Failed to create Job (Project) in QuickBooks";
          throw new Error(errorMsg);
        }

        console.log("Recovered existing Job (Project) after duplicate:", qbProjectId);
      } else {
        qbProjectId = newJob.Customer.Id;
        console.log("Created Job (Project):", qbProjectId);
      }
    }

    // Ensure the Job is flagged as a Project in QBO so it appears under Projects.
    await ensureJobMarkedAsProject(String(qbProjectId));

    // Step 3: Update order with QB Project ID
    await supabase.from("orders").update({ qb_project_id: qbProjectId }).eq("id", orderId);

    console.log("Order updated with QB Project ID:", qbProjectId);

    return new Response(
      JSON.stringify({
        success: true,
        qb_project_id: qbProjectId,
        message: "QuickBooks Job (Project) created successfully",
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

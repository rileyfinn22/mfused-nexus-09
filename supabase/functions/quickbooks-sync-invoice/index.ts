import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(supabase: any, companyId: string, refreshToken: string) {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');

  console.log('Attempting token refresh for company:', companyId);
  console.log('Refresh token present:', !!refreshToken);
  console.log('Client ID present:', !!clientId);
  console.log('Client secret present:', !!clientSecret);

  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  console.log('QuickBooks refresh response status:', response.status);
  const data = await response.json();
  console.log('QuickBooks refresh response data:', JSON.stringify(data));
  
  if (!response.ok) {
    console.error('Token refresh failed:', data);
    throw new Error(data.error_description || data.error || 'Failed to refresh access token');
  }
  
  if (!data.access_token || !data.refresh_token || typeof data.expires_in !== 'number' || data.expires_in <= 0) {
    console.error('Invalid token response:', data);
    throw new Error('Invalid token response from QuickBooks');
  }
  
  const expiresAt = new Date(Date.now() + (data.expires_in * 1000));
  const refreshTokenExpiresAt = new Date(Date.now() + (data.x_refresh_token_expires_in || 8726400) * 1000);

  // Store new tokens encrypted in vault
  const { data: accessSecretId } = await supabase
    .rpc('store_qb_token_encrypted', {
      p_company_id: companyId,
      p_token_type: 'access',
      p_token_value: data.access_token
    });

  const { data: refreshSecretId } = await supabase
    .rpc('store_qb_token_encrypted', {
      p_company_id: companyId,
      p_token_type: 'refresh',
      p_token_value: data.refresh_token
    });

  await supabase
    .from('quickbooks_settings')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_token_secret_id: accessSecretId,
      refresh_token_secret_id: refreshSecretId,
      token_expires_at: expiresAt.toISOString(),
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
      last_error: null,
      last_error_at: null,
    })
    .eq('company_id', companyId);

  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { invoiceId, billingPercentage = 100 } = await req.json();

    console.log('Syncing invoice:', invoiceId, 'with billing percentage:', billingPercentage);

    // Get invoice with items, allocations, company info, and order's QB project
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        orders(*, order_items(*), qb_project_id),
        companies:company_id(name, id)
      `)
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      throw new Error('Invoice not found');
    }

    // Get the company's primary user email from user_roles
    const { data: companyUser } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('company_id', invoice.company_id)
      .eq('role', 'company')
      .limit(1)
      .single();
    
    let companyEmail = '';
    if (companyUser) {
      const { data: userData } = await supabase.auth.admin.getUserById(companyUser.user_id);
      companyEmail = userData?.user?.email || '';
    }

    // Get inventory allocations for this invoice to determine actual shipped quantities
    const { data: allocations } = await supabase
      .from('inventory_allocations')
      .select(`
        *,
        order_items(*)
      `)
      .eq('invoice_id', invoiceId)
      .eq('status', 'allocated');

    console.log('Invoice total from DB:', invoice.total);
    console.log('Invoice type:', invoice.invoice_type);
    console.log('Inventory allocations found:', allocations?.length || 0);

    // Get VibePKG's company_id (the vibe_admin's company that manages QuickBooks)
    const { data: vibeAdmin, error: vibeAdminError } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('role', 'vibe_admin')
      .limit(1)
      .single();

    if (vibeAdminError || !vibeAdmin) {
      throw new Error('VibePKG company not found');
    }

    // Get QuickBooks settings from VibePKG (not the customer's company)
    const { data: qbSettings, error: qbError } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .eq('company_id', vibeAdmin.company_id)
      .single();

    if (qbError || !qbSettings || !qbSettings.is_connected) {
      throw new Error('QuickBooks not connected');
    }

    // Decrypt tokens from vault (fallback to plain text for backwards compatibility)
    let accessToken = qbSettings.access_token;
    let refreshToken = qbSettings.refresh_token;
    
    if (qbSettings.access_token_secret_id) {
      const { data: decryptedAccess } = await supabase
        .rpc('get_qb_token_decrypted', {
          p_company_id: invoice.company_id,
          p_token_type: 'access'
        });
      accessToken = decryptedAccess || accessToken;
    }
    
    if (qbSettings.refresh_token_secret_id) {
      const { data: decryptedRefresh } = await supabase
        .rpc('get_qb_token_decrypted', {
          p_company_id: invoice.company_id,
          p_token_type: 'refresh'
        });
      refreshToken = decryptedRefresh || refreshToken;
    }

    // Check if token needs refresh
    const tokenExpiry = qbSettings.token_expires_at ? new Date(qbSettings.token_expires_at) : new Date(0);
    if (!qbSettings.token_expires_at || tokenExpiry <= new Date()) {
      console.log('Refreshing access token...');
      accessToken = await refreshAccessToken(supabase, invoice.company_id, refreshToken);
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}`;

    async function isValidQbProjectRef(projectId: string): Promise<boolean> {
      try {
        // Check if this is a valid sub-customer (Job) in QBO
        const resp = await fetch(`${qbApiUrl}/customer/${projectId}?minorversion=65`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });

        if (!resp.ok) {
          console.warn('Sub-customer not found or invalid:', projectId, resp.status);
          return false;
        }

        const data = await resp.json();
        return !!data?.Customer;
      } catch (e) {
        console.warn('Failed to validate ProjectRef:', projectId, e);
        return false;
      }
    }

    // Find or create customer in QuickBooks using company name and email
    const customerName = (invoice.companies as any)?.name || 'Unknown Customer';
    const customerEmail = companyEmail || '';

    
    console.log('Looking for customer (company):', customerName, 'Email:', customerEmail);
    console.log('Order customer_name (ship-to):', invoice.orders?.customer_name);
    
    let customerId;
    
    // Strategy 1: Search by email if available (most reliable)
    if (customerEmail) {
      console.log('Searching by email...');
      const emailSearchResponse = await fetch(
        `${qbApiUrl}/query?query=SELECT * FROM Customer WHERE PrimaryEmailAddr='${customerEmail}' MAXRESULTS 1&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      const emailSearchData = await emailSearchResponse.json();
      
      if (emailSearchData.QueryResponse?.Customer?.length > 0) {
        customerId = emailSearchData.QueryResponse.Customer[0].Id;
        console.log('Found customer by email:', customerId);
      }
    }
    
    // Strategy 2: Search by name if email search didn't find anything
    if (!customerId) {
      console.log('Searching by name...');
      const nameSearchResponse = await fetch(
        `${qbApiUrl}/query?query=SELECT * FROM Customer WHERE DisplayName='${customerName.replace(/'/g, "\\'")}' MAXRESULTS 1&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      const nameSearchData = await nameSearchResponse.json();
      
      if (nameSearchData.QueryResponse?.Customer?.length > 0) {
        customerId = nameSearchData.QueryResponse.Customer[0].Id;
        console.log('Found customer by name:', customerId);
      }
    }
    
    // Strategy 3: Create customer if not found
    if (!customerId) {
      console.log('Customer not found, creating new customer in QuickBooks...');
      
      const customerPayload = {
        DisplayName: customerName,
        PrimaryEmailAddr: customerEmail ? { Address: customerEmail } : undefined,
        PrimaryPhone: invoice.orders?.customer_phone ? { FreeFormNumber: invoice.orders.customer_phone } : undefined,
        BillAddr: {
          Line1: invoice.orders?.billing_street || invoice.orders?.shipping_street || '',
          City: invoice.orders?.billing_city || invoice.orders?.shipping_city || '',
          CountrySubDivisionCode: invoice.orders?.billing_state || invoice.orders?.shipping_state || '',
          PostalCode: invoice.orders?.billing_zip || invoice.orders?.shipping_zip || '',
        },
      };

      const createCustomerResponse = await fetch(`${qbApiUrl}/customer?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customerPayload),
      });

      const newCustomer = await createCustomerResponse.json();
      
      if (!createCustomerResponse.ok) {
        // If duplicate error, customer was created by another process - search one more time
        if (newCustomer.Fault?.Error?.[0]?.Message?.includes('Duplicate')) {
          console.log('Duplicate detected - customer was just created, searching again...');
          
          // Try email search first
          if (customerEmail) {
            const retryEmailSearch = await fetch(
              `${qbApiUrl}/query?query=SELECT * FROM Customer WHERE PrimaryEmailAddr='${customerEmail}' MAXRESULTS 1&minorversion=65`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json',
                },
              }
            );
            const retryEmailData = await retryEmailSearch.json();
            
            if (retryEmailData.QueryResponse?.Customer?.length > 0) {
              customerId = retryEmailData.QueryResponse.Customer[0].Id;
              console.log('Found customer on retry by email:', customerId);
            }
          }
          
          // If still not found, try fuzzy LIKE search
          if (!customerId) {
            console.log('Trying fuzzy LIKE search...');
            const likeSearch = await fetch(
              `${qbApiUrl}/query?query=SELECT * FROM Customer WHERE DisplayName LIKE '%${customerName.replace(/'/g, "\\'")}%' MAXRESULTS 10&minorversion=65`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json',
                },
              }
            );
            const likeData = await likeSearch.json();
            const likeCustomers = likeData.QueryResponse?.Customer || [];
            
            console.log(`LIKE search found ${likeCustomers.length} customers`);
            if (likeCustomers.length > 0) {
              likeCustomers.forEach((c: any) => console.log('  - ', c.DisplayName));
            }
            
            // Find exact match (case-insensitive)
            const exactMatch = likeCustomers.find(
              (c: any) => c.DisplayName?.toLowerCase().trim() === customerName.toLowerCase().trim()
            );
            
            if (exactMatch) {
              customerId = exactMatch.Id;
              console.log('Found exact match in LIKE results:', customerId, exactMatch.DisplayName);
            } else if (likeCustomers.length === 1) {
              // If only one result, use it
              customerId = likeCustomers[0].Id;
              console.log('Using single LIKE result:', customerId, likeCustomers[0].DisplayName);
            }
          }
          
          // If still not found, try paginated broad search
          if (!customerId) {
            console.log('Trying paginated broad search...');
            let allCustomers: any[] = [];
            let startPosition = 1;
            const maxResults = 1000;
            let hasMore = true;
            
            // Fetch customers in batches (max 3 batches = 3000 customers)
            while (hasMore && allCustomers.length < 3000) {
              const broadSearch = await fetch(
                `${qbApiUrl}/query?query=SELECT * FROM Customer STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}&minorversion=65`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                  },
                }
              );
              const broadData = await broadSearch.json();
              const customers = broadData.QueryResponse?.Customer || [];
              
              if (customers.length === 0) {
                hasMore = false;
              } else {
                allCustomers = allCustomers.concat(customers);
                startPosition += maxResults;
                hasMore = customers.length === maxResults;
              }
            }
            
            console.log(`Broad search found ${allCustomers.length} total customers`);
            
            // Case-insensitive name match
            const match = allCustomers.find(
              (c: any) => c.DisplayName?.toLowerCase().trim() === customerName.toLowerCase().trim()
            );
            
            if (match) {
              customerId = match.Id;
              console.log('Found customer in broad search:', customerId, match.DisplayName);
            }
          }
          
          if (!customerId) {
            throw new Error(`Customer "${customerName}" appears to exist in QuickBooks but cannot be located. Please check QuickBooks and ensure the customer name matches exactly.`);
          }
        } else {
          console.error('Failed to create customer:', newCustomer);
          throw new Error(newCustomer.Fault?.Error?.[0]?.Message || 'Failed to create customer in QuickBooks');
        }
      } else {
        customerId = newCustomer.Customer.Id;
        console.log('Successfully created new customer:', customerId);
      }
    }

    // Helper function to find or create a QuickBooks Item for a product
    async function findOrCreateQBItem(itemName: string, itemDescription: string, unitPrice: number): Promise<string> {
      // Sanitize item name for QuickBooks (max 100 chars, no special chars that cause issues)
      const sanitizedName = itemName.substring(0, 100).replace(/[:"]/g, '');
      
      console.log(`Finding/creating QB item: ${sanitizedName}`);
      
      // Properly encode the name for URL query - escape single quotes and URL encode the whole query
      const escapedName = sanitizedName.replace(/'/g, "\\'");
      const queryString = `SELECT * FROM Item WHERE Name='${escapedName}' MAXRESULTS 1`;
      
      // Search for existing item by name
      const searchResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(queryString)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      const searchData = await searchResponse.json();
      
      if (searchData.QueryResponse?.Item?.length > 0) {
        const existingItem = searchData.QueryResponse.Item[0];
        console.log(`Found existing QB item: ${existingItem.Id} - ${existingItem.Name}`);
        return existingItem.Id;
      }
      
      // Item not found, create it as NonInventory (Product/Service that's sold)
      console.log(`Creating new QB item: ${sanitizedName}`);
      
      // Get the default income account (Sales of Product Income) and COGS account
      // First, try to find a suitable income account
      const accountSearchResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType='Income' MAXRESULTS 10")}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      const accountData = await accountSearchResponse.json();
      const incomeAccounts = accountData.QueryResponse?.Account || [];
      
      // Prefer "Sales of Product Income" or similar, fallback to first income account
      let incomeAccountId = '1';
      const productIncomeAccount = incomeAccounts.find((a: any) => 
        a.Name?.toLowerCase().includes('product') || 
        a.Name?.toLowerCase().includes('sales') ||
        a.AccountSubType === 'SalesOfProductIncome'
      );
      if (productIncomeAccount) {
        incomeAccountId = productIncomeAccount.Id;
      } else if (incomeAccounts.length > 0) {
        incomeAccountId = incomeAccounts[0].Id;
      }
      
      // Find COGS account for expense
      const cogsSearchResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType='Cost of Goods Sold' MAXRESULTS 5")}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      const cogsData = await cogsSearchResponse.json();
      const cogsAccounts = cogsData.QueryResponse?.Account || [];
      
      let expenseAccountId = incomeAccountId; // Fallback to income account if no COGS found
      if (cogsAccounts.length > 0) {
        expenseAccountId = cogsAccounts[0].Id;
      }
      
      console.log(`Using Income Account: ${incomeAccountId}, COGS Account: ${expenseAccountId}`);
      
      const itemPayload = {
        Name: sanitizedName,
        Description: itemDescription || sanitizedName,
        Type: 'NonInventory', // NonInventory items can be sold and tracked without inventory management
        IncomeAccountRef: {
          value: incomeAccountId,
        },
        ExpenseAccountRef: {
          value: expenseAccountId,
        },
        UnitPrice: unitPrice || 0,
      };
      
      const createResponse = await fetch(`${qbApiUrl}/item?minorversion=65`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(itemPayload),
      });
      
      const createData = await createResponse.json();
      
      if (!createResponse.ok) {
        // If duplicate, extract ID from error or search again
        if (createData.Fault?.Error?.[0]?.Message?.includes('Duplicate')) {
          const errorDetail = createData.Fault?.Error?.[0]?.Detail || '';
          console.log('Duplicate item detected. Error detail:', errorDetail);
          
          // Try to extract ID from error message like "The name supplied already exists. : Id=1507"
          const idMatch = errorDetail.match(/Id=(\d+)/);
          if (idMatch) {
            console.log(`Extracted existing item ID from error: ${idMatch[1]}`);
            return idMatch[1];
          }
          
          // Fallback: search again with LIKE and URL encoding
          console.log('Searching again with LIKE query...');
          const likeQuery = `SELECT * FROM Item WHERE Name LIKE '%${escapedName}%' MAXRESULTS 20`;
          const retrySearch = await fetch(
            `${qbApiUrl}/query?query=${encodeURIComponent(likeQuery)}&minorversion=65`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
              },
            }
          );
          const retryData = await retrySearch.json();
          const items = retryData.QueryResponse?.Item || [];
          console.log(`LIKE search returned ${items.length} items`);
          
          // Try exact case-insensitive match first
          const exactMatch = items.find((i: any) => i.Name?.toLowerCase() === sanitizedName.toLowerCase());
          if (exactMatch) {
            console.log(`Found exact match on retry: ${exactMatch.Id} - ${exactMatch.Name}`);
            return exactMatch.Id;
          }
          
          // Use first match if exact match not found
          if (items.length > 0) {
            console.log(`Using first LIKE match: ${items[0].Id} - ${items[0].Name}`);
            return items[0].Id;
          }
          
          // Last resort: broad search
          console.log('Trying broad item search...');
          const broadQuery = `SELECT * FROM Item MAXRESULTS 500`;
          const broadSearch = await fetch(
            `${qbApiUrl}/query?query=${encodeURIComponent(broadQuery)}&minorversion=65`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
              },
            }
          );
          const broadData = await broadSearch.json();
          const allItems = broadData.QueryResponse?.Item || [];
          const broadMatch = allItems.find((i: any) => i.Name?.toLowerCase() === sanitizedName.toLowerCase());
          if (broadMatch) {
            console.log(`Found item in broad search: ${broadMatch.Id} - ${broadMatch.Name}`);
            return broadMatch.Id;
          }
        }
        console.error('Failed to create QB item:', createData);
        // Fallback to default item ID - but log this as an error
        console.error(`CRITICAL: Could not find or create item "${sanitizedName}", falling back to item ID 1`);
        return '1';
      }
      
      console.log(`Created new QB item: ${createData.Item.Id}`);
      return createData.Item.Id;
    }

    // Build invoice line items - always use full prices
    let lineItems = [];
    let calculatedSubtotal = 0;

    if (allocations && allocations.length > 0) {
      // Use inventory allocations for line items
      console.log('Using inventory allocations for line items');
      for (const alloc of allocations) {
        const item = alloc.order_items;
        const qty = alloc.quantity_allocated;
        const unitPrice = item.unit_price;
        const fullAmount = qty * unitPrice;
        calculatedSubtotal += fullAmount;
        
        // Find or create the QB item using the product name
        const qbItemId = await findOrCreateQBItem(item.name, item.description || item.name, unitPrice);
        
        console.log(`Item: ${item.name}, Allocated Qty: ${qty}, Unit Price: ${unitPrice}, Full Amount: ${fullAmount}, QB Item ID: ${qbItemId}`);
        
        lineItems.push({
          DetailType: 'SalesItemLineDetail',
          Amount: fullAmount,
          SalesItemLineDetail: {
            ItemRef: {
              value: qbItemId,
              name: item.name,
            },
            Qty: qty,
            UnitPrice: unitPrice,
          },
          Description: item.description || item.name,
        });
      }
    } else {
      // Fallback: Use order items with shipped_quantity or all items
      console.log('No allocations found, using order items with shipped_quantity');
      const shippedItems = invoice.orders?.order_items
        ?.filter((item: any) => item.shipped_quantity > 0) || [];
      
      if (shippedItems.length > 0) {
        for (const item of shippedItems) {
          const qty = item.shipped_quantity;
          const unitPrice = item.unit_price;
          const fullAmount = qty * unitPrice;
          calculatedSubtotal += fullAmount;
          
          const qbItemId = await findOrCreateQBItem(item.name, item.description || item.name, unitPrice);
          
          console.log(`Item: ${item.name}, Shipped Qty: ${qty}, Unit Price: ${unitPrice}, Full Amount: ${fullAmount}, QB Item ID: ${qbItemId}`);
          
          lineItems.push({
            DetailType: 'SalesItemLineDetail',
            Amount: fullAmount,
            SalesItemLineDetail: {
              ItemRef: {
                value: qbItemId,
                name: item.name,
              },
              Qty: qty,
              UnitPrice: unitPrice,
            },
            Description: item.description || item.name,
          });
        }
      } else {
        // Second fallback: Use all order items for deposit/pre-shipment billing
        console.log('No shipped items, using all order items');
        
        const orderItems = invoice.orders?.order_items || [];
        for (const item of orderItems) {
          const qty = item.quantity;
          const unitPrice = item.unit_price;
          const fullAmount = qty * unitPrice;
          calculatedSubtotal += fullAmount;
          
          const qbItemId = await findOrCreateQBItem(item.name, item.description || item.name, unitPrice);
          
          console.log(`Item: ${item.name}, Qty: ${qty}, Unit Price: ${unitPrice}, Full Amount: ${fullAmount}, QB Item ID: ${qbItemId}`);
          
          lineItems.push({
            DetailType: 'SalesItemLineDetail',
            Amount: fullAmount,
            SalesItemLineDetail: {
              ItemRef: {
                value: qbItemId,
                name: item.name,
              },
              Qty: qty,
              UnitPrice: unitPrice,
            },
            Description: item.description || item.name,
          });
        }
      }
    }

    // Add shipping as a line item if present (full price)
    if (invoice.shipping_cost > 0) {
      const shippingAmount = Number(invoice.shipping_cost);
      calculatedSubtotal += shippingAmount;
      
      // Find or create a Shipping item
      const shippingItemId = await findOrCreateQBItem('Shipping', 'Shipping and handling charges', shippingAmount);
      
      lineItems.push({
        DetailType: 'SalesItemLineDetail',
        Amount: shippingAmount,
        Description: 'Shipping',
        SalesItemLineDetail: {
          ItemRef: { 
            value: shippingItemId,
            name: 'Shipping',
          },
        },
      });
    }

    // Validate that we have at least one line item
    if (lineItems.length === 0) {
      console.error('No line items to sync. Invoice must have order items.');
      throw new Error('Cannot sync invoice to QuickBooks: No line items found. Order must have items before creating an invoice.');
    }

    console.log(`Total line items: ${lineItems.length}`);

    // For partial billing, add a line item to subtract the unbilled portion
    if (billingPercentage < 100) {
      const unbilledPercentage = 100 - billingPercentage;
      const unbilledAmount = -(calculatedSubtotal * (unbilledPercentage / 100));
      
      console.log(`Adding credit line: -${unbilledPercentage}% = $${Math.abs(unbilledAmount).toFixed(2)}`);
      
      // Determine description based on invoice type
      const isDeposit = invoice.notes && invoice.notes.includes('deposit payment');
      const creditDescription = isDeposit 
        ? `Balance Due on Delivery (${unbilledPercentage}% of order)`
        : `Credit Applied (Deposit/Previous Payments)`;
      
      // Find or create an adjustment item
      const adjustmentItemId = await findOrCreateQBItem('Invoice Adjustment', 'Balance adjustments and credits', 0);
      
      lineItems.push({
        DetailType: 'SalesItemLineDetail',
        Amount: unbilledAmount,
        Description: creditDescription,
        SalesItemLineDetail: {
          ItemRef: { 
            value: adjustmentItemId,
            name: 'Invoice Adjustment',
          },
        },
      });
      
      // Adjust calculated subtotal for the balance line
      calculatedSubtotal += unbilledAmount;
    }

    // Validate calculated total matches database total
    const calculatedTotal = calculatedSubtotal + Number(invoice.tax || 0);
    const dbTotal = Number(invoice.total);
    
    console.log('Calculated subtotal:', calculatedSubtotal);
    console.log('Calculated total (with tax):', calculatedTotal);
    console.log('Database total:', dbTotal);
    console.log('Difference:', Math.abs(calculatedTotal - dbTotal));

    // If calculated total exceeds database total, add deposit credit line
    if (calculatedTotal > dbTotal + 0.01) {
      const depositCreditAmount = -(calculatedTotal - dbTotal);
      console.log(`Adding deposit credit line: $${Math.abs(depositCreditAmount).toFixed(2)}`);
      
      // Find or create a deposit credit item
      const depositCreditItemId = await findOrCreateQBItem('Deposit Credit Applied', 'Credit for deposits previously applied', 0);
      
      lineItems.push({
        DetailType: 'SalesItemLineDetail',
        Amount: depositCreditAmount,
        Description: 'Less: Deposit Credit Applied',
        SalesItemLineDetail: {
          ItemRef: { 
            value: depositCreditItemId,
            name: 'Deposit Credit Applied',
          },
        },
      });
      
      // Adjust calculated subtotal
      calculatedSubtotal += depositCreditAmount;
    } else if (Math.abs(calculatedTotal - dbTotal) > 0.01) {
      console.warn('WARNING: Database total exceeds calculated total!');
      console.warn(`Calculated: ${calculatedTotal}, Database: ${dbTotal}, Diff: ${dbTotal - calculatedTotal}`);
    }

    // For partial billing, we'll show full invoice then subtract the unbilled portion
    // This way customers see the full order value with deposit clearly shown
    console.log(`Billing ${billingPercentage}% now, ${100 - billingPercentage}% due later`);

    // Get the QB Project ID from the order (if exists)
    let qbProjectId: string | null = (invoice.orders?.qb_project_id || invoice.qb_project_id || null) as any;

    if (qbProjectId) {
      const valid = await isValidQbProjectRef(String(qbProjectId));
      if (!valid) {
        console.warn(
          `Invalid QB ProjectRef "${qbProjectId}" for order ${invoice.order_id}. Clearing and syncing without project.`
        );

        await supabase.from('orders').update({ qb_project_id: null }).eq('id', invoice.order_id);
        await supabase.from('invoices').update({ qb_project_id: null }).eq('id', invoiceId);
        qbProjectId = null;
      }
    }

    console.log('QB Project ID for invoice:', qbProjectId);

    // Create invoice payload
    const invoicePayload: any = {
      CustomerRef: {
        value: customerId,
      },
      Line: lineItems,
      TxnDate: invoice.invoice_date.split('T')[0],
      DueDate: invoice.due_date ? invoice.due_date.split('T')[0] : undefined,
      DocNumber: invoice.invoice_number.substring(0, 21), // QuickBooks max 21 chars
      PrivateNote: invoice.notes || '',
      CustomerMemo: {
        value: invoice.orders?.memo || '',
      },
      BillAddr: {
        Line1: invoice.orders?.billing_street || invoice.orders?.shipping_street || '',
        City: invoice.orders?.billing_city || invoice.orders?.shipping_city || '',
        CountrySubDivisionCode: invoice.orders?.billing_state || invoice.orders?.shipping_state || '',
        PostalCode: invoice.orders?.billing_zip || invoice.orders?.shipping_zip || '',
      },
      ShipAddr: {
        Line1: invoice.orders?.shipping_street || '',
        City: invoice.orders?.shipping_city || '',
        CountrySubDivisionCode: invoice.orders?.shipping_state || '',
        PostalCode: invoice.orders?.shipping_zip || '',
      },
      // Enable online payment options to get payment link
      AllowOnlinePayment: true,
      AllowOnlineCreditCardPayment: true,
      AllowOnlineACHPayment: true,
    };

    // Attach to QB Project if the order has one (for P&L tracking)
    if (qbProjectId) {
      invoicePayload.ProjectRef = {
        value: qbProjectId,
      };
      console.log('Attaching invoice to QB Project:', qbProjectId);
    }

    // Note: We don't use the Deposit field for partial billing
    // Instead, we adjust the line item amounts to reflect the billing percentage

    let qbResponse;
    let shouldCreateNew = !invoice.quickbooks_id;
    
    if (invoice.quickbooks_id) {
      // Try to update existing invoice
      console.log('Attempting to update existing QuickBooks invoice:', invoice.quickbooks_id);
      
      const getResponse = await fetch(`${qbApiUrl}/invoice/${invoice.quickbooks_id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (!getResponse.ok) {
        const errorData = await getResponse.json();
        console.warn('Invoice not found in QuickBooks (may have been deleted):', errorData);
        
        // Clear the stale quickbooks_id and create a new invoice instead
        console.log('Clearing stale quickbooks_id and will create new invoice');
        await supabase
          .from('invoices')
          .update({ quickbooks_id: null, quickbooks_sync_status: 'pending' })
          .eq('id', invoiceId);
        
        shouldCreateNew = true;
      } else {
        const currentInvoice = await getResponse.json();
        console.log('Current invoice response:', JSON.stringify(currentInvoice).substring(0, 200));
        
        if (!currentInvoice?.Invoice?.SyncToken) {
          console.warn('Invalid invoice response, will create new:', currentInvoice);
          await supabase
            .from('invoices')
            .update({ quickbooks_id: null, quickbooks_sync_status: 'pending' })
            .eq('id', invoiceId);
          shouldCreateNew = true;
        } else {
          qbResponse = await fetch(`${qbApiUrl}/invoice?minorversion=65`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...invoicePayload,
              Id: invoice.quickbooks_id,
              SyncToken: currentInvoice.Invoice.SyncToken,
            }),
          });
        }
      }
    }
    
    if (shouldCreateNew) {
      // First check if an invoice with this DocNumber already exists in QuickBooks
      const docNumber = invoice.invoice_number.substring(0, 21);
      console.log('Checking if invoice exists with DocNumber:', docNumber);
      
      const queryResponse = await fetch(
        `${qbApiUrl}/query?query=${encodeURIComponent(`SELECT * FROM Invoice WHERE DocNumber = '${docNumber}'`)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      
      const queryData = await queryResponse.json();
      const existingInvoice = queryData?.QueryResponse?.Invoice?.[0];
      
      if (existingInvoice) {
        // Invoice already exists - update it instead of creating
        console.log('Found existing QuickBooks invoice with ID:', existingInvoice.Id, 'SyncToken:', existingInvoice.SyncToken);
        
        qbResponse = await fetch(`${qbApiUrl}/invoice?minorversion=65`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...invoicePayload,
            Id: existingInvoice.Id,
            SyncToken: existingInvoice.SyncToken,
          }),
        });
      } else {
        // Create new invoice
        console.log('Creating new QuickBooks invoice');
        qbResponse = await fetch(`${qbApiUrl}/invoice?minorversion=65`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(invoicePayload),
        });
      }
    }

    const qbData = await qbResponse.json();

    if (!qbResponse.ok) {
      console.error('QuickBooks API error:', qbData);
      throw new Error(qbData.Fault?.Error?.[0]?.Message || 'QuickBooks API error');
    }

    if (!qbData.Invoice || !qbData.Invoice.Id) {
      console.error('Invalid QuickBooks response - no Invoice object:', qbData);
      throw new Error('QuickBooks returned an invalid response. The invoice may not have been created.');
    }

    const qbInvoiceId = qbData.Invoice.Id;
    const qbDocNumber = qbData.Invoice.DocNumber;
    const qbRealmId = qbSettings.realm_id;
    
    console.log('QuickBooks Invoice ID:', qbInvoiceId);
    console.log('QuickBooks Realm ID:', qbRealmId);
    
    // QuickBooks payment link - DO NOT auto-send invoice via email
    // Just enable online payments and retrieve the invoice link if available
    let qbPaymentLink = null;
    
    try {
      console.log('Enabling online payments on invoice (not sending email)...');
      
      // Ensure online payment is enabled on the invoice
      const updatePayload = {
        Id: qbInvoiceId,
        SyncToken: qbData.Invoice.SyncToken,
        sparse: true,
        AllowOnlinePayment: true,
        AllowOnlineCreditCardPayment: true,
        AllowOnlineACHPayment: true,
      };
      
      const updateResponse = await fetch(`${qbApiUrl}/invoice?minorversion=73`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });
      
      if (updateResponse.ok) {
        const updatedInvoice = await updateResponse.json();
        console.log('Online payment enabled on invoice');
        
        // Check if there's an invoice link available
        qbPaymentLink = updatedInvoice.Invoice?.InvoiceLink || null;
        
        if (qbPaymentLink) {
          console.log('Payment link available:', qbPaymentLink);
        } else {
          // Invoice was created but no auto-generated link - user can send manually from QuickBooks
          console.log('Invoice created in QuickBooks. No auto-send - send manually from QB when ready.');
          qbPaymentLink = 'Manual';
        }
      } else {
        console.log('Could not enable online payments, but invoice was created');
        qbPaymentLink = 'Manual';
      }
    } catch (linkError) {
      console.error('Error configuring payment options:', linkError);
      qbPaymentLink = 'Manual';
    }
    
    console.log('QuickBooks invoice ID:', qbInvoiceId);
    console.log('QuickBooks DocNumber:', qbDocNumber);
    console.log('QuickBooks payment link:', qbPaymentLink);
    console.log('AllowOnlinePayment:', qbData.Invoice?.AllowOnlinePayment);
    console.log('AllowOnlineCreditCardPayment:', qbData.Invoice?.AllowOnlineCreditCardPayment);
    
    // Update invoice with QuickBooks info and set status to 'billed'
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        quickbooks_id: qbInvoiceId,
        quickbooks_synced_at: new Date().toISOString(),
        quickbooks_sync_status: 'synced',
        quickbooks_payment_link: qbPaymentLink,
        billed_percentage: billingPercentage,
        status: 'billed'
      })
      .eq('id', invoiceId);

    if (updateError) {
      console.error('Failed to update invoice:', updateError);
      throw updateError;
    }

    console.log('Invoice synced successfully');


    return new Response(
      JSON.stringify({ 
        success: true, 
        quickbooks_id: qbInvoiceId,
        payment_link_note: qbPaymentLink ? 'Payment link available' : 'Enable QuickBooks Payments in your QuickBooks account to get payment links'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Sync error:', error);
    
    // Check if it's a token expiration error
    const isTokenError = error.message?.includes('refresh') || error.message?.includes('token') || error.message?.includes('expired');
    const errorMessage = isTokenError 
      ? 'QuickBooks connection expired. Please reconnect in Settings.'
      : error.message;
    
    const { invoiceId } = await req.json().catch(() => ({}));
    if (invoiceId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase
        .from('invoices')
        .update({ quickbooks_sync_status: 'failed' })
        .eq('id', invoiceId);
      
      // Update error in settings if it's a token issue
      if (isTokenError) {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('company_id')
          .eq('id', invoiceId)
          .single();
        
        if (invoice) {
          await supabase
            .from('quickbooks_settings')
            .update({
              last_error: errorMessage,
              last_error_at: new Date().toISOString(),
            })
            .eq('company_id', invoice.company_id);
        }
      }
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
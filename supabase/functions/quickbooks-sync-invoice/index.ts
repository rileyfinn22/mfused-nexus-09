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

    // Get invoice with items and allocations
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        orders(*, order_items(*))
      `)
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      throw new Error('Invoice not found');
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

    // Find or create customer in QuickBooks
    const customerName = invoice.orders?.customer_name || 'Unknown Customer';
    const customerEmail = invoice.orders?.customer_email || '';
    
    console.log('Looking for customer:', customerName, 'Email:', customerEmail);
    
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

    // Build invoice line items - always use full prices
    let lineItems = [];
    let calculatedSubtotal = 0;

    if (allocations && allocations.length > 0) {
      // Use inventory allocations for line items
      console.log('Using inventory allocations for line items');
      lineItems = allocations.map((alloc: any) => {
        const item = alloc.order_items;
        const qty = alloc.quantity_allocated;
        const unitPrice = item.unit_price;
        const fullAmount = qty * unitPrice;
        calculatedSubtotal += fullAmount; // Add full amount
        
        console.log(`Item: ${item.name}, Allocated Qty: ${qty}, Unit Price: ${unitPrice}, Full Amount: ${fullAmount}`);
        
        return {
          DetailType: 'SalesItemLineDetail',
          Amount: fullAmount,
          SalesItemLineDetail: {
            ItemRef: {
              value: '1', // Default item ID
            },
            Qty: qty,
            UnitPrice: unitPrice, // Full price
          },
          Description: item.description || item.name,
        };
      });
    } else {
      // Fallback: Use order items with shipped_quantity or all items
      console.log('No allocations found, using order items with shipped_quantity');
      const shippedItems = invoice.orders?.order_items
        ?.filter((item: any) => item.shipped_quantity > 0) || [];
      
      if (shippedItems.length > 0) {
        lineItems = shippedItems.map((item: any) => {
          const qty = item.shipped_quantity;
          const unitPrice = item.unit_price;
          const fullAmount = qty * unitPrice;
          calculatedSubtotal += fullAmount;
          
          console.log(`Item: ${item.name}, Shipped Qty: ${qty}, Unit Price: ${unitPrice}, Full Amount: ${fullAmount}`);
          
          return {
            DetailType: 'SalesItemLineDetail',
            Amount: fullAmount,
            SalesItemLineDetail: {
              ItemRef: {
                value: '1',
              },
              Qty: qty,
              UnitPrice: unitPrice,
            },
            Description: item.description || item.name,
          };
        });
      } else {
        // Second fallback: Use all order items for deposit/pre-shipment billing
        console.log('No shipped items, using all order items');
        
        lineItems = invoice.orders?.order_items?.map((item: any) => {
          const qty = item.quantity;
          const unitPrice = item.unit_price;
          const fullAmount = qty * unitPrice;
          calculatedSubtotal += fullAmount;
          
          console.log(`Item: ${item.name}, Qty: ${qty}, Unit Price: ${unitPrice}, Full Amount: ${fullAmount}`);
          
          return {
            DetailType: 'SalesItemLineDetail',
            Amount: fullAmount,
            SalesItemLineDetail: {
              ItemRef: {
                value: '1',
              },
              Qty: qty,
              UnitPrice: unitPrice,
            },
            Description: item.description || item.name,
          };
        }) || [];
      }
    }

    // Add shipping as a line item if present (full price)
    if (invoice.shipping_cost > 0) {
      const shippingAmount = Number(invoice.shipping_cost);
      calculatedSubtotal += shippingAmount;
      lineItems.push({
        DetailType: 'SalesItemLineDetail',
        Amount: shippingAmount,
        Description: 'Shipping',
        SalesItemLineDetail: {
          ItemRef: { value: '1' }, // Default shipping item
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
      
      console.log(`Adding balance line: -${unbilledPercentage}% = $${Math.abs(unbilledAmount).toFixed(2)}`);
      
      lineItems.push({
        DetailType: 'SalesItemLineDetail',
        Amount: unbilledAmount,
        Description: `Balance Due on Delivery (${unbilledPercentage}% of order)`,
        SalesItemLineDetail: {
          ItemRef: { value: '1' },
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

    if (Math.abs(calculatedTotal - dbTotal) > 0.01) {
      console.warn('WARNING: Calculated total does not match database total!');
      console.warn(`Calculated: ${calculatedTotal}, Database: ${dbTotal}, Diff: ${calculatedTotal - dbTotal}`);
      // Don't throw error, but log the discrepancy for investigation
    }

    // For partial billing, we'll show full invoice then subtract the unbilled portion
    // This way customers see the full order value with deposit clearly shown
    console.log(`Billing ${billingPercentage}% now, ${100 - billingPercentage}% due later`);

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

    // Note: We don't use the Deposit field for partial billing
    // Instead, we adjust the line item amounts to reflect the billing percentage

    let qbResponse;
    if (invoice.quickbooks_id) {
      // Update existing invoice
      console.log('Updating existing QuickBooks invoice:', invoice.quickbooks_id);
      
      const getResponse = await fetch(`${qbApiUrl}/invoice/${invoice.quickbooks_id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (!getResponse.ok) {
        const errorData = await getResponse.json();
        console.error('Failed to fetch existing invoice:', errorData);
        throw new Error(`Failed to fetch invoice from QuickBooks: ${errorData.Fault?.Error?.[0]?.Message || 'Unknown error'}`);
      }
      
      const currentInvoice = await getResponse.json();
      console.log('Current invoice response:', JSON.stringify(currentInvoice).substring(0, 200));
      
      if (!currentInvoice?.Invoice?.SyncToken) {
        console.error('Invalid invoice response:', currentInvoice);
        throw new Error('Could not get SyncToken from QuickBooks invoice. Invoice may have been deleted.');
      }

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
    
    // Log full invoice response to see all available fields
    console.log('Full QuickBooks Invoice Response:', JSON.stringify(qbData.Invoice, null, 2));
    
    // Try to get the shareable invoice link by calling the QB API
    // The shareable link is only available after "sending" the invoice
    let qbPaymentLink = qbData.Invoice?.InvoiceLink || null;
    
    // If no link from the invoice object, try to generate one via the send endpoint
    if (!qbPaymentLink) {
      try {
        console.log('Attempting to get shareable invoice link from QuickBooks...');
        
        // Query the invoice again to check for any additional fields
        const invoiceQueryResponse = await fetch(
          `${qbApiUrl}/invoice/${qbInvoiceId}?minorversion=73`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          }
        );
        
        if (invoiceQueryResponse.ok) {
          const invoiceQueryData = await invoiceQueryResponse.json();
          console.log('Invoice query response:', JSON.stringify(invoiceQueryData.Invoice, null, 2));
          
          // Check for invoice link in query response
          qbPaymentLink = invoiceQueryData.Invoice?.InvoiceLink || 
                         invoiceQueryData.Invoice?.DeliveryInfo?.DeliveryType ||
                         null;
          
          // If still no link, check if we can get it from EmailStatus or BillEmail
          if (!qbPaymentLink && invoiceQueryData.Invoice?.BillEmail) {
            console.log('Invoice has email delivery configured');
          }
        }
        
        // If still no payment link, try to trigger link generation by "sending" the invoice
        if (!qbPaymentLink) {
          console.log('No payment link found, attempting to generate via send endpoint...');
          
          const sendResponse = await fetch(
            `${qbApiUrl}/invoice/${qbInvoiceId}/send?sendTo=${encodeURIComponent(invoice.orders?.customer_email || 'noemail@example.com')}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/octet-stream',
              },
            }
          );
          
          if (sendResponse.ok) {
            console.log('Invoice send triggered successfully');
            
            // Wait a moment for QB to process
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Query the invoice one more time to get the generated link
            const finalQueryResponse = await fetch(
              `${qbApiUrl}/invoice/${qbInvoiceId}?minorversion=73`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json',
                },
              }
            );
            
            if (finalQueryResponse.ok) {
              const finalInvoiceData = await finalQueryResponse.json();
              console.log('Final invoice data after send:', JSON.stringify(finalInvoiceData.Invoice, null, 2));
              qbPaymentLink = finalInvoiceData.Invoice?.InvoiceLink || null;
              console.log('Payment link after send:', qbPaymentLink);
            }
          } else {
            const sendError = await sendResponse.json();
            console.error('Error sending invoice:', sendError);
          }
        }
      } catch (linkError) {
        console.error('Error getting invoice link:', linkError);
      }
    }
    
    console.log('QuickBooks invoice ID:', qbInvoiceId);
    console.log('QuickBooks DocNumber:', qbDocNumber);
    console.log('QuickBooks payment link:', qbPaymentLink);
    console.log('AllowOnlinePayment:', qbData.Invoice?.AllowOnlinePayment);
    console.log('AllowOnlineCreditCardPayment:', qbData.Invoice?.AllowOnlineCreditCardPayment);
    
    // Update invoice with QuickBooks info
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        quickbooks_id: qbInvoiceId,
        quickbooks_synced_at: new Date().toISOString(),
        quickbooks_sync_status: 'synced',
        quickbooks_payment_link: qbPaymentLink,
        billed_percentage: billingPercentage
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
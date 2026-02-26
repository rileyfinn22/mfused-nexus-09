import { supabase } from "@/integrations/supabase/client";
import { generateInvoiceNumber } from "@/lib/invoiceUtils";

/**
 * Shared logic for approving a Pull & Ship order.
 * Creates a child invoice under the blanket, allocates inventory against the
 * **parent** order items, and updates shipped quantities.
 *
 * Returns the created invoice number or null if no parent order.
 */
export async function approvePullShipOrder({
  pullOrder,
  pullOrderItems,
  userId,
}: {
  pullOrder: {
    id: string;
    order_number: string;
    parent_order_id: string | null;
    company_id: string;
    shipping_name?: string;
    shipping_street?: string;
    shipping_city?: string;
    shipping_state: string;
    shipping_zip?: string;
    shipping_cost?: number;
    total: number;
  };
  pullOrderItems: Array<{
    id: string;
    sku: string;
    item_id?: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  userId: string;
}): Promise<{ invoiceNumber: string | null; percentageOfOrder: number }> {
  if (!pullOrder.parent_order_id) {
    return { invoiceNumber: null, percentageOfOrder: 0 };
  }

  // 1. Fetch parent order with items + product item_ids
  const { data: parentOrder, error: parentError } = await supabase
    .from("orders")
    .select("order_number, subtotal, total, order_items(*, products(item_id))")
    .eq("id", pullOrder.parent_order_id)
    .single();

  if (parentError) throw parentError;

  // 2. Build price map from parent order items
  const parentPriceMap: Record<string, number> = {};
  const parentItemMap: Record<string, any> = {}; // sku/item_id -> parent order_item
  if (parentOrder.order_items) {
    for (const pi of parentOrder.order_items) {
      if (pi.sku) {
        parentPriceMap[`sku:${pi.sku}`] = pi.unit_price;
        parentItemMap[`sku:${pi.sku}`] = pi;
      }
      const itemId = (pi as any).products?.item_id;
      if (itemId) {
        parentPriceMap[`item_id:${itemId}`] = pi.unit_price;
        parentItemMap[`item_id:${itemId}`] = pi;
      }
    }
  }

  // 3. Recalculate pull order totals using parent prices
  let recalculatedSubtotal = 0;
  for (const pullItem of pullOrderItems) {
    const unitPrice =
      parentPriceMap[`sku:${pullItem.sku}`] ||
      parentPriceMap[`item_id:${pullItem.sku}`] ||
      parentPriceMap[`item_id:${pullItem.item_id}`] ||
      pullItem.unit_price ||
      1;
    const itemTotal = pullItem.quantity * unitPrice;
    recalculatedSubtotal += itemTotal;

    if (unitPrice !== pullItem.unit_price) {
      await supabase
        .from("order_items")
        .update({ unit_price: unitPrice, total: itemTotal })
        .eq("id", pullItem.id);
    }
  }
  const recalculatedTotal = recalculatedSubtotal;

  if (recalculatedTotal !== pullOrder.total) {
    await supabase
      .from("orders")
      .update({ subtotal: recalculatedSubtotal, total: recalculatedTotal })
      .eq("id", pullOrder.id);
  }

  // 4. Get existing invoices for parent order
  const { data: existingInvoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("id, invoice_number, shipment_number, billed_percentage, invoice_type")
    .eq("order_id", pullOrder.parent_order_id)
    .order("shipment_number", { ascending: false });

  if (invoicesError) throw invoicesError;

  // 5. Ensure blanket invoice exists
  let blanketInvoice = existingInvoices?.find(
    (inv) => inv.invoice_type === "full" && inv.shipment_number === 1
  );

  if (!blanketInvoice) {
    const blanketInvoiceNumber = generateInvoiceNumber(parentOrder.order_number, 1);
    const { data: newBlanket, error: blanketError } = await supabase
      .from("invoices")
      .insert({
        order_id: pullOrder.parent_order_id,
        company_id: pullOrder.company_id,
        invoice_number: blanketInvoiceNumber,
        invoice_type: "full",
        invoice_date: new Date().toISOString(),
        subtotal: parentOrder.subtotal || 0,
        tax: 0,
        total: parentOrder.total || 0,
        shipping_cost: 0,
        shipment_number: 1,
        billed_percentage: 100,
        parent_invoice_id: null,
        status: "open",
        notes: "Main blanket invoice for full order",
        created_by: userId,
      })
      .select()
      .single();

    if (blanketError) throw blanketError;
    blanketInvoice = newBlanket;
  }

  // 6. Calculate next shipment number
  const childInvoices = existingInvoices?.filter((inv) => inv.shipment_number > 1) || [];
  const nextShipmentNumber =
    childInvoices.length > 0
      ? Math.max(...childInvoices.map((inv) => inv.shipment_number)) + 1
      : 2;

  const invoiceNumber = generateInvoiceNumber(parentOrder.order_number, nextShipmentNumber);

  // 7. Calculate percentage
  const blanketTotal = parentOrder.total || 1;
  const percentageOfOrder = (recalculatedTotal / blanketTotal) * 100;

  // 8. Create child invoice linked to blanket
  const { data: invoiceData, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      order_id: pullOrder.parent_order_id,
      company_id: pullOrder.company_id,
      invoice_number: invoiceNumber,
      invoice_type: "partial",
      invoice_date: new Date().toISOString(),
      subtotal: recalculatedSubtotal,
      tax: 0,
      total: recalculatedTotal,
      shipping_cost: pullOrder.shipping_cost || 0,
      shipping_name: pullOrder.shipping_name || null,
      shipping_street: pullOrder.shipping_street || null,
      shipping_city: pullOrder.shipping_city || null,
      shipping_state: pullOrder.shipping_state || null,
      shipping_zip: pullOrder.shipping_zip || null,
      shipment_number: nextShipmentNumber,
      billed_percentage: Number(percentageOfOrder.toFixed(2)),
      parent_invoice_id: blanketInvoice.id,
      status: "draft",
      notes: `Pull & Ship Order: ${pullOrder.order_number}`,
      created_by: userId,
    })
    .select()
    .single();

  if (invoiceError) throw invoiceError;

  // 9. Update parent order shipped_quantity & create inventory allocations
  for (const pullItem of pullOrderItems) {
    // Find matching PARENT order item
    const parentItem =
      parentItemMap[`sku:${pullItem.sku}`] ||
      parentItemMap[`item_id:${pullItem.sku}`] ||
      parentItemMap[`item_id:${pullItem.item_id}`];

    if (parentItem) {
      // Update parent order item shipped_quantity by adding pull quantity
      const currentShipped = Number(parentItem.shipped_quantity || 0);
      const newShipped = currentShipped + pullItem.quantity;
      await supabase
        .from("order_items")
        .update({ shipped_quantity: newShipped })
        .eq("id", parentItem.id);
      // Update our local copy so subsequent items don't double-count
      parentItem.shipped_quantity = newShipped;
    }

    // Find inventory: try state-specific first, then "General"
    let inventoryRecord = null;
    const { data: stateInv } = await supabase
      .from("inventory")
      .select("*")
      .eq("sku", pullItem.sku)
      .eq("company_id", pullOrder.company_id)
      .eq("state", pullOrder.shipping_state)
      .gt("available", 0)
      .maybeSingle();

    if (stateInv) {
      inventoryRecord = stateInv;
    } else {
      // Fallback to General inventory, prefer one linked to parent order
      const { data: generalInv } = await supabase
        .from("inventory")
        .select("*")
        .eq("sku", pullItem.sku)
        .eq("company_id", pullOrder.company_id)
        .eq("state", "General")
        .gt("available", 0)
        .order("available", { ascending: false })
        .limit(1)
        .maybeSingle();

      inventoryRecord = generalInv;
    }

    if (inventoryRecord) {
      // Allocate against the PARENT order item (not the pull order item)
      // so the invoice detail page can look up the correct item
      const allocationOrderItemId = parentItem ? parentItem.id : pullItem.id;

      await supabase.from("inventory_allocations").insert({
        inventory_id: inventoryRecord.id,
        order_item_id: allocationOrderItemId,
        invoice_id: invoiceData.id,
        quantity_allocated: pullItem.quantity,
        allocated_by: userId,
        status: "allocated",
      });

      await supabase
        .from("inventory")
        .update({
          available: Math.max(0, (inventoryRecord.available || 0) - pullItem.quantity),
        })
        .eq("id", inventoryRecord.id);
    }
  }

  // 10. Update blanket invoice billed_percentage
  if (existingInvoices && existingInvoices.length > 0) {
    // Sum all existing child percentages + this new one
    const existingChildPercent = existingInvoices
      .filter((inv) => inv.invoice_type === "partial")
      .reduce((sum, inv) => sum + (inv.billed_percentage || 0), 0);
    const totalBilledPercent = existingChildPercent + percentageOfOrder;

    const fullInvoice = existingInvoices.find((inv) => inv.invoice_type === "full");
    if (fullInvoice) {
      await supabase
        .from("invoices")
        .update({ billed_percentage: Number(totalBilledPercent.toFixed(2)) })
        .eq("id", fullInvoice.id);
    }
  }

  return { invoiceNumber, percentageOfOrder };
}

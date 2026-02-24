import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find all payments with pending sync status that have a QB-synced invoice
    const { data: pendingPayments, error: fetchError } = await supabase
      .from('payments')
      .select(`
        id,
        invoices!inner (
          quickbooks_id
        )
      `)
      .eq('quickbooks_sync_status', 'pending')
      .is('quickbooks_id', null)
      .not('invoices.quickbooks_id', 'is', null)
      .limit(20);

    if (fetchError) {
      console.error('Error fetching pending payments:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      console.log('No pending payments to sync');
      return new Response(
        JSON.stringify({ success: true, synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${pendingPayments.length} pending payments to push to QuickBooks`);

    let synced = 0;
    let failed = 0;

    for (const payment of pendingPayments) {
      try {
        const { error } = await supabase.functions.invoke('quickbooks-sync-payment', {
          body: { paymentId: payment.id }
        });

        if (error) {
          console.error(`Failed to sync payment ${payment.id}:`, error);
          failed++;
        } else {
          console.log(`Synced payment ${payment.id}`);
          synced++;
        }
      } catch (err) {
        console.error(`Exception syncing payment ${payment.id}:`, err);
        failed++;
      }
    }

    console.log(`Push complete: ${synced} synced, ${failed} failed`);

    return new Response(
      JSON.stringify({ success: true, synced, failed, total: pendingPayments.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in quickbooks-push-pending-payments:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

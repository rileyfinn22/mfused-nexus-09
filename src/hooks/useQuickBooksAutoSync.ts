import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export const useQuickBooksAutoSync = () => {
  
  const syncProduct = async (productId: string) => {
    try {
      console.log('Auto-syncing product to QuickBooks:', productId);
      
      const { error } = await supabase.functions.invoke('quickbooks-sync-product', {
        body: { productId }
      });

      if (error) {
        console.error('QuickBooks product sync error:', error);
        return;
      }

      console.log('Product synced to QuickBooks');
    } catch (error) {
      console.error('Failed to auto-sync product:', error);
    }
  };

  const syncInvoice = async (invoiceId: string) => {
    try {
      console.log('Auto-syncing invoice to QuickBooks:', invoiceId);
      
      const { error } = await supabase.functions.invoke('quickbooks-sync-invoice', {
        body: { invoiceId }
      });

      if (error) {
        console.error('QuickBooks invoice sync error:', error);
        return;
      }

      console.log('Invoice synced to QuickBooks');
    } catch (error) {
      console.error('Failed to auto-sync invoice:', error);
    }
  };

  const syncVendorPO = async (vendorPoId: string) => {
    try {
      console.log('Auto-syncing vendor PO to QuickBooks:', vendorPoId);
      
      const { error } = await supabase.functions.invoke('quickbooks-sync-vendor-po', {
        body: { vendorPoId }
      });

      if (error) {
        console.error('QuickBooks vendor PO sync error:', error);
        return;
      }

      console.log('Vendor PO synced to QuickBooks');
    } catch (error) {
      console.error('Failed to auto-sync vendor PO:', error);
    }
  };

  const syncPayment = async (paymentId: string) => {
    try {
      console.log('Auto-syncing payment to QuickBooks:', paymentId);
      
      const { error } = await supabase.functions.invoke('quickbooks-sync-payment', {
        body: { paymentId }
      });

      if (error) {
        console.error('QuickBooks payment sync error:', error);
        return false;
      }

      console.log('Payment synced to QuickBooks');
      return true;
    } catch (error) {
      console.error('Failed to auto-sync payment:', error);
      return false;
    }
  };

  const deleteInvoice = async (invoiceId: string) => {
    try {
      console.log('Deleting invoice from QuickBooks:', invoiceId);
      
      const { error } = await supabase.functions.invoke('quickbooks-delete-invoice', {
        body: { invoiceId }
      });

      if (error) {
        console.error('QuickBooks invoice delete error:', error);
        return false;
      }

      console.log('Invoice deleted from QuickBooks');
      return true;
    } catch (error) {
      console.error('Failed to delete invoice from QuickBooks:', error);
      return false;
    }
  };

  // Check if QuickBooks is connected
  const checkConnection = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) return false;

      const { data: qbSettings } = await supabase
        .from('quickbooks_settings')
        .select('is_connected')
        .eq('company_id', userRole.company_id)
        .single();

      return qbSettings?.is_connected || false;
    } catch {
      return false;
    }
  };

  return {
    syncProduct,
    syncInvoice,
    syncVendorPO,
    syncPayment,
    deleteInvoice,
    checkConnection,
  };
};
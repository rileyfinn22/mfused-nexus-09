import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedVendorPO?: { id: string; po_number: string; total: number; description: string | null } | null;
  mode?: "admin" | "finance";
}

export function AddFinancedInvoiceDialog({ open, onOpenChange, onSuccess, preselectedVendorPO, mode = "admin" }: Props) {
  const isFinanceMode = mode === "finance";
  const [vendorPOs, setVendorPOs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [financedAmount, setFinancedAmount] = useState("");
  const [rmbAmount, setRmbAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("7.2");
  const [financedDate, setFinancedDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [description, setDescription] = useState("");
  const [sendNotification, setSendNotification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPOs, setLoadingPOs] = useState(false);

  useEffect(() => {
    if (open) {
      if (!isFinanceMode) fetchVendorPOs();
      if (preselectedVendorPO && !isFinanceMode) {
        setSelectedPO(preselectedVendorPO);
        const usd = preselectedVendorPO.total?.toString() || "";
        setFinancedAmount(usd);
        setRmbAmount(usd ? (parseFloat(usd) * 7.2).toFixed(2) : "");
        setSearchQuery(preselectedVendorPO.po_number);
      } else {
        setSelectedPO(null);
        setSearchQuery("");
        setFinancedAmount("");
        setRmbAmount("");
        setDescription("");
      }
    }
  }, [open, preselectedVendorPO, isFinanceMode]);

  const fetchVendorPOs = async () => {
    setLoadingPOs(true);
    const { data } = await supabase
      .from("vendor_pos")
      .select("id, po_number, total, description, notes, vendor_id, company_id, vendors(name), orders(order_number, customer_name, description), vendor_po_items(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    setVendorPOs(data || []);
    setLoadingPOs(false);
  };

  const filteredPOs = useMemo(() => {
    if (!searchQuery.trim()) return vendorPOs.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return vendorPOs.filter((po) => {
      const itemNames = Array.isArray(po.vendor_po_items)
        ? (po.vendor_po_items as any[]).map((i: any) => i.name?.toLowerCase() || "").join(" ")
        : "";
      const orderDesc = (po.orders as any)?.description?.toLowerCase() || "";
      return (
        po.po_number?.toLowerCase().includes(q) ||
        po.description?.toLowerCase().includes(q) ||
        po.notes?.toLowerCase().includes(q) ||
        orderDesc.includes(q) ||
        itemNames.includes(q) ||
        (po.orders as any)?.order_number?.toLowerCase().includes(q) ||
        (po.orders as any)?.customer_name?.toLowerCase().includes(q) ||
        (po.vendors as any)?.name?.toLowerCase().includes(q)
      );
    });
  }, [vendorPOs, searchQuery]);

  const handleSelectPO = (po: any) => {
    setSelectedPO(po);
    setSearchQuery(po.po_number);
    const usd = po.total?.toString() || "";
    setFinancedAmount(usd);
    setRmbAmount(usd ? (parseFloat(usd) * parseFloat(exchangeRate)).toFixed(2) : "");
  };

  const handleSubmit = async () => {
    if (!isFinanceMode && !selectedPO) return;
    if (!financedAmount) return;
    setLoading(true);
    const amt = parseFloat(financedAmount);
    const rate = parseFloat(exchangeRate);

    // 1. Add to financing tracker
    const { error } = await supabase.from("financed_invoices").insert({
      vendor_po_id: isFinanceMode ? null : selectedPO.id,
      financed_amount: amt,
      financed_amount_rmb: amt * rate,
      exchange_rate: rate,
      financed_date: financedDate,
      notes: notes || null,
      description: isFinanceMode ? (description || null) : null,
      finance_status: isFinanceMode ? "active" : "pending",
      created_by_role: isFinanceMode ? "finance" : null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Note: vendor PO payment is NOT recorded at pending stage.
    // It will be recorded when the finance company accepts and activates the request.

    // Optionally notify finance company (admin mode only)
    if (!isFinanceMode && sendNotification) {
      try {
        await supabase.functions.invoke("send-finance-notification", {
          body: {
            type: "new_pending",
            poNumber: selectedPO.po_number,
            description: selectedPO.description || "",
            amount: amt,
            notes: notes || undefined,
          },
        });
      } catch (e) {
        console.error("Notification failed:", e);
      }
    }

    toast({ title: isFinanceMode ? "Financed order added" : "Vendor PO submitted for financing (pending approval)" });
    onSuccess();
    onOpenChange(false);
    setSelectedPO(null);
    setSearchQuery("");
    setFinancedAmount("");
    setRmbAmount("");
    setNotes("");
    setDescription("");
    setLoading(false);
  };

  const showDropdown = searchQuery.trim().length > 0 && !selectedPO;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Vendor PO for Financing</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Vendor PO Search */}
          <div>
            <Label>Vendor PO</Label>
            {selectedPO ? (
              <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50">
                <div className="flex-1">
                  <span className="font-mono font-semibold text-sm">PO #{selectedPO.po_number}</span>
                  {selectedPO.description && (
                    <p className="text-xs text-muted-foreground truncate">{selectedPO.description}</p>
                  )}
                </div>
                <Badge variant="secondary">${selectedPO.total?.toFixed(2)}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedPO(null);
                    setSearchQuery("");
                    setFinancedAmount("");
                  }}
                  className="h-6 px-2 text-xs"
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={loadingPOs ? "Loading..." : "Search by PO #, description, customer..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
                {showDropdown && filteredPOs.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 max-h-48 overflow-auto border rounded-lg bg-popover shadow-md">
                    {filteredPOs.map((po) => (
                      <button
                        key={po.id}
                        onClick={() => handleSelectPO(po)}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-medium">PO #{po.po_number}</span>
                          <span className="text-muted-foreground">${po.total?.toFixed(2)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {po.description || (po.orders as any)?.description || (po.orders as any)?.customer_name || "—"}
                          {(po.vendors as any)?.name && ` • ${(po.vendors as any).name}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown && filteredPOs.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 border rounded-lg bg-popover shadow-md p-3 text-sm text-muted-foreground text-center">
                    No vendor POs found
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <Label>Financed Amount (USD)</Label>
            <Input type="number" step="0.01" value={financedAmount} onChange={(e) => {
              const usd = e.target.value;
              setFinancedAmount(usd);
              if (usd && exchangeRate) setRmbAmount((parseFloat(usd) * parseFloat(exchangeRate)).toFixed(2));
              else setRmbAmount("");
            }} placeholder="0.00" />
          </div>
          <div>
            <Label>Exchange Rate (USD → RMB)</Label>
            <Input type="number" step="0.0001" value={exchangeRate} onChange={(e) => {
              const rate = e.target.value;
              setExchangeRate(rate);
              if (financedAmount && rate) setRmbAmount((parseFloat(financedAmount) * parseFloat(rate)).toFixed(2));
            }} />
          </div>
          <div>
            <Label>RMB Amount</Label>
            <Input type="number" step="0.01" value={rmbAmount} onChange={(e) => {
              const rmb = e.target.value;
              setRmbAmount(rmb);
              if (rmb && exchangeRate) setFinancedAmount((parseFloat(rmb) / parseFloat(exchangeRate)).toFixed(2));
              else setFinancedAmount("");
            }} placeholder="0.00" />
          </div>
          <div>
            <Label>Financed Date</Label>
            <Input type="date" value={financedDate} onChange={(e) => setFinancedDate(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="send-notif" checked={sendNotification} onCheckedChange={(v) => setSendNotification(!!v)} />
            <Label htmlFor="send-notif" className="text-sm font-normal cursor-pointer">Send email notification to finance company</Label>
          </div>
          <Button onClick={handleSubmit} disabled={loading || !selectedPO || !financedAmount} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for Financing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

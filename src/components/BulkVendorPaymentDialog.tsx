import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, X, FileText, DollarSign, AlertCircle } from "lucide-react";

interface VendorPO {
  id: string;
  po_number: string;
  total: number;
  final_total: number | null;
  total_paid: number | null;
  status: string;
  company_id: string;
  order_date: string;
  description: string | null;
  orders?: {
    order_number: string;
    description: string | null;
  } | null;
  customer_company?: {
    name: string;
  } | null;
  po_type?: string;
}

interface BulkVendorPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  vendorName: string;
  onSuccess: () => void;
}

interface POAllocation {
  poId: string;
  amount: number;
}

export function BulkVendorPaymentDialog({
  open,
  onOpenChange,
  vendorId,
  vendorName,
  onSuccess
}: BulkVendorPaymentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pos, setPOs] = useState<VendorPO[]>([]);
  
  // Payment details
  const [totalAmount, setTotalAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("wire");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState("");
  
  // Attachment
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // PO selection and allocation
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && vendorId) {
      fetchVendorPOs();
      resetForm();
    }
  }, [open, vendorId]);

  const resetForm = () => {
    setTotalAmount("");
    setPaymentMethod("wire");
    setReferenceNumber("");
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setNotes("");
    setAttachmentFile(null);
    setSelectedPOs(new Set());
    setAllocations({});
  };

  const fetchVendorPOs = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('vendor_pos')
      .select(`
        id, po_number, total, final_total, total_paid, status, company_id, order_date, description, po_type,
        orders(order_number, description),
        customer_company:companies!vendor_pos_customer_company_id_fkey(name)
      `)
      .eq('vendor_id', vendorId)
      .in('status', ['unpaid', 'partial'])
      .order('order_date', { ascending: false });

    if (!error && data) {
      setPOs(data);
    }
    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getBalance = (po: VendorPO) => {
    const total = po.final_total ?? po.total ?? 0;
    return total - (po.total_paid || 0);
  };

  const totalPaymentAmount = parseFloat(totalAmount) || 0;
  
  const totalAllocated = useMemo(() => {
    return Array.from(selectedPOs).reduce((sum, poId) => {
      const allocated = parseFloat(allocations[poId] || "0") || 0;
      return sum + allocated;
    }, 0);
  }, [selectedPOs, allocations]);

  const unallocatedAmount = totalPaymentAmount - totalAllocated;

  const handlePOToggle = (poId: string, checked: boolean) => {
    const newSelected = new Set(selectedPOs);
    if (checked) {
      newSelected.add(poId);
      // Auto-fill with remaining balance if it fits
      const po = pos.find(p => p.id === poId);
      if (po) {
        const balance = getBalance(po);
        const remaining = totalPaymentAmount - totalAllocated;
        const autoAmount = Math.min(balance, remaining > 0 ? remaining : balance);
        setAllocations(prev => ({ ...prev, [poId]: autoAmount.toFixed(2) }));
      }
    } else {
      newSelected.delete(poId);
      setAllocations(prev => {
        const updated = { ...prev };
        delete updated[poId];
        return updated;
      });
    }
    setSelectedPOs(newSelected);
  };

  const handleAllocationChange = (poId: string, value: string) => {
    setAllocations(prev => ({ ...prev, [poId]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 10MB",
          variant: "destructive"
        });
        return;
      }
      setAttachmentFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!totalAmount || totalPaymentAmount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid payment amount", variant: "destructive" });
      return;
    }

    if (selectedPOs.size === 0) {
      toast({ title: "No POs Selected", description: "Please select at least one PO to pay", variant: "destructive" });
      return;
    }

    // Validate allocations
    let hasValidAllocations = true;
    let totalToAllocate = 0;
    const allocationsToProcess: POAllocation[] = [];

    for (const poId of selectedPOs) {
      const amount = parseFloat(allocations[poId] || "0");
      if (amount <= 0) {
        hasValidAllocations = false;
        break;
      }
      const po = pos.find(p => p.id === poId);
      if (po && amount > getBalance(po)) {
        toast({
          title: "Allocation Exceeds Balance",
          description: `Allocation for ${po.po_number} exceeds its remaining balance`,
          variant: "destructive"
        });
        return;
      }
      totalToAllocate += amount;
      allocationsToProcess.push({ poId, amount });
    }

    if (!hasValidAllocations) {
      toast({ title: "Invalid Allocations", description: "All selected POs must have a positive allocation", variant: "destructive" });
      return;
    }

    if (Math.abs(totalToAllocate - totalPaymentAmount) > 0.01) {
      toast({
        title: "Allocation Mismatch",
        description: `Total allocated (${formatCurrency(totalToAllocate)}) must equal payment amount (${formatCurrency(totalPaymentAmount)})`,
        variant: "destructive"
      });
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload attachment if present
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;
      
      if (attachmentFile) {
        setUploading(true);
        const fileExt = attachmentFile.name.split('.').pop();
        const fileName = `vendor-payments/${vendorId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('po-documents')
          .upload(fileName, attachmentFile);
        
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage
          .from('po-documents')
          .getPublicUrl(fileName);
        
        attachmentUrl = urlData.publicUrl;
        attachmentName = attachmentFile.name;
        setUploading(false);
      }

      // Get company_id from first PO
      const companyId = pos[0]?.company_id;
      if (!companyId) throw new Error("Could not determine company");

      // Create payment records for each allocated PO
      const paymentNotes = attachmentUrl 
        ? `${notes || ''}\n[Attachment: ${attachmentName}](${attachmentUrl})`.trim()
        : notes || null;

      for (const allocation of allocationsToProcess) {
        const { error } = await supabase
          .from('vendor_po_payments')
          .insert({
            company_id: companyId,
            vendor_po_id: allocation.poId,
            amount: allocation.amount,
            payment_method: paymentMethod,
            reference_number: referenceNumber || null,
            payment_date: paymentDate,
            notes: paymentNotes,
            created_by: user.id
          });

        if (error) throw error;
      }

      toast({
        title: "Payments Recorded",
        description: `${formatCurrency(totalPaymentAmount)} allocated across ${allocationsToProcess.length} PO(s)`
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error recording payments:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to record payments",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const totalOutstanding = pos.reduce((sum, po) => sum + getBalance(po), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Record Payment - {vendorName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Payment Details Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input
                  id="payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total-amount">Total Amount *</Label>
                <Input
                  id="total-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wire">Wire Transfer</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="ach">ACH</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference #</Label>
                <Input
                  id="reference"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Attachment */}
            <div className="space-y-2">
              <Label>Attachment (Optional)</Label>
              {attachmentFile ? (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate flex-1">{attachmentFile.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttachmentFile(null)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    className="hidden"
                    id="payment-attachment"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('payment-attachment')?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Receipt/Document
                  </Button>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional payment notes"
                rows={2}
              />
            </div>

            {/* Allocation Summary */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
              <div className="text-sm">
                <span className="text-muted-foreground">Total Outstanding:</span>{" "}
                <span className="font-medium">{formatCurrency(totalOutstanding)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Allocated:</span>{" "}
                <span className={`font-medium ${Math.abs(unallocatedAmount) < 0.01 ? 'text-success' : 'text-warning'}`}>
                  {formatCurrency(totalAllocated)}
                </span>
                {Math.abs(unallocatedAmount) >= 0.01 && (
                  <span className="text-muted-foreground ml-2">
                    ({unallocatedAmount > 0 ? '+' : ''}{formatCurrency(unallocatedAmount)} remaining)
                  </span>
                )}
              </div>
            </div>

            {/* PO Selection - Table Style */}
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <Label>Select POs to Pay *</Label>
                <span className="text-xs text-muted-foreground">{selectedPOs.size} selected</span>
              </div>
              <div className="border rounded-lg overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                  <div className="col-span-1"></div>
                  <div className="col-span-2">PO #</div>
                  <div className="col-span-4">Order / Description</div>
                  <div className="col-span-2 text-right">Balance</div>
                  <div className="col-span-3 text-right">Payment</div>
                </div>
                
                <ScrollArea className="h-[220px]">
                  {pos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mb-2" />
                      <p className="text-sm">No unpaid POs for this vendor</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {pos.map((po) => {
                        const balance = getBalance(po);
                        const isSelected = selectedPOs.has(po.id);
                        const orderInfo = po.po_type === 'expense' 
                          ? po.customer_company?.name 
                          : po.orders?.order_number;
                        const orderDesc = po.po_type === 'expense'
                          ? po.description
                          : po.orders?.description || po.description;

                        return (
                          <div
                            key={po.id}
                            className={`grid grid-cols-12 gap-2 px-3 py-2.5 items-center transition-colors cursor-pointer ${
                              isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
                            }`}
                            onClick={() => handlePOToggle(po.id, !isSelected)}
                          >
                            {/* Checkbox */}
                            <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => handlePOToggle(po.id, checked as boolean)}
                              />
                            </div>
                            
                            {/* PO Number */}
                            <div className="col-span-2">
                              <span className="font-medium text-sm">{po.po_number}</span>
                              <div className="text-xs text-muted-foreground">
                                {new Date(po.order_date).toLocaleDateString()}
                              </div>
                            </div>
                            
                            {/* Order / Description */}
                            <div className="col-span-4 min-w-0">
                              {orderInfo && (
                                <div className="text-sm font-medium truncate">{orderInfo}</div>
                              )}
                              {orderDesc && (
                                <div className="text-xs text-muted-foreground truncate" title={orderDesc}>
                                  {orderDesc}
                                </div>
                              )}
                              {!orderInfo && !orderDesc && (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </div>
                            
                            {/* Balance */}
                            <div className="col-span-2 text-right">
                              <span className="text-sm font-medium text-destructive">
                                {formatCurrency(balance)}
                              </span>
                            </div>
                            
                            {/* Payment Input */}
                            <div className="col-span-3 flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                              {isSelected ? (
                                <>
                                  <div className="relative w-24">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0.01"
                                      max={balance}
                                      value={allocations[po.id] || ""}
                                      onChange={(e) => handleAllocationChange(po.id, e.target.value)}
                                      className="h-7 pl-5 text-sm text-right pr-2"
                                      placeholder="0.00"
                                    />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs px-2 shrink-0"
                                    onClick={() => handleAllocationChange(po.id, balance.toFixed(2))}
                                    title="Pay full balance"
                                  >
                                    Full
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground pr-2">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={saving || uploading || !totalAmount || selectedPOs.size === 0 || Math.abs(unallocatedAmount) >= 0.01}
              >
                {(saving || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record Payment
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Edit, Trash2, Building2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { InviteCompanyUserDialog } from "@/components/InviteCompanyUserDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { z } from "zod";

const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name too long"),
  email: z.string().trim().email("Invalid email").max(255, "Email too long").optional().or(z.literal("")),
  phone: z.string().trim().max(50, "Phone too long").optional().or(z.literal("")),
  billing_street: z.string().trim().max(500, "Address too long").optional().or(z.literal("")),
  billing_city: z.string().trim().max(100, "City too long").optional().or(z.literal("")),
  billing_state: z.string().trim().max(50, "State too long").optional().or(z.literal("")),
  billing_zip: z.string().trim().max(20, "ZIP too long").optional().or(z.literal("")),
  shipping_street: z.string().trim().max(500, "Address too long").optional().or(z.literal("")),
  shipping_city: z.string().trim().max(100, "City too long").optional().or(z.literal("")),
  shipping_state: z.string().trim().max(50, "State too long").optional().or(z.literal("")),
  shipping_zip: z.string().trim().max(20, "ZIP too long").optional().or(z.literal("")),
  notes: z.string().trim().max(2000, "Notes too long").optional().or(z.literal("")),
});

const Customers = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedCompanyForInvite, setSelectedCompanyForInvite] = useState<string | undefined>();
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    billing_street: "",
    billing_city: "",
    billing_state: "",
    billing_zip: "",
    shipping_street: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCustomers();
    checkVibeAdmin();
  }, []);

  const checkVibeAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.rpc('has_role', { 
        _user_id: user.id, 
        _role: 'vibe_admin' 
      });
      setIsVibeAdmin(data === true);
    }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .neq('name', 'VibePKG')
      .order('name');
    
    if (error) {
      toast({
        title: "Error loading companies",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setCustomers(data || []);
    }
    setLoading(false);
  };

  const handleOpenDialog = (customer?: any) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        billing_street: customer.billing_street || "",
        billing_city: customer.billing_city || "",
        billing_state: customer.billing_state || "",
        billing_zip: customer.billing_zip || "",
        shipping_street: customer.shipping_street || "",
        shipping_city: customer.shipping_city || "",
        shipping_state: customer.shipping_state || "",
        shipping_zip: customer.shipping_zip || "",
        notes: customer.notes || "",
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: "",
        email: "",
        phone: "",
        billing_street: "",
        billing_city: "",
        billing_state: "",
        billing_zip: "",
        shipping_street: "",
        shipping_city: "",
        shipping_state: "",
        shipping_zip: "",
        notes: "",
      });
    }
    setFormErrors({});
    setShowDialog(true);
  };

  const handleSave = async () => {
    try {
      // Validate form data
      const validated = customerSchema.parse(formData);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const customerData = {
        name: validated.name,
        email: validated.email || null,
        phone: validated.phone || null,
        billing_street: validated.billing_street || null,
        billing_city: validated.billing_city || null,
        billing_state: validated.billing_state || null,
        billing_zip: validated.billing_zip || null,
        shipping_street: validated.shipping_street || null,
        shipping_city: validated.shipping_city || null,
        shipping_state: validated.shipping_state || null,
        shipping_zip: validated.shipping_zip || null,
        notes: validated.notes || null,
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from('companies')
          .update(customerData)
          .eq('id', editingCustomer.id);

        if (error) throw error;

        toast({
          title: "Company updated",
          description: "Company information has been updated successfully.",
        });
      } else {
        const { error } = await supabase
          .from('companies')
          .insert([customerData]);

        if (error) throw error;

        toast({
          title: "Company created",
          description: "New company has been created successfully.",
        });
      }

      setShowDialog(false);
      fetchCustomers();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0] as string] = err.message;
          }
        });
        setFormErrors(errors);
      } else {
        toast({
          title: "Error saving company",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;

    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', deletingCustomer.id);

      if (error) throw error;

      toast({
        title: "Company deleted",
        description: "Company has been deleted successfully.",
      });

      setShowDeleteDialog(false);
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: "Error deleting company",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-muted-foreground mt-1">Manage your company accounts and information</p>
        </div>
        <div className="flex gap-2">
          {isVibeAdmin && (
            <Button variant="outline" onClick={() => setShowInviteDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          )}
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/30 border-b border-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-3">Company Name</div>
            <div className="col-span-3">Contact</div>
            <div className="col-span-3">Billing Address</div>
            <div className="col-span-2">QuickBooks</div>
            <div className="col-span-1">Actions</div>
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading companies...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No companies found. Create your first company to get started.
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <div 
                key={customer.id} 
                className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer even:bg-muted/10"
                onClick={() => navigate(`/customers/${customer.id}`)}
              >
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{customer.name}</div>
                      {customer.notes && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {customer.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-span-3 text-sm">
                  {customer.email && (
                    <div className="text-foreground">{customer.email}</div>
                  )}
                  {customer.phone && (
                    <div className="text-muted-foreground">{customer.phone}</div>
                  )}
                  {!customer.email && !customer.phone && (
                    <span className="text-muted-foreground">No contact info</span>
                  )}
                </div>
                <div className="col-span-3 text-sm">
                  {customer.billing_street ? (
                    <>
                      <div>{customer.billing_street}</div>
                      {customer.billing_city && (
                        <div className="text-muted-foreground">
                          {customer.billing_city}, {customer.billing_state} {customer.billing_zip}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">No address</span>
                  )}
                </div>
                <div className="col-span-2">
                  {customer.quickbooks_id ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
                      Synced
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Not synced
                    </Badge>
                  )}
                </div>
                <div className="col-span-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={() => handleOpenDialog(customer)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      setDeletingCustomer(customer);
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Company' : 'Add Company'}</DialogTitle>
            <DialogDescription>
              {editingCustomer ? 'Update company information' : 'Create a new company account'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="font-semibold">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Company Name"
                  />
                  {formErrors.name && <p className="text-sm text-destructive mt-1">{formErrors.name}</p>}
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contact@example.com"
                  />
                  {formErrors.email && <p className="text-sm text-destructive mt-1">{formErrors.email}</p>}
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                  {formErrors.phone && <p className="text-sm text-destructive mt-1">{formErrors.phone}</p>}
                </div>
              </div>
            </div>

            {/* Billing Address */}
            <div className="space-y-4">
              <h3 className="font-semibold">Billing Address</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="billing_street">Street Address</Label>
                  <Input
                    id="billing_street"
                    value={formData.billing_street}
                    onChange={(e) => setFormData({ ...formData, billing_street: e.target.value })}
                    placeholder="123 Main St"
                  />
                </div>
                <div>
                  <Label htmlFor="billing_city">City</Label>
                  <Input
                    id="billing_city"
                    value={formData.billing_city}
                    onChange={(e) => setFormData({ ...formData, billing_city: e.target.value })}
                    placeholder="Los Angeles"
                  />
                </div>
                <div>
                  <Label htmlFor="billing_state">State</Label>
                  <Input
                    id="billing_state"
                    value={formData.billing_state}
                    onChange={(e) => setFormData({ ...formData, billing_state: e.target.value })}
                    placeholder="CA"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="billing_zip">ZIP Code</Label>
                  <Input
                    id="billing_zip"
                    value={formData.billing_zip}
                    onChange={(e) => setFormData({ ...formData, billing_zip: e.target.value })}
                    placeholder="90001"
                  />
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="space-y-4">
              <h3 className="font-semibold">Shipping Address</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="shipping_street">Street Address</Label>
                  <Input
                    id="shipping_street"
                    value={formData.shipping_street}
                    onChange={(e) => setFormData({ ...formData, shipping_street: e.target.value })}
                    placeholder="123 Main St"
                  />
                </div>
                <div>
                  <Label htmlFor="shipping_city">City</Label>
                  <Input
                    id="shipping_city"
                    value={formData.shipping_city}
                    onChange={(e) => setFormData({ ...formData, shipping_city: e.target.value })}
                    placeholder="Los Angeles"
                  />
                </div>
                <div>
                  <Label htmlFor="shipping_state">State</Label>
                  <Input
                    id="shipping_state"
                    value={formData.shipping_state}
                    onChange={(e) => setFormData({ ...formData, shipping_state: e.target.value })}
                    placeholder="CA"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="shipping_zip">ZIP Code</Label>
                  <Input
                    id="shipping_zip"
                    value={formData.shipping_zip}
                    onChange={(e) => setFormData({ ...formData, shipping_zip: e.target.value })}
                    placeholder="90001"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this customer..."
                rows={3}
              />
              {formErrors.notes && <p className="text-sm text-destructive mt-1">{formErrors.notes}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingCustomer ? 'Update Company' : 'Create Company'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Company?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingCustomer?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite User Dialog */}
      <InviteCompanyUserDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        preselectedCompanyId={selectedCompanyForInvite}
      />
    </div>
  );
};

export default Customers;
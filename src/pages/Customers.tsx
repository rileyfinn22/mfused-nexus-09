import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Edit, Trash2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
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
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name');
    
    if (error) {
      toast({
        title: "Error loading customers",
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

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("No company associated");

      const customerData = {
        company_id: userRole.company_id,
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
          .from('customers')
          .update(customerData)
          .eq('id', editingCustomer.id);

        if (error) throw error;

        toast({
          title: "Customer updated",
          description: "Customer information has been updated successfully.",
        });
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([customerData]);

        if (error) throw error;

        toast({
          title: "Customer created",
          description: "New customer has been created successfully.",
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
          title: "Error saving customer",
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
        .from('customers')
        .delete()
        .eq('id', deletingCustomer.id);

      if (error) throw error;

      toast({
        title: "Customer deleted",
        description: "Customer has been deleted successfully.",
      });

      setShowDeleteDialog(false);
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: "Error deleting customer",
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
          <h1 className="text-3xl font-bold">Customers</h1>
          <p className="text-muted-foreground mt-1">Manage your customer contacts and information</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="border border-table-border rounded">
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-3">Customer Name</div>
            <div className="col-span-3">Contact</div>
            <div className="col-span-3">Billing Address</div>
            <div className="col-span-2">QuickBooks</div>
            <div className="col-span-1">Actions</div>
          </div>
        </div>

        <div className="divide-y divide-table-border">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading customers...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No customers found. Create your first customer to get started.
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <div 
                key={customer.id} 
                className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors"
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
                <div className="col-span-1 flex gap-1">
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
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
            <DialogDescription>
              {editingCustomer ? 'Update customer information' : 'Create a new customer contact'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="font-semibold">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Customer Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Common Citizen"
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
              {editingCustomer ? 'Update Customer' : 'Create Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer?</AlertDialogTitle>
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
    </div>
  );
};

export default Customers;
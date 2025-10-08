import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit, Search, Building2 } from "lucide-react";

const Vendors = () => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    payment_terms: "Net 30",
    notes: ""
  });

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setVendors(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole) return;

    if (editingVendor) {
      const { error } = await supabase
        .from('vendors')
        .update(formData)
        .eq('id', editingVendor.id);
      
      if (error) {
        toast({ title: "Error", description: "Failed to update vendor", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Vendor updated successfully" });
        fetchVendors();
        handleCloseDialog();
      }
    } else {
      const { error } = await supabase
        .from('vendors')
        .insert({ ...formData, company_id: userRole.company_id });
      
      if (error) {
        toast({ title: "Error", description: "Failed to create vendor", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Vendor created successfully" });
        fetchVendors();
        handleCloseDialog();
      }
    }
  };

  const handleEdit = (vendor: any) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name || "",
      contact_name: vendor.contact_name || "",
      contact_email: vendor.contact_email || "",
      contact_phone: vendor.contact_phone || "",
      address_street: vendor.address_street || "",
      address_city: vendor.address_city || "",
      address_state: vendor.address_state || "",
      address_zip: vendor.address_zip || "",
      payment_terms: vendor.payment_terms || "Net 30",
      notes: vendor.notes || ""
    });
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingVendor(null);
    setFormData({
      name: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      address_street: "",
      address_city: "",
      address_state: "",
      address_zip: "",
      payment_terms: "Net 30",
      notes: ""
    });
  };

  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.contact_name && v.contact_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Vendor Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your vendors and suppliers</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingVendor(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Vendor Name *</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Vendor Name"
                  />
                </div>
                <div>
                  <Label>Contact Name</Label>
                  <Input
                    value={formData.contact_name}
                    onChange={(e) => setFormData({...formData, contact_name: e.target.value})}
                    placeholder="Contact Name"
                  />
                </div>
                <div>
                  <Label>Contact Email</Label>
                  <Input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <Label>Contact Phone</Label>
                  <Input
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                    placeholder="Phone Number"
                  />
                </div>
                <div>
                  <Label>Payment Terms</Label>
                  <Input
                    value={formData.payment_terms}
                    onChange={(e) => setFormData({...formData, payment_terms: e.target.value})}
                    placeholder="Net 30"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Street Address</Label>
                  <Input
                    value={formData.address_street}
                    onChange={(e) => setFormData({...formData, address_street: e.target.value})}
                    placeholder="Street Address"
                  />
                </div>
                <div>
                  <Label>City</Label>
                  <Input
                    value={formData.address_city}
                    onChange={(e) => setFormData({...formData, address_city: e.target.value})}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input
                    value={formData.address_state}
                    onChange={(e) => setFormData({...formData, address_state: e.target.value})}
                    placeholder="State"
                  />
                </div>
                <div>
                  <Label>ZIP Code</Label>
                  <Input
                    value={formData.address_zip}
                    onChange={(e) => setFormData({...formData, address_zip: e.target.value})}
                    placeholder="ZIP"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancel</Button>
                <Button type="submit">{editingVendor ? 'Update' : 'Create'} Vendor</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search vendors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">Loading vendors...</TableCell>
                </TableRow>
              ) : filteredVendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    <div className="py-8">
                      <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No vendors found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredVendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">{vendor.name}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{vendor.contact_name || '-'}</div>
                        <div className="text-muted-foreground">{vendor.contact_email || '-'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {vendor.address_city && vendor.address_state 
                        ? `${vendor.address_city}, ${vendor.address_state}`
                        : '-'
                      }
                    </TableCell>
                    <TableCell>{vendor.payment_terms || 'Net 30'}</TableCell>
                    <TableCell>
                      <Badge variant={vendor.is_active ? "default" : "secondary"}>
                        {vendor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(vendor)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Vendors;
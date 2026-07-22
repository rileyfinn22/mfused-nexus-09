import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit, Search, Building2, Mail } from "lucide-react";
import VendorInviteDialog from "@/components/VendorInviteDialog";

const Vendors = () => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any>(null);
  const [selectedVendor, setSelectedVendor] = useState<{ id: string; name: string } | null>(null);
  const [companyId, setCompanyId] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    notes: "",
    category: "production" as "production" | "fulfillment",
    // Address fields
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    address_country: "USA",
    // Bank fields
    bank_name: "",
    bank_account_name: "",
    bank_account_number: "",
    bank_routing_number: "",
    bank_swift_code: "",
    bank_iban: "",
    bank_country: ""
  });

  useEffect(() => {
    fetchVendors();
    fetchCompanyId();
  }, []);

  const fetchCompanyId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("user_roles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      
      if (data) {
        setCompanyId(data.company_id);
      }
    }
  };

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
        .update({
          ...formData,
          is_fulfillment_vendor: formData.category === 'fulfillment'
        })
        .eq('id', editingVendor.id);
      
      if (error) {
        console.error("Vendor update error:", error);
        toast({ title: "Error", description: error.message || "Failed to update vendor", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Vendor updated successfully" });
        fetchVendors();
        handleCloseDialog();
      }
    } else {
      const { error } = await supabase
        .from('vendors')
        .insert({ 
          ...formData, 
          company_id: userRole.company_id,
          is_fulfillment_vendor: formData.category === 'fulfillment'
        });
      
      if (error) {
        console.error("Vendor creation error:", error);
        toast({ 
          title: "Error", 
          description: error.message || "Failed to create vendor", 
          variant: "destructive" 
        });
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
      notes: vendor.notes || "",
      category: vendor.category || "production",
      address_street: vendor.address_street || "",
      address_city: vendor.address_city || "",
      address_state: vendor.address_state || "",
      address_zip: vendor.address_zip || "",
      address_country: vendor.address_country || "USA",
      bank_name: vendor.bank_name || "",
      bank_account_name: vendor.bank_account_name || "",
      bank_account_number: vendor.bank_account_number || "",
      bank_routing_number: vendor.bank_routing_number || "",
      bank_swift_code: vendor.bank_swift_code || "",
      bank_iban: vendor.bank_iban || "",
      bank_country: vendor.bank_country || ""
    });
    setDialogOpen(true);
  };

  const handleInvite = (vendor: any) => {
    setSelectedVendor({ id: vendor.id, name: vendor.name });
    setInviteDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingVendor(null);
    setFormData({
      name: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      notes: "",
      category: "production",
      address_street: "",
      address_city: "",
      address_state: "",
      address_zip: "",
      address_country: "USA",
      bank_name: "",
      bank_account_name: "",
      bank_account_number: "",
      bank_routing_number: "",
      bank_swift_code: "",
      bank_iban: "",
      bank_country: ""
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
            <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">Basic Information</h3>
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
                    <Label>Category *</Label>
                    <Select 
                      value={formData.category} 
                      onValueChange={(value: "production" | "fulfillment") => setFormData({...formData, category: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="fulfillment">Fulfillment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Address Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">Address</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Country</Label>
                    <Select 
                      value={formData.address_country} 
                      onValueChange={(value) => setFormData({...formData, address_country: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USA">United States</SelectItem>
                        <SelectItem value="Canada">Canada</SelectItem>
                        <SelectItem value="UK">United Kingdom</SelectItem>
                        <SelectItem value="China">China</SelectItem>
                        <SelectItem value="Mexico">Mexico</SelectItem>
                        <SelectItem value="Germany">Germany</SelectItem>
                        <SelectItem value="Japan">Japan</SelectItem>
                        <SelectItem value="India">India</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Street Address</Label>
                    <Input
                      value={formData.address_street}
                      onChange={(e) => setFormData({...formData, address_street: e.target.value})}
                      placeholder="123 Main St"
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
                    <Label>{formData.address_country === 'USA' ? 'State' : 'State/Province/Region'}</Label>
                    <Input
                      value={formData.address_state}
                      onChange={(e) => setFormData({...formData, address_state: e.target.value})}
                      placeholder={formData.address_country === 'USA' ? 'CA' : 'Province/Region'}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>{formData.address_country === 'USA' ? 'ZIP Code' : 'Postal Code'}</Label>
                    <Input
                      value={formData.address_zip}
                      onChange={(e) => setFormData({...formData, address_zip: e.target.value})}
                      placeholder={formData.address_country === 'USA' ? '12345' : 'Postal Code'}
                    />
                  </div>
                </div>
              </div>

              {/* Bank Info Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">Bank Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Bank Country</Label>
                    <Select 
                      value={formData.bank_country} 
                      onValueChange={(value) => setFormData({...formData, bank_country: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USA">United States</SelectItem>
                        <SelectItem value="International">International</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Bank Name</Label>
                    <Input
                      value={formData.bank_name}
                      onChange={(e) => setFormData({...formData, bank_name: e.target.value})}
                      placeholder="Bank of America"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Account Name</Label>
                    <Input
                      value={formData.bank_account_name}
                      onChange={(e) => setFormData({...formData, bank_account_name: e.target.value})}
                      placeholder="Account holder name"
                    />
                  </div>
                  <div>
                    <Label>Account Number</Label>
                    <Input
                      value={formData.bank_account_number}
                      onChange={(e) => setFormData({...formData, bank_account_number: e.target.value})}
                      placeholder="Account number"
                    />
                  </div>
                  {formData.bank_country === 'USA' || !formData.bank_country ? (
                    <div>
                      <Label>Routing Number (ACH)</Label>
                      <Input
                        value={formData.bank_routing_number}
                        onChange={(e) => setFormData({...formData, bank_routing_number: e.target.value})}
                        placeholder="9-digit routing number"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label>SWIFT/BIC Code</Label>
                        <Input
                          value={formData.bank_swift_code}
                          onChange={(e) => setFormData({...formData, bank_swift_code: e.target.value})}
                          placeholder="SWIFT code"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>IBAN</Label>
                        <Input
                          value={formData.bank_iban}
                          onChange={(e) => setFormData({...formData, bank_iban: e.target.value})}
                          placeholder="International Bank Account Number"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">Notes</h3>
                <div>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-background">
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
                <TableHead>Phone</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">Loading vendors...</TableCell>
                </TableRow>
              ) : filteredVendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
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
                    <TableCell>{vendor.contact_phone || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{vendor.notes || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={vendor.category === 'fulfillment' ? "default" : "outline"}>
                        {vendor.category === 'fulfillment' ? 'Fulfillment' : 'Production'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={vendor.is_active ? "default" : "secondary"}>
                        {vendor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(vendor)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleInvite(vendor)} title="Invite vendor to portal">
                          <Mail className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedVendor && (
        <VendorInviteDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          vendorId={selectedVendor.id}
          vendorName={selectedVendor.name}
          companyId={companyId}
        />
      )}
    </div>
  );
};

export default Vendors;

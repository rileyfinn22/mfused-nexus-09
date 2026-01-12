import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Plus, Trash2, Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CompanyEmail {
  id: string;
  email: string;
  label: string;
  is_primary: boolean;
}

interface CompanyEmailsManagerProps {
  companyId: string;
  readOnly?: boolean;
}

const EMAIL_LABELS = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "orders", label: "Orders" },
  { value: "shipping", label: "Shipping" },
  { value: "support", label: "Support" },
];

export function CompanyEmailsManager({ companyId, readOnly = false }: CompanyEmailsManagerProps) {
  const [emails, setEmails] = useState<CompanyEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("general");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchEmails();
    }
  }, [companyId]);

  const fetchEmails = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_emails')
      .select('*')
      .eq('company_id', companyId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching emails:', error);
    } else {
      setEmails(data || []);
    }
    setLoading(false);
  };

  const handleAddEmail = async () => {
    if (!newEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase
        .from('company_emails')
        .insert({
          company_id: companyId,
          email: newEmail.trim().toLowerCase(),
          label: newLabel,
          is_primary: emails.length === 0, // First email is primary
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Email already exists",
            description: "This email is already added to this company",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        toast({ title: "Email added" });
        setNewEmail("");
        setNewLabel("general");
        fetchEmails();
      }
    } catch (error: any) {
      toast({
        title: "Error adding email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteEmail = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('company_emails')
        .delete()
        .eq('id', emailId);

      if (error) throw error;

      toast({ title: "Email removed" });
      fetchEmails();
    } catch (error: any) {
      toast({
        title: "Error removing email",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSetPrimary = async (emailId: string) => {
    try {
      // First, unset all primary
      await supabase
        .from('company_emails')
        .update({ is_primary: false })
        .eq('company_id', companyId);

      // Set new primary
      const { error } = await supabase
        .from('company_emails')
        .update({ is_primary: true })
        .eq('id', emailId);

      if (error) throw error;

      toast({ title: "Primary email updated" });
      fetchEmails();
    } catch (error: any) {
      toast({
        title: "Error updating primary email",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getLabelColor = (label: string) => {
    switch (label) {
      case 'billing':
        return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'orders':
        return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'shipping':
        return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
      case 'support':
        return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Loading emails...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Company Emails</Label>
        {emails.length > 0 && (
          <span className="text-xs text-muted-foreground">{emails.length} email(s)</span>
        )}
      </div>

      {/* Existing Emails */}
      {emails.length > 0 ? (
        <div className="space-y-2">
          {emails.map((email) => (
            <div
              key={email.id}
              className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm truncate">{email.email}</span>
                <Badge variant="outline" className={`text-xs ${getLabelColor(email.label)}`}>
                  {email.label}
                </Badge>
                {email.is_primary && (
                  <Badge variant="default" className="text-xs bg-primary/10 text-primary border-primary/20">
                    <Star className="h-3 w-3 mr-1 fill-current" />
                    Primary
                  </Badge>
                )}
              </div>
              {!readOnly && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!email.is_primary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleSetPrimary(email.id)}
                      title="Set as primary"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDeleteEmail(email.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No emails added yet</p>
      )}

      {/* Add New Email */}
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            placeholder="Add email address..."
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddEmail();
              }
            }}
            className="flex-1"
          />
          <Select value={newLabel} onValueChange={setNewLabel}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_LABELS.map((label) => (
                <SelectItem key={label.value} value={label.value}>
                  {label.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={handleAddEmail}
            disabled={adding || !newEmail.trim()}
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}

// Hook to fetch company emails for use in other components
export function useCompanyEmails(companyId: string | null) {
  const [emails, setEmails] = useState<CompanyEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchEmails();
    } else {
      setEmails([]);
      setLoading(false);
    }

    async function fetchEmails() {
      setLoading(true);
      const { data, error } = await supabase
        .from('company_emails')
        .select('*')
        .eq('company_id', companyId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (!error && data) {
        setEmails(data);
      }
      setLoading(false);
    }
  }, [companyId]);

  return { emails, loading, refetch: () => {} };
}

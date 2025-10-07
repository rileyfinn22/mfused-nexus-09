import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function MyPOs() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const { data, error } = await supabase
        .from('po_submissions')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubmissions(data || []);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast({
        title: "Error",
        description: "Failed to load purchase orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending_analysis':
        return <Clock className="h-4 w-4" />;
      case 'pending_approval':
        return <AlertCircle className="h-4 w-4" />;
      case 'approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'rejected':
        return <XCircle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_analysis':
        return 'bg-blue-500/10 text-blue-500';
      case 'pending_approval':
        return 'bg-yellow-500/10 text-yellow-500';
      case 'approved':
        return 'bg-green-500/10 text-green-500';
      case 'rejected':
        return 'bg-red-500/10 text-red-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (loading) {
    return <div className="container mx-auto p-6">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Purchase Orders</h1>
          <p className="text-muted-foreground mt-1">Track your PO submissions and approvals</p>
        </div>
        <Button onClick={() => navigate('/upload-po')}>
          Upload New PO
        </Button>
      </div>

      <div className="grid gap-4">
        {submissions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">No purchase orders yet</p>
              <p className="text-muted-foreground mb-4">Upload your first PO to get started</p>
              <Button onClick={() => navigate('/upload-po')}>Upload PO</Button>
            </CardContent>
          </Card>
        ) : (
          submissions.map((submission) => (
            <Card key={submission.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {submission.original_filename}
                    </CardTitle>
                    <CardDescription>
                      Submitted {new Date(submission.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <Badge className={getStatusColor(submission.status)}>
                    {getStatusIcon(submission.status)}
                    <span className="ml-1">{getStatusLabel(submission.status)}</span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {submission.extracted_data && (
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      {submission.extracted_data.po_number && (
                        <div>
                          <p className="text-muted-foreground">PO Number</p>
                          <p className="font-medium">{submission.extracted_data.po_number}</p>
                        </div>
                      )}
                      {submission.extracted_data.total_amount && (
                        <div>
                          <p className="text-muted-foreground">Total Amount</p>
                          <p className="font-medium">${submission.extracted_data.total_amount}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {submission.status === 'approved' && (
                  <div className="mt-4 p-4 bg-green-500/10 rounded-lg space-y-2 text-sm">
                    <p className="font-medium text-green-600">Approved Details</p>
                    <div className="grid grid-cols-3 gap-4">
                      {submission.approved_pricing && (
                        <div>
                          <p className="text-muted-foreground">Pricing</p>
                          <p className="font-medium">${submission.approved_pricing}</p>
                        </div>
                      )}
                      {submission.approved_lead_time_days && (
                        <div>
                          <p className="text-muted-foreground">Lead Time</p>
                          <p className="font-medium">{submission.approved_lead_time_days} days</p>
                        </div>
                      )}
                      {submission.approved_cost && (
                        <div>
                          <p className="text-muted-foreground">Cost</p>
                          <p className="font-medium">${submission.approved_cost}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {submission.status === 'rejected' && submission.rejection_reason && (
                  <div className="mt-4 p-4 bg-red-500/10 rounded-lg text-sm">
                    <p className="font-medium text-red-600 mb-1">Rejection Reason</p>
                    <p className="text-muted-foreground">{submission.rejection_reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
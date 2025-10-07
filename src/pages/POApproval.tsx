import { useEffect, useState } from "react";
import { FileText, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function POApproval() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [approvalData, setApprovalData] = useState({
    pricing: '',
    leadTime: '',
    cost: '',
    notes: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('po_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubmissions(data || []);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast({
        title: "Error",
        description: "Failed to load submissions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (submissionId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('po_submissions')
        .update({
          status: 'approved',
          approved_pricing: parseFloat(approvalData.pricing),
          approved_lead_time_days: parseInt(approvalData.leadTime),
          approved_cost: parseFloat(approvalData.cost),
          internal_notes: approvalData.notes,
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', submissionId);

      if (error) throw error;

      toast({
        title: "Approved",
        description: "Purchase order has been approved",
      });

      setSelectedSubmission(null);
      setApprovalData({ pricing: '', leadTime: '', cost: '', notes: '' });
      fetchSubmissions();
    } catch (error) {
      console.error('Error approving submission:', error);
      toast({
        title: "Error",
        description: "Failed to approve submission",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (submissionId: string, reason: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('po_submissions')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          internal_notes: approvalData.notes,
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', submissionId);

      if (error) throw error;

      toast({
        title: "Rejected",
        description: "Purchase order has been rejected",
      });

      setSelectedSubmission(null);
      setApprovalData({ pricing: '', leadTime: '', cost: '', notes: '' });
      fetchSubmissions();
    } catch (error) {
      console.error('Error rejecting submission:', error);
      toast({
        title: "Error",
        description: "Failed to reject submission",
        variant: "destructive",
      });
    }
  };

  const pendingSubmissions = submissions.filter(s => 
    s.status === 'pending_approval' || s.status === 'pending_analysis'
  );
  const processedSubmissions = submissions.filter(s => 
    s.status === 'approved' || s.status === 'rejected'
  );

  if (loading) {
    return <div className="container mx-auto p-6">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">PO Approval Center</h1>

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingSubmissions.length})
          </TabsTrigger>
          <TabsTrigger value="processed">
            Processed ({processedSubmissions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingSubmissions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No pending submissions</p>
              </CardContent>
            </Card>
          ) : (
            pendingSubmissions.map((submission) => (
              <Card key={submission.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {submission.original_filename}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Submitted {new Date(submission.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={submission.status === 'pending_analysis' ? 'secondary' : 'default'}>
                      {submission.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {submission.extracted_data && (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <p className="font-medium">Extracted Information</p>
                      <pre className="text-xs overflow-auto">
                        {JSON.stringify(submission.extracted_data, null, 2)}
                      </pre>
                    </div>
                  )}

                  {submission.status === 'pending_approval' && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor={`pricing-${submission.id}`}>Approved Pricing ($)</Label>
                          <Input
                            id={`pricing-${submission.id}`}
                            type="number"
                            step="0.01"
                            value={approvalData.pricing}
                            onChange={(e) => setApprovalData({...approvalData, pricing: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`leadtime-${submission.id}`}>Lead Time (days)</Label>
                          <Input
                            id={`leadtime-${submission.id}`}
                            type="number"
                            value={approvalData.leadTime}
                            onChange={(e) => setApprovalData({...approvalData, leadTime: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`cost-${submission.id}`}>Cost ($)</Label>
                          <Input
                            id={`cost-${submission.id}`}
                            type="number"
                            step="0.01"
                            value={approvalData.cost}
                            onChange={(e) => setApprovalData({...approvalData, cost: e.target.value})}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`notes-${submission.id}`}>Internal Notes</Label>
                        <Textarea
                          id={`notes-${submission.id}`}
                          value={approvalData.notes}
                          onChange={(e) => setApprovalData({...approvalData, notes: e.target.value})}
                          placeholder="Add any internal notes..."
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApprove(submission.id)}
                          className="flex-1"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          onClick={() => {
                            const reason = prompt('Enter rejection reason:');
                            if (reason) handleReject(submission.id, reason);
                          }}
                          variant="destructive"
                          className="flex-1"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="processed" className="space-y-4">
          {processedSubmissions.map((submission) => (
            <Card key={submission.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {submission.original_filename}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {submission.status === 'approved' ? 'Approved' : 'Rejected'} on{' '}
                      {new Date(submission.approved_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={submission.status === 'approved' ? 'default' : 'destructive'}>
                    {submission.status.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {submission.status === 'approved' && (
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Pricing</p>
                      <p className="font-medium">${submission.approved_pricing}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Lead Time</p>
                      <p className="font-medium">{submission.approved_lead_time_days} days</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Cost</p>
                      <p className="font-medium">${submission.approved_cost}</p>
                    </div>
                  </div>
                )}
                {submission.rejection_reason && (
                  <div className="mt-4 p-4 bg-red-500/10 rounded-lg text-sm">
                    <p className="font-medium text-red-600 mb-1">Rejection Reason</p>
                    <p>{submission.rejection_reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
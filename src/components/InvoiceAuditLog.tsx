import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Clock, FileText, Edit, Trash2, RotateCcw, DollarSign } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface AuditLogEntry {
  id: string;
  action: string;
  changed_by: string;
  changed_at: string;
  changes: any;
  notes: string | null;
}

interface InvoiceAuditLogProps {
  invoiceId: string;
}

export const InvoiceAuditLog = ({ invoiceId }: InvoiceAuditLogProps) => {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLogs();
  }, [invoiceId]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoice_audit_log')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('changed_at', { ascending: false });
    
    if (data) {
      setAuditLogs(data);
    }
    setLoading(false);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'created': return <FileText className="h-4 w-4 text-green-600" />;
      case 'updated': return <Edit className="h-4 w-4 text-blue-600" />;
      case 'deleted': return <Trash2 className="h-4 w-4 text-red-600" />;
      case 'restored': return <RotateCcw className="h-4 w-4 text-green-600" />;
      case 'payment_added': return <DollarSign className="h-4 w-4 text-green-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created': return 'text-green-600 dark:text-green-400';
      case 'updated': return 'text-blue-600 dark:text-blue-400';
      case 'deleted': return 'text-red-600 dark:text-red-400';
      case 'restored': return 'text-green-600 dark:text-green-400';
      case 'payment_added': return 'text-green-600 dark:text-green-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const renderChanges = (changes: any, action: string) => {
    if (!changes) return null;

    if (action === 'created') {
      return (
        <div className="text-sm text-muted-foreground">
          Invoice created with total: ${changes.total}
        </div>
      );
    }

    if (action === 'deleted' && changes.deleted_at) {
      return (
        <div className="text-sm text-muted-foreground">
          Soft deleted at {formatDate(changes.deleted_at)}
        </div>
      );
    }

    if (action === 'restored' && changes.restored_at) {
      return (
        <div className="text-sm text-muted-foreground">
          Restored at {formatDate(changes.restored_at)}
        </div>
      );
    }

    if (action === 'updated' && changes.old && changes.new) {
      const old = changes.old;
      const newData = changes.new;
      const changedFields: string[] = [];

      Object.keys(newData).forEach(key => {
        if (old[key] !== newData[key] && key !== 'updated_at') {
          changedFields.push(key);
        }
      });

      if (changedFields.length === 0) return null;

      return (
        <div className="text-sm space-y-1">
          {changedFields.map(field => (
            <div key={field} className="flex gap-2">
              <span className="font-medium">{field}:</span>
              <span className="text-red-600 line-through">{String(old[field])}</span>
              <span className="text-green-600">{String(newData[field])}</span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
        {JSON.stringify(changes, null, 2)}
      </pre>
    );
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading audit log...</div>;
  }

  if (auditLogs.length === 0) {
    return <div className="text-sm text-muted-foreground">No audit log entries found.</div>;
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="audit-log">
        <AccordionTrigger className="text-sm font-medium">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Audit Log ({auditLogs.length} entries)
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3 mt-2">
            {auditLogs.map((log) => (
              <div 
                key={log.id}
                className="flex gap-3 p-3 border border-table-border rounded bg-table-row"
              >
                <div className="flex-shrink-0 mt-1">
                  {getActionIcon(log.action)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getActionColor(log.action)}>
                      {log.action.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(log.changed_at)}
                    </span>
                  </div>
                  {renderChanges(log.changes, log.action)}
                  {log.notes && (
                    <div className="text-sm italic text-muted-foreground">
                      Note: {log.notes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
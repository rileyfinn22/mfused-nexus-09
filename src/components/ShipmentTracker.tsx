import { Ship, ShieldCheck, Truck, ExternalLink, MapPin, Calendar, Clock, Package, Paperclip, Upload, Trash2, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getTrackingUrl, getLegStatusColor, LEG_TYPE_LABELS, LEG_STATUS_OPTIONS } from "@/lib/trackingUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef } from "react";

export interface ShipmentLeg {
  id: string;
  order_id: string;
  company_id: string;
  leg_number: number;
  leg_type: string;
  label: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  origin: string | null;
  destination: string | null;
  shipped_date: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  status: string;
  notes: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_by: string | null;
  created_at: string;
}

interface ShipmentTrackerProps {
  legs: ShipmentLeg[];
  isVibeAdmin: boolean;
  onStatusChange?: (legId: string, newStatus: string) => Promise<void>;
  onActualArrivalChange?: (legId: string, date: string | null) => Promise<void>;
  onAddLeg?: () => void;
  onAttachmentUpload?: (legId: string, file: File) => Promise<void>;
  onDeleteLeg?: (legId: string) => Promise<void>;
  onNotesChange?: (legId: string, notes: string) => Promise<void>;
}

const getLegIcon = (legType: string) => {
  switch (legType) {
    case 'international':
      return <Ship className="h-5 w-5" />;
    case 'customs':
      return <ShieldCheck className="h-5 w-5" />;
    case 'domestic':
      return <Truck className="h-5 w-5" />;
    default:
      return <Package className="h-5 w-5" />;
  }
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null;
  const parts = dateStr.split('T')[0].split('-').map(Number);
  const localDate = new Date(parts[0], parts[1] - 1, parts[2]);
  return localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getDateInputValue = (dateStr: string | null) => {
  if (!dateStr) return '';
  return dateStr.split('T')[0];
};

export function ShipmentTracker({ legs, isVibeAdmin, onStatusChange, onActualArrivalChange, onAddLeg, onAttachmentUpload, onDeleteLeg, onNotesChange }: ShipmentTrackerProps) {
  const [updatingLeg, setUpdatingLeg] = useState<string | null>(null);
  const [editingNotesLeg, setEditingNotesLeg] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');
  const [deletingLeg, setDeletingLeg] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  if (legs.length === 0 && !isVibeAdmin) return null;

  const completedLegs = legs.filter(l => l.status === 'delivered' || l.status === 'cleared').length;
  const progressPercent = legs.length > 0 ? Math.round((completedLegs / legs.length) * 100) : 0;

  const activeLeg = legs.find(l => !['delivered', 'cleared'].includes(l.status) && l.status !== 'pending')
    || legs.find(l => l.status === 'pending');

  const handleStatusChange = async (legId: string, newStatus: string) => {
    if (!onStatusChange) return;
    setUpdatingLeg(legId);
    try {
      await onStatusChange(legId, newStatus);
    } finally {
      setUpdatingLeg(null);
    }
  };

  const handleArrivalChange = async (legId: string, date: string) => {
    if (!onActualArrivalChange) return;
    setUpdatingLeg(legId);
    try {
      await onActualArrivalChange(legId, date || null);
    } finally {
      setUpdatingLeg(null);
    }
  };

  const handleDeleteLeg = async (legId: string) => {
    if (!onDeleteLeg) return;
    setDeletingLeg(legId);
    try {
      await onDeleteLeg(legId);
    } finally {
      setDeletingLeg(null);
    }
  };

  const handleSaveNotes = async (legId: string) => {
    if (!onNotesChange) return;
    setUpdatingLeg(legId);
    try {
      await onNotesChange(legId, notesText);
      setEditingNotesLeg(null);
    } finally {
      setUpdatingLeg(null);
    }
  };

  const startEditingNotes = (leg: ShipmentLeg) => {
    setEditingNotesLeg(leg.id);
    setNotesText(leg.notes || '');
  };

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Shipment Tracking</h2>
            {legs.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {legs.length} leg{legs.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {isVibeAdmin && onAddLeg && (
            <Button size="sm" variant="outline" onClick={onAddLeg}>
              Add Leg
            </Button>
          )}
        </div>

        {legs.length > 0 && (
          <div className="mt-3 space-y-2">
            {activeLeg && (
              <p className="text-sm text-muted-foreground">
                Currently: <span className="font-medium text-foreground">
                  {LEG_TYPE_LABELS[activeLeg.leg_type] || activeLeg.leg_type} — {activeLeg.status.replace(/_/g, ' ')}
                </span>
              </p>
            )}
            <div className="flex items-center gap-3">
              <Progress value={progressPercent} className="h-2 flex-1" />
              <span className="text-xs font-medium text-muted-foreground w-10 text-right">{progressPercent}%</span>
            </div>
          </div>
        )}
      </div>

      {legs.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <Ship className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No shipping legs added yet</p>
          {isVibeAdmin && onAddLeg && (
            <Button size="sm" variant="outline" className="mt-3" onClick={onAddLeg}>
              Add First Leg
            </Button>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-0">
          {legs.map((leg, index) => {
            const isCompleted = leg.status === 'delivered' || leg.status === 'cleared';
            const isActive = leg.status === 'in_transit' || leg.status === 'customs_hold' || leg.status === 'out_for_delivery';
            const trackingUrl = leg.tracking_url || (leg.carrier && leg.tracking_number ? getTrackingUrl(leg.carrier, leg.tracking_number) : null);

            return (
              <div key={leg.id} className="relative">
                {index < legs.length - 1 && (
                  <div className={cn(
                    "absolute left-[19px] top-[44px] w-0.5 h-[calc(100%-20px)]",
                    isCompleted ? "bg-green-500" : isActive ? "bg-blue-500" : "bg-border"
                  )} />
                )}

                <div className="flex gap-3 pb-4">
                  <div className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 z-10",
                    isCompleted ? "bg-green-500/10 border-green-500 text-green-600" :
                    isActive ? "bg-blue-500/10 border-blue-500 text-blue-600" :
                    "bg-muted border-border text-muted-foreground"
                  )}>
                    {getLegIcon(leg.leg_type)}
                  </div>

                  <div className={cn(
                    "flex-1 border rounded-lg p-4 transition-all",
                    isActive ? "border-blue-500/50 bg-blue-50/5 shadow-sm" :
                    isCompleted ? "border-green-500/30 bg-green-50/5" :
                    "border-border bg-card"
                  )}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-foreground text-sm">
                            {leg.label || LEG_TYPE_LABELS[leg.leg_type] || `Leg ${leg.leg_number}`}
                          </h4>
                          <Badge variant="outline" className={cn("text-xs capitalize", getLegStatusColor(leg.status))}>
                            {leg.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>

                        {(leg.origin || leg.destination) && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{leg.origin || '—'}</span>
                            <span className="mx-1">→</span>
                            <span>{leg.destination || '—'}</span>
                          </div>
                        )}

                        {leg.carrier && (
                          <div className="flex items-center gap-2 mt-1.5 text-sm">
                            <span className="text-muted-foreground">Carrier:</span>
                            <span className="font-medium text-foreground">{leg.carrier}</span>
                            {trackingUrl && leg.tracking_number && (
                              <>
                                <span className="text-muted-foreground">•</span>
                                <a
                                  href={trackingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline font-mono text-xs"
                                >
                                  {leg.tracking_number}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                          {leg.shipped_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Shipped: {formatDate(leg.shipped_date)}
                            </span>
                          )}
                          {leg.estimated_arrival && !leg.actual_arrival && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              ETA: {formatDate(leg.estimated_arrival)}
                            </span>
                          )}
                          {leg.actual_arrival && (leg.status === 'delivered' || leg.status === 'cleared') && (
                            <span className="flex items-center gap-1 text-green-600">
                              <Calendar className="h-3 w-3" />
                              Arrived: {formatDate(leg.actual_arrival)}
                            </span>
                          )}
                        </div>

                        {/* Notes display */}
                        {leg.notes && editingNotesLeg !== leg.id && (
                          <div className="mt-3 rounded-md border border-border bg-muted/50 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <MessageSquare className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notes</span>
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{leg.notes}</p>
                          </div>
                        )}

                        {/* Notes editing */}
                        {isVibeAdmin && editingNotesLeg === leg.id && (
                          <div className="mt-2 space-y-2">
                            <Textarea
                              value={notesText}
                              onChange={(e) => setNotesText(e.target.value)}
                              placeholder="Add notes..."
                              className="text-xs min-h-[60px]"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveNotes(leg.id)} disabled={updatingLeg === leg.id}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNotesLeg(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {leg.attachment_url && leg.attachment_name && (
                          <div className="mt-2">
                            <a
                              href={leg.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline bg-primary/10 rounded-md px-2 py-1"
                            >
                              <Paperclip className="h-3 w-3" />
                              {leg.attachment_name}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Delete button */}
                      {isVibeAdmin && onDeleteLeg && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteLeg(leg.id)}
                          disabled={deletingLeg === leg.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* Admin inline controls */}
                    {isVibeAdmin && onStatusChange && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                        <Select
                          value={leg.status}
                          onValueChange={(val) => handleStatusChange(leg.id, val)}
                          disabled={updatingLeg === leg.id}
                        >
                          <SelectTrigger className="w-40 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEG_STATUS_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Input
                          type="date"
                          className="w-36 h-8 text-xs"
                          value={getDateInputValue(leg.actual_arrival)}
                          onChange={(e) => handleArrivalChange(leg.id, e.target.value)}
                          disabled={updatingLeg === leg.id}
                        />

                        {onNotesChange && editingNotesLeg !== leg.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => startEditingNotes(leg)}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />
                            {leg.notes ? 'Edit Notes' : 'Add Notes'}
                          </Button>
                        )}

                        {onAttachmentUpload && (
                          <>
                            <input
                              type="file"
                              className="hidden"
                              accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg"
                              ref={(el) => { fileInputRefs.current[leg.id] = el; }}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUpdatingLeg(leg.id);
                                try {
                                  await onAttachmentUpload(leg.id, file);
                                } finally {
                                  setUpdatingLeg(null);
                                  e.target.value = '';
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={updatingLeg === leg.id}
                              onClick={() => fileInputRefs.current[leg.id]?.click()}
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              {leg.attachment_url ? 'Replace' : 'Attach'}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

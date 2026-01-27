import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp, Upload, FileText, Download, Image as ImageIcon, MessageSquare, Loader2, Truck, Package, Trash2, StickyNote, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface StageUpdate {
  id: string;
  update_type: string;
  note_text: string | null;
  image_url: string | null;
  file_url: string | null;
  file_name: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

interface ProductionStage {
  id: string;
  stage_name: string;
  status: string;
  vendor_id: string | null;
  sequence_order: number;
  internal_notes: string | null;
  vendors: {
    name: string;
  } | null;
  production_stage_updates: StageUpdate[];
}

interface StageDefinition {
  value: string;
  label: string;
  order: number;
  weight?: number; // Percentage weight for progress calculation (default: equal distribution)
  adminOnly?: boolean; // Only visible/counted for Vibe Admins
}

interface SubstageDefinition {
  key: string;
  label: string;
  percent: number;
}

interface ProductionStageTimelineProps {
  stages: ProductionStage[];
  stageDefinitions: StageDefinition[];
  onUpdateClick: (stage: ProductionStage, stageDef: StageDefinition) => void;
  onQuickStatusChange?: (stageId: string, newStatus: string) => Promise<void>;
  onSubstageComplete?: (stageId: string, substage: SubstageDefinition) => Promise<void>;
  onDeleteUpdate?: (updateId: string) => Promise<void>;
  onInternalNotesChange?: (stageId: string, notes: string) => Promise<void>;
  onVendorAssign?: (stageId: string, vendorId: string) => void;
  vendors?: { id: string; name: string }[];
  isVibeAdmin: boolean;
  isVendor: boolean;
  isCustomer: boolean;
}

const MATERIAL_SUBSTAGES: SubstageDefinition[] = [
  { key: 'material_ordered', label: 'Material Ordered', percent: 10 },
  { key: 'material_secured', label: 'Material Secured', percent: 10 },
];

const PRINT_SUBSTAGES: SubstageDefinition[] = [
  { key: 'print_film', label: 'Print Film', percent: 25 },
  { key: 'lamination_curing', label: 'Lamination + Curing', percent: 10 },
  { key: 'converting', label: 'Converting', percent: 15 },
];

const QC_SUBSTAGES: SubstageDefinition[] = [
  { key: 'packing_sorting', label: 'Packing/Sorting', percent: 8 },
  { key: 'qc_completed', label: 'QC Completed', percent: 7 },
];

export function ProductionStageTimeline({
  stages,
  stageDefinitions,
  onUpdateClick,
  onQuickStatusChange,
  onSubstageComplete,
  onDeleteUpdate,
  onInternalNotesChange,
  onVendorAssign,
  vendors = [],
  isVibeAdmin,
  isVendor,
  isCustomer,
}: ProductionStageTimelineProps) {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [updatingStages, setUpdatingStages] = useState<Set<string>>(new Set());
  const [updatingSubstages, setUpdatingSubstages] = useState<Set<string>>(new Set());
  const [deletingUpdates, setDeletingUpdates] = useState<Set<string>>(new Set());
  const [internalNotesEdits, setInternalNotesEdits] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set());

  const handleSaveInternalNotes = async (stageId: string) => {
    if (!onInternalNotesChange) return;
    
    setSavingNotes(prev => new Set(prev).add(stageId));
    try {
      await onInternalNotesChange(stageId, internalNotesEdits[stageId] || '');
      // Clear the edit state after successful save
      setInternalNotesEdits(prev => {
        const next = { ...prev };
        delete next[stageId];
        return next;
      });
    } finally {
      setSavingNotes(prev => {
        const next = new Set(prev);
        next.delete(stageId);
        return next;
      });
    }
  };

  const getInternalNotesValue = (stage: ProductionStage) => {
    if (stage.id in internalNotesEdits) {
      return internalNotesEdits[stage.id];
    }
    return stage.internal_notes || '';
  };

  const hasUnsavedNotes = (stageId: string, currentNotes: string | null) => {
    if (!(stageId in internalNotesEdits)) return false;
    return internalNotesEdits[stageId] !== (currentNotes || '');
  };

  const handleDeleteUpdate = async (updateId: string) => {
    if (!onDeleteUpdate) return;
    
    setDeletingUpdates(prev => new Set(prev).add(updateId));
    try {
      await onDeleteUpdate(updateId);
    } finally {
      setDeletingUpdates(prev => {
        const next = new Set(prev);
        next.delete(updateId);
        return next;
      });
    }
  };

  const handleQuickStatus = async (stageId: string, newStatus: string) => {
    if (!onQuickStatusChange) return;
    
    setUpdatingStages(prev => new Set(prev).add(stageId));
    try {
      await onQuickStatusChange(stageId, newStatus);
    } finally {
      setUpdatingStages(prev => {
        const next = new Set(prev);
        next.delete(stageId);
        return next;
      });
    }
  };

  const handleSubstageClick = async (stageId: string, substage: SubstageDefinition) => {
    if (!onSubstageComplete) return;
    
    const substageKey = `${stageId}-${substage.key}`;
    setUpdatingSubstages(prev => new Set(prev).add(substageKey));
    try {
      await onSubstageComplete(stageId, substage);
    } finally {
      setUpdatingSubstages(prev => {
        const next = new Set(prev);
        next.delete(substageKey);
        return next;
      });
    }
  };

  // Check if a sub-stage is completed by looking for the auto-note marker
  const isSubstageComplete = (stage: ProductionStage, substageKey: string) => {
    const noteMarker = `<!--${substageKey.toUpperCase()}-->`;
    return stage.production_stage_updates.some(u => u.note_text?.includes(noteMarker));
  };

  const toggleExpand = (stageId: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  const getStageStatus = (stageName: string) => {
    const stage = stages.find(s => s.stage_name === stageName);
    return stage?.status || 'pending';
  };

  const getStageData = (stageName: string) => {
    return stages.find(s => s.stage_name === stageName);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-blue-500';
      default:
        return 'bg-muted-foreground/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground/50" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { variant: "outline" as const, className: "border-muted-foreground/30 text-muted-foreground" },
      in_progress: { variant: "default" as const, className: "bg-blue-500 hover:bg-blue-600" },
      completed: { variant: "default" as const, className: "bg-green-500 hover:bg-green-600" },
    };
    const { variant, className } = config[status as keyof typeof config] || config.pending;
    return (
      <Badge variant={variant} className={cn("capitalize text-xs", className)}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  // Filter stages based on admin-only visibility
  const visibleStageDefinitions = stageDefinitions.filter(def => 
    !def.adminOnly || isVibeAdmin
  );

  // Calculate weighted progress based on stage weights
  const calculateWeightedProgress = () => {
    let completedWeight = 0;
    let inProgressWeight = 0;
    
    // Only count visible stages for progress
    visibleStageDefinitions.forEach(def => {
      const status = getStageStatus(def.value);
      const weight = def.weight ?? (100 / visibleStageDefinitions.length);
      
      if (status === 'completed') {
        completedWeight += weight;
      } else if (status === 'in_progress') {
        // In-progress stages count as 50% of their weight
        inProgressWeight += weight * 0.5;
      }
    });
    
    return Math.round(completedWeight + inProgressWeight);
  };

  const progressPercent = calculateWeightedProgress();

  const getProgressGradient = (percent: number) => {
    if (percent >= 100) return "from-green-400 to-green-600";
    if (percent >= 60) return "from-blue-400 to-blue-600";
    if (percent >= 30) return "from-amber-400 to-amber-600";
    return "from-gray-300 to-gray-500";
  };

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Production Progress</h3>
          <span className="text-2xl font-bold text-primary">{progressPercent}%</span>
        </div>
        
        {/* Progress Bar - Segmented for vibe_admin/vendor, Smooth continuous for everyone else */}
        {(isVibeAdmin || isVendor) ? (
          <>
            {/* Segmented progress bar for admin/vendor */}
            <div className="flex items-center gap-0.5 mb-2">
              {visibleStageDefinitions.map((def) => {
                const status = getStageStatus(def.value);
                const weight = def.weight ?? (100 / visibleStageDefinitions.length);
                return (
                  <div 
                    key={def.value} 
                    className={cn(
                      "h-3 rounded-sm transition-colors relative group",
                      status === 'completed' ? 'bg-green-500' :
                      status === 'in_progress' ? 'bg-blue-500 animate-pulse' :
                      'bg-muted'
                    )}
                    style={{ width: `${weight}%` }}
                    title={`${def.label}: ${weight}%`}
                  />
                );
              })}
            </div>
            
            {/* Stage weight labels for admin/vendor */}
            <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              {visibleStageDefinitions.map((def) => {
                const status = getStageStatus(def.value);
                const weight = def.weight ?? (100 / visibleStageDefinitions.length);
                return (
                  <div 
                    key={def.value} 
                    className={cn(
                      "truncate text-center",
                      status === 'completed' && 'text-green-600 font-medium',
                      status === 'in_progress' && 'text-blue-600 font-medium'
                    )}
                    style={{ width: `${weight}%` }}
                  >
                    {weight}%
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>0%</span>
              <span>100%</span>
            </div>
          </>
        ) : (
          <>
            {/* Simple continuous progress bar for customers/company users */}
            <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden mb-2">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 bg-gradient-to-r",
                  getProgressGradient(progressPercent)
                )}
                style={{ width: `${Math.min(progressPercent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0%</span>
              <span>100%</span>
            </div>
          </>
        )}
      </div>

      {/* Stage Cards */}
      <div className="relative">
        {/* Vertical Timeline Line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
        
        <div className="space-y-3">
          {visibleStageDefinitions.map((stageDef, index) => {
            const stage = getStageData(stageDef.value);
            if (!stage) return null;
            
            const isExpanded = expandedStages.has(stage.id);
            const hasUpdates = stage.production_stage_updates.length > 0;
            const isActive = stage.status === 'in_progress';
            const isComplete = stage.status === 'completed';
            const isUpdating = updatingStages.has(stage.id);
            
            return (
              <div key={stage.id} className="relative pl-12">
                {/* Timeline Node */}
                <div
                  className={cn(
                    "absolute left-4 top-5 w-5 h-5 rounded-full border-2 flex items-center justify-center z-10 transition-all",
                    isComplete ? "bg-green-500 border-green-500" :
                    isActive ? "bg-blue-500 border-blue-500 ring-4 ring-blue-500/20" :
                    "bg-background border-muted-foreground/30"
                  )}
                >
                  {isComplete && <CheckCircle2 className="h-3 w-3 text-white" />}
                  {isActive && <div className="h-2 w-2 bg-white rounded-full animate-pulse" />}
                </div>
                
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(stage.id)}>
                  <div
                    className={cn(
                      "border rounded-xl transition-all",
                      isActive ? "border-blue-500/50 bg-blue-50/5 shadow-sm shadow-blue-500/10" :
                      isComplete ? "border-green-500/30 bg-green-50/5" :
                      "border-border bg-card"
                    )}
                  >
                    {/* Stage Header */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-foreground">{stageDef.label}</h4>
                              {getStatusBadge(stage.status)}
                            </div>
                            {stage.vendors?.name && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Assigned to: <span className="font-medium text-foreground">{stage.vendors.name}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {hasUpdates && (
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="px-2">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                                <span className="ml-1 text-xs text-muted-foreground">
                                  {stage.production_stage_updates.length}
                                </span>
                              </Button>
                            </CollapsibleTrigger>
                          )}
                        </div>
                      </div>
                      
                      {/* Sub-stages for Material Order and Securing */}
                      {(isVibeAdmin || isVendor) && stageDef.value === 'production_proceeding_part_1' && onSubstageComplete && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
                          <Label className="text-xs text-muted-foreground mb-2 block">Material Sub-stages</Label>
                          <div className="flex gap-2 flex-wrap">
                            {MATERIAL_SUBSTAGES.map((substage) => {
                              const isComplete = isSubstageComplete(stage, substage.key);
                              const substageKey = `${stage.id}-${substage.key}`;
                              const isSubstageUpdating = updatingSubstages.has(substageKey);
                              return (
                                <Button
                                  key={substage.key}
                                  size="sm"
                                  variant={isComplete ? 'default' : 'outline'}
                                  className={cn(
                                    "h-9",
                                    isComplete && "bg-green-500 hover:bg-green-500/90 cursor-default"
                                  )}
                                  disabled={isSubstageUpdating || isComplete}
                                  onClick={() => handleSubstageClick(stage.id, substage)}
                                >
                                  {isComplete ? (
                                    <CheckCircle2 className="h-3 w-3 mr-1.5" />
                                  ) : isSubstageUpdating ? (
                                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                  ) : (
                                    <Circle className="h-3 w-3 mr-1.5" />
                                  )}
                                  {substage.label}
                                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                                    {substage.percent}%
                                  </Badge>
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Sub-stages for Print and Converting */}
                      {(isVibeAdmin || isVendor) && stageDef.value === 'production_proceeding_part_2' && onSubstageComplete && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
                          <Label className="text-xs text-muted-foreground mb-2 block">Production Sub-stages</Label>
                          <div className="flex gap-2 flex-wrap">
                            {PRINT_SUBSTAGES.map((substage) => {
                              const isComplete = isSubstageComplete(stage, substage.key);
                              const substageKey = `${stage.id}-${substage.key}`;
                              const isSubstageUpdating = updatingSubstages.has(substageKey);
                              return (
                                <Button
                                  key={substage.key}
                                  size="sm"
                                  variant={isComplete ? 'default' : 'outline'}
                                  className={cn(
                                    "h-9",
                                    isComplete && "bg-green-500 hover:bg-green-500/90 cursor-default"
                                  )}
                                  disabled={isSubstageUpdating || isComplete}
                                  onClick={() => handleSubstageClick(stage.id, substage)}
                                >
                                  {isComplete ? (
                                    <CheckCircle2 className="h-3 w-3 mr-1.5" />
                                  ) : isSubstageUpdating ? (
                                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                  ) : (
                                    <Circle className="h-3 w-3 mr-1.5" />
                                  )}
                                  {substage.label}
                                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                                    {substage.percent}%
                                  </Badge>
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Sub-stages for Packing and QC */}
                      {(isVibeAdmin || isVendor) && stageDef.value === 'complete_qc' && onSubstageComplete && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
                          <Label className="text-xs text-muted-foreground mb-2 block">QC Sub-stages</Label>
                          <div className="flex gap-2 flex-wrap">
                            {QC_SUBSTAGES.map((substage) => {
                              const isComplete = isSubstageComplete(stage, substage.key);
                              const substageKey = `${stage.id}-${substage.key}`;
                              const isSubstageUpdating = updatingSubstages.has(substageKey);
                              return (
                                <Button
                                  key={substage.key}
                                  size="sm"
                                  variant={isComplete ? 'default' : 'outline'}
                                  className={cn(
                                    "h-9",
                                    isComplete && "bg-green-500 hover:bg-green-500/90 cursor-default"
                                  )}
                                  disabled={isSubstageUpdating || isComplete}
                                  onClick={() => handleSubstageClick(stage.id, substage)}
                                >
                                  {isComplete ? (
                                    <CheckCircle2 className="h-3 w-3 mr-1.5" />
                                  ) : isSubstageUpdating ? (
                                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                  ) : (
                                    <Circle className="h-3 w-3 mr-1.5" />
                                  )}
                                  {substage.label}
                                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                                    {substage.percent}%
                                  </Badge>
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Quick Status Buttons - For Admin/Vendor */}
                      {(isVibeAdmin || isVendor) && onQuickStatusChange && (
                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/50">
                          {isUpdating ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">Updating...</span>
                            </div>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant={stage.status === 'pending' ? 'default' : 'outline'}
                                className={cn(
                                  "h-8",
                                  stage.status === 'pending' && "bg-muted-foreground hover:bg-muted-foreground/90"
                                )}
                                onClick={() => handleQuickStatus(stage.id, 'pending')}
                                disabled={stage.status === 'pending'}
                              >
                                <Circle className="h-3 w-3 mr-1.5" />
                                Pending
                              </Button>
                              <Button
                                size="sm"
                                variant={stage.status === 'in_progress' ? 'default' : 'outline'}
                                className={cn(
                                  "h-8",
                                  stage.status === 'in_progress' && "bg-blue-500 hover:bg-blue-600"
                                )}
                                onClick={() => handleQuickStatus(stage.id, 'in_progress')}
                                disabled={stage.status === 'in_progress'}
                              >
                                <Truck className="h-3 w-3 mr-1.5" />
                                In Progress
                              </Button>
                              <Button
                                size="sm"
                                variant={stage.status === 'completed' ? 'default' : 'outline'}
                                className={cn(
                                  "h-8",
                                  stage.status === 'completed' && "bg-green-500 hover:bg-green-600"
                                )}
                                onClick={() => handleQuickStatus(stage.id, 'completed')}
                                disabled={stage.status === 'completed'}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1.5" />
                                Complete
                              </Button>
                              <div className="flex-1" />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onUpdateClick(stage, stageDef)}
                              >
                                <MessageSquare className="h-3 w-3 mr-1.5" />
                                Add Note
                              </Button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Internal Notes Section - Vibe Admin Only */}
                      {isVibeAdmin && onInternalNotesChange && (
                        <div className="mt-4 p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
                          <div className="flex items-center gap-2 mb-2">
                            <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <Label className="text-xs font-medium text-amber-700 dark:text-amber-300">Internal Notes</Label>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
                              Admin Only
                            </Badge>
                          </div>
                          <Textarea
                            placeholder="Add internal notes about this stage's progress..."
                            value={getInternalNotesValue(stage)}
                            onChange={(e) => setInternalNotesEdits(prev => ({ ...prev, [stage.id]: e.target.value }))}
                            className="min-h-[60px] text-sm bg-background/80 border-amber-200/50 dark:border-amber-800/30 focus:border-amber-400 dark:focus:border-amber-600"
                          />
                          {hasUnsavedNotes(stage.id, stage.internal_notes) && (
                            <div className="flex justify-end mt-2">
                              <Button
                                size="sm"
                                onClick={() => handleSaveInternalNotes(stage.id)}
                                disabled={savingNotes.has(stage.id)}
                                className="h-7 bg-amber-500 hover:bg-amber-600 text-white"
                              >
                                {savingNotes.has(stage.id) ? (
                                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3 mr-1.5" />
                                )}
                                Save Notes
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Customer view - just add note button */}
                      {isCustomer && !isVibeAdmin && !isVendor && (
                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onUpdateClick(stage, stageDef)}
                          >
                            <MessageSquare className="h-3 w-3 mr-1.5" />
                            Add Note
                          </Button>
                        </div>
                      )}
                      
                      {/* Quick Stats */}
                      {hasUpdates && !isExpanded && (
                        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                          {stage.production_stage_updates.some(u => u.note_text) && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {stage.production_stage_updates.filter(u => u.note_text).length} notes
                            </span>
                          )}
                          {stage.production_stage_updates.some(u => u.image_url) && (
                            <span className="flex items-center gap-1">
                              <ImageIcon className="h-3 w-3" />
                              {stage.production_stage_updates.filter(u => u.image_url).length} images
                            </span>
                          )}
                          {stage.production_stage_updates.some(u => u.file_url) && (
                            <span className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {stage.production_stage_updates.filter(u => u.file_url).length} files
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Expandable Updates Section */}
                    <CollapsibleContent>
                      <div className="border-t border-border px-4 py-4 bg-muted/20">
                        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Activity History
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {stage.production_stage_updates
                            .filter((update) => {
                              // Show all non-status-change updates
                              if (update.update_type !== 'status_change') return true;
                              // For status_change, only show if it has actual content (note/image/file)
                              return update.note_text || update.image_url || update.file_url;
                            })
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((update) => {
                              const cleanNoteText = update.note_text?.replace(/<!--[A-Z_]+-->/g, '');
                              const hasNote = cleanNoteText && cleanNoteText.trim().length > 0;
                              const hasImage = !!update.image_url;
                              const hasFile = !!update.file_url;
                              const updateTypeLabel = update.update_type === 'status_change' && hasNote ? 'note' : update.update_type.replace('_', ' ');
                              
                              // Determine primary type for styling
                              const primaryType = hasImage ? 'image' : hasFile ? 'document' : 'note';
                              const isStageComplete = stage.status === 'completed';

                              // Note bubbles should turn green when the stage is complete OR when the note represents a
                              // sub-stage completion auto-note (e.g., <!--PRINT_FILM-->Print Film Complete).
                              const hasAutoMarker = !!update.note_text?.match(/<!--[A-Z0-9_]+-->/);
                              const isCompletionNote = !!cleanNoteText?.match(/\bcomplete\b/i);
                              const isNoteComplete = isStageComplete || (hasAutoMarker && isCompletionNote);
                              
                              return (
                                <div
                                  key={update.id}
                                  className={cn(
                                    "inline-flex items-center gap-2 px-3 py-2 rounded-full border transition-all",
                                    "hover:shadow-sm cursor-default",
                                    primaryType === 'note' && isNoteComplete && "bg-success/15 border-success/30",
                                    primaryType === 'note' && !isNoteComplete && "bg-muted/60 border-border",
                                    primaryType === 'image' && "bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:border-purple-800",
                                    primaryType === 'document' && "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800"
                                  )}
                                  title={`${new Date(update.created_at).toLocaleString()}${hasNote ? `: ${cleanNoteText}` : ''}`}
                                >
                                  {/* Icon */}
                                  <div className={cn(
                                    "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                                    primaryType === 'note' && isNoteComplete && "bg-success/20",
                                    primaryType === 'note' && !isNoteComplete && "bg-background/60",
                                    primaryType === 'image' && "bg-purple-100 dark:bg-purple-900/50",
                                    primaryType === 'document' && "bg-amber-100 dark:bg-amber-900/50"
                                  )}>
                                    {primaryType === 'note' && (
                                      <MessageSquare
                                        className={cn(
                                          "h-3 w-3",
                                          isNoteComplete ? "text-success" : "text-muted-foreground"
                                        )}
                                      />
                                    )}
                                    {primaryType === 'image' && <ImageIcon className="h-3 w-3 text-purple-600 dark:text-purple-400" />}
                                    {primaryType === 'document' && <FileText className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
                                  </div>
                                  
                                  {/* Label */}
                                  <span className={cn(
                                    "text-xs font-medium max-w-[120px] truncate",
                                    primaryType === 'note' && isNoteComplete && "text-success",
                                    primaryType === 'note' && !isNoteComplete && "text-foreground",
                                    primaryType === 'image' && "text-purple-700 dark:text-purple-300",
                                    primaryType === 'document' && "text-amber-700 dark:text-amber-300"
                                  )}>
                                    {hasNote ? cleanNoteText : hasFile ? (update.file_name || 'Document') : 'Image'}
                                  </span>
                                  {/* Action buttons for image/file */}
                                  {(hasImage || hasFile) && (
                                    <a
                                      href={hasImage ? update.image_url! : update.file_url!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                                        "hover:bg-background/80",
                                        primaryType === 'image' && "text-purple-600 dark:text-purple-400",
                                        primaryType === 'document' && "text-amber-600 dark:text-amber-400"
                                      )}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Download className="h-3 w-3" />
                                    </a>
                                  )}
                                  
                                  {/* Delete button for Vibe Admins */}
                                  {isVibeAdmin && onDeleteUpdate && (
                                    <button
                                      type="button"
                                      disabled={deletingUpdates.has(update.id)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteUpdate(update.id);
                                      }}
                                      className={cn(
                                        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                                        "hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                                      )}
                                      title="Delete this update"
                                    >
                                      {deletingUpdates.has(update.id) ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3 w-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          {stage.production_stage_updates.filter(u => u.update_type !== 'status_change' || u.note_text || u.image_url || u.file_url).length === 0 && (
                            <div className="flex items-center gap-2 text-muted-foreground py-2">
                              <Circle className="h-4 w-4 opacity-40" />
                              <span className="text-sm">No activity yet</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

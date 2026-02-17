import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp, Upload, FileText, Download, Image as ImageIcon, MessageSquare, Loader2, Truck, Package, Trash2, StickyNote, Save, Plus, X, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
  onCustomSubstageAdd?: (stageId: string, label: string) => Promise<void>;
  onDeleteUpdate?: (updateId: string) => Promise<void>;
  onInternalNotesChange?: (stageId: string, notes: string) => Promise<void>;
  onVendorAssign?: (stageId: string, vendorId: string) => void;
  onProgressSliderChange?: (newProgress: number) => Promise<void>;
  savedProgress?: number;
  vendors?: { id: string; name: string }[];
  isVibeAdmin: boolean;
  isVendor: boolean;
  isCustomer: boolean;
}

const MATERIAL_SUBSTAGES: SubstageDefinition[] = [
  { key: 'material_ordered', label: 'Material Ordered', percent: 0 },
  { key: 'material_secured', label: 'Material Secured', percent: 0 },
];

const PRINT_SUBSTAGES: SubstageDefinition[] = [
  { key: 'print_film', label: 'Print Film', percent: 0 },
  { key: 'lamination_curing', label: 'Lamination + Curing', percent: 0 },
  { key: 'converting', label: 'Converting', percent: 0 },
];

const QC_SUBSTAGES: SubstageDefinition[] = [
  { key: 'packing_sorting', label: 'Packing/Sorting', percent: 0 },
  { key: 'qc_completed', label: 'QC Completed', percent: 0 },
];

export function ProductionStageTimeline({
  stages,
  stageDefinitions,
  onUpdateClick,
  onQuickStatusChange,
  onSubstageComplete,
  onCustomSubstageAdd,
  onDeleteUpdate,
  onInternalNotesChange,
  onVendorAssign,
  onProgressSliderChange,
  savedProgress,
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
  const [customSubstageInputs, setCustomSubstageInputs] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({});
  const [addingCustomSubstage, setAddingCustomSubstage] = useState<Set<string>>(new Set());
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [updatingProgress, setUpdatingProgress] = useState(false);

  const handleAddCustomSubstage = async (stageId: string) => {
    if (!onCustomSubstageAdd) return;
    const label = customSubstageInputs[stageId]?.trim();
    if (!label) return;

    setAddingCustomSubstage(prev => new Set(prev).add(stageId));
    try {
      await onCustomSubstageAdd(stageId, label);
      setCustomSubstageInputs(prev => ({ ...prev, [stageId]: '' }));
      setShowCustomInput(prev => ({ ...prev, [stageId]: false }));
    } finally {
      setAddingCustomSubstage(prev => {
        const next = new Set(prev);
        next.delete(stageId);
        return next;
      });
    }
  };

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
  // For admin slider: use savedProgress from DB if available, otherwise fall back to calculated
  const adminSliderPercent = savedProgress ?? progressPercent;

  const getProgressGradient = (percent: number) => {
    if (percent >= 100) return "from-green-400 to-green-600";
    if (percent >= 60) return "from-blue-400 to-blue-600";
    if (percent >= 30) return "from-amber-400 to-amber-600";
    return "from-gray-300 to-gray-500";
  };

  // Handle slider change - updates stages based on target percentage
  const handleSliderCommit = async (value: number[]) => {
    if (!onProgressSliderChange) return;
    
    const targetPercent = value[0];
    setUpdatingProgress(true);
    try {
      await onProgressSliderChange(targetPercent);
    } finally {
      setUpdatingProgress(false);
      setIsSliding(false);
      setSliderValue(null);
    }
  };

  const displayPercent = isSliding && sliderValue !== null ? sliderValue : adminSliderPercent;

  const renderStageCard = (stageDef: StageDefinition) => {
    const stage = getStageData(stageDef.value);
    if (!stage) return null;
    
    const isExpanded = expandedStages.has(stage.id);
    const hasUpdates = stage.production_stage_updates.length > 0;
    const isActive = stage.status === 'in_progress';
    const isComplete = stage.status === 'completed';
    const isUpdating = updatingStages.has(stage.id);
    
    const customSubstages = stage.production_stage_updates.filter(u => u.note_text?.includes('<!--CUSTOM_SUBSTAGE:'));
    const recentAttachments = stage.production_stage_updates
      .filter(u => u.update_type === 'image' || u.update_type === 'file')
      .slice(-5);

    return (
      <div key={stage.id} className="relative pl-12">
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
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-foreground">{stageDef.label}</h4>
                      {getStatusBadge(stage.status)}
                      {isVibeAdmin && stageDef.adminOnly && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 bg-amber-50/30 dark:bg-amber-500/5">
                          Internal
                        </Badge>
                      )}
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
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <span className="ml-1 text-xs text-muted-foreground">{stage.production_stage_updates.length}</span>
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>
              </div>
              
              {/* Sub-stages for Material Order */}
              {(isVibeAdmin || isVendor) && stageDef.value === 'materials_ordered' && onSubstageComplete && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
                  <Label className="text-xs text-muted-foreground mb-2 block">Material Sub-stages</Label>
                  <div className="flex gap-2 flex-wrap items-center">
                    {MATERIAL_SUBSTAGES.map((substage) => {
                      const completed = isSubstageComplete(stage, substage.key);
                      const substageKey = `${stage.id}-${substage.key}`;
                      const updating = updatingSubstages.has(substageKey);
                      return (
                        <Button key={substage.key} size="sm" variant={completed ? 'default' : 'outline'} className={cn("h-9", completed && "bg-success hover:bg-success/90 cursor-default")} disabled={updating || completed} onClick={() => handleSubstageClick(stage.id, substage)}>
                          {completed ? <CheckCircle2 className="h-3 w-3 mr-1.5" /> : updating ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Circle className="h-3 w-3 mr-1.5" />}
                          {substage.label}
                        </Button>
                      );
                    })}
                    {showCustomInput[`material_${stage.id}`] ? (
                      <div className="flex items-center gap-1">
                        <Input placeholder="Custom note..." value={customSubstageInputs[`material_${stage.id}`] || ''} onChange={(e) => setCustomSubstageInputs(prev => ({ ...prev, [`material_${stage.id}`]: e.target.value }))} className="h-9 w-32 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomSubstage(stage.id); }} />
                        <Button size="sm" className="h-9" disabled={addingCustomSubstage.has(stage.id)} onClick={() => handleAddCustomSubstage(stage.id)}>{addingCustomSubstage.has(stage.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}</Button>
                        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => setShowCustomInput(prev => ({ ...prev, [`material_${stage.id}`]: false }))}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setShowCustomInput(prev => ({ ...prev, [`material_${stage.id}`]: true }))}><Plus className="h-3 w-3 mr-1" /> Custom</Button>
                    )}
                    {customSubstages.map((update) => {
                      const label = update.note_text?.match(/<!--CUSTOM_SUBSTAGE:(.*?)-->/)?.[1] || 'Custom';
                      return <Badge key={update.id} variant="default" className="bg-success hover:bg-success/90 gap-1"><CheckCircle2 className="h-3 w-3" />{label}</Badge>;
                    })}
                  </div>
                </div>
              )}

              {/* Sub-stages for Pre-Press */}
              {(isVibeAdmin || isVendor) && stageDef.value === 'pre_press' && onSubstageComplete && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
                  <Label className="text-xs text-muted-foreground mb-2 block">Print Sub-stages</Label>
                  <div className="flex gap-2 flex-wrap items-center">
                    {PRINT_SUBSTAGES.map((substage) => {
                      const completed = isSubstageComplete(stage, substage.key);
                      const substageKey = `${stage.id}-${substage.key}`;
                      const updating = updatingSubstages.has(substageKey);
                      return (
                        <Button key={substage.key} size="sm" variant={completed ? 'default' : 'outline'} className={cn("h-9", completed && "bg-success hover:bg-success/90 cursor-default")} disabled={updating || completed} onClick={() => handleSubstageClick(stage.id, substage)}>
                          {completed ? <CheckCircle2 className="h-3 w-3 mr-1.5" /> : updating ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Circle className="h-3 w-3 mr-1.5" />}
                          {substage.label}
                        </Button>
                      );
                    })}
                    {showCustomInput[`print_${stage.id}`] ? (
                      <div className="flex items-center gap-1">
                        <Input placeholder="Custom note..." value={customSubstageInputs[`print_${stage.id}`] || ''} onChange={(e) => setCustomSubstageInputs(prev => ({ ...prev, [`print_${stage.id}`]: e.target.value }))} className="h-9 w-32 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomSubstage(stage.id); }} />
                        <Button size="sm" className="h-9" disabled={addingCustomSubstage.has(stage.id)} onClick={() => handleAddCustomSubstage(stage.id)}>{addingCustomSubstage.has(stage.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}</Button>
                        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => setShowCustomInput(prev => ({ ...prev, [`print_${stage.id}`]: false }))}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setShowCustomInput(prev => ({ ...prev, [`print_${stage.id}`]: true }))}><Plus className="h-3 w-3 mr-1" /> Custom</Button>
                    )}
                    {customSubstages.map((update) => {
                      const label = update.note_text?.match(/<!--CUSTOM_SUBSTAGE:(.*?)-->/)?.[1] || 'Custom';
                      return <Badge key={update.id} variant="default" className="bg-success hover:bg-success/90 gap-1"><CheckCircle2 className="h-3 w-3" />{label}</Badge>;
                    })}
                  </div>
                </div>
              )}

              {/* Sub-stages for Production Complete (QC) */}
              {(isVibeAdmin || isVendor) && stageDef.value === 'production_complete' && onSubstageComplete && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
                  <Label className="text-xs text-muted-foreground mb-2 block">QC Sub-stages</Label>
                  <div className="flex gap-2 flex-wrap items-center">
                    {QC_SUBSTAGES.map((substage) => {
                      const completed = isSubstageComplete(stage, substage.key);
                      const substageKey = `${stage.id}-${substage.key}`;
                      const updating = updatingSubstages.has(substageKey);
                      return (
                        <Button key={substage.key} size="sm" variant={completed ? 'default' : 'outline'} className={cn("h-9", completed && "bg-success hover:bg-success/90 cursor-default")} disabled={updating || completed} onClick={() => handleSubstageClick(stage.id, substage)}>
                          {completed ? <CheckCircle2 className="h-3 w-3 mr-1.5" /> : updating ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Circle className="h-3 w-3 mr-1.5" />}
                          {substage.label}
                        </Button>
                      );
                    })}
                    {showCustomInput[`qc_${stage.id}`] ? (
                      <div className="flex items-center gap-1">
                        <Input placeholder="Custom note..." value={customSubstageInputs[`qc_${stage.id}`] || ''} onChange={(e) => setCustomSubstageInputs(prev => ({ ...prev, [`qc_${stage.id}`]: e.target.value }))} className="h-9 w-32 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomSubstage(stage.id); }} />
                        <Button size="sm" className="h-9" disabled={addingCustomSubstage.has(stage.id)} onClick={() => handleAddCustomSubstage(stage.id)}>{addingCustomSubstage.has(stage.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}</Button>
                        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => setShowCustomInput(prev => ({ ...prev, [`qc_${stage.id}`]: false }))}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setShowCustomInput(prev => ({ ...prev, [`qc_${stage.id}`]: true }))}><Plus className="h-3 w-3 mr-1" /> Custom</Button>
                    )}
                    {customSubstages.map((update) => {
                      const label = update.note_text?.match(/<!--CUSTOM_SUBSTAGE:(.*?)-->/)?.[1] || 'Custom';
                      return <Badge key={update.id} variant="default" className="bg-success hover:bg-success/90 gap-1"><CheckCircle2 className="h-3 w-3" />{label}</Badge>;
                    })}
                  </div>
                </div>
              )}

              {/* Recent Attachments */}
              {recentAttachments.length > 0 && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Recent Attachments</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {recentAttachments.map((attachment) => (
                      <a key={attachment.id} href={attachment.image_url || attachment.file_url || '#'} target="_blank" rel="noopener noreferrer"
                        className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors",
                          attachment.update_type === 'image' ? "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-500/10 dark:text-purple-400" : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/10 dark:text-amber-400"
                        )}>
                        {attachment.update_type === 'image' ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                        {attachment.file_name || 'Image'}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {(isVibeAdmin || isVendor) && (
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50 flex-wrap">
                  {onQuickStatusChange && (
                    <>
                      {stage.status === 'pending' && (
                        <Button size="sm" variant="outline" className="h-9 text-xs font-medium border-blue-500/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10" disabled={isUpdating} onClick={() => handleQuickStatus(stage.id, 'in_progress')}>
                          {isUpdating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Clock className="h-3.5 w-3.5 mr-1.5" />} Mark In Progress
                        </Button>
                      )}
                      {stage.status === 'in_progress' && (
                        <Button size="sm" variant="outline" className="h-9 text-xs font-medium border-green-500/50 text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10" disabled={isUpdating} onClick={() => handleQuickStatus(stage.id, 'completed')}>
                          {isUpdating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />} Mark Complete
                        </Button>
                      )}
                      {stage.status === 'completed' && isVibeAdmin && (
                        <Button size="sm" variant="ghost" className="h-9 text-xs text-muted-foreground" disabled={isUpdating} onClick={() => handleQuickStatus(stage.id, 'pending')}>
                          {isUpdating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null} Reset
                        </Button>
                      )}
                    </>
                  )}
                  <Button size="sm" variant="default" className="h-9 text-xs font-medium" onClick={() => onUpdateClick(stage, stageDef)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Add Note
                  </Button>
                  {isVibeAdmin && onVendorAssign && vendors.length > 0 && (
                    <select className="h-9 text-xs border rounded-lg px-2 bg-background text-foreground" value={stage.vendor_id || ''} onChange={(e) => { if (e.target.value) onVendorAssign(stage.id, e.target.value); }}>
                      <option value="">Assign vendor...</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Internal Notes */}
              {isVibeAdmin && onInternalNotesChange && (
                <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><StickyNote className="h-3 w-3" /> Internal Notes</Label>
                    {hasUnsavedNotes(stage.id, stage.internal_notes) && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-primary" disabled={savingNotes.has(stage.id)} onClick={() => handleSaveInternalNotes(stage.id)}>
                        {savingNotes.has(stage.id) ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Save
                      </Button>
                    )}
                  </div>
                  <Textarea value={getInternalNotesValue(stage)} onChange={(e) => setInternalNotesEdits(prev => ({ ...prev, [stage.id]: e.target.value }))} placeholder="Add internal notes..." className="text-xs min-h-[60px] resize-none bg-background" />
                </div>
              )}
            </div>

            {/* Activity History */}
            <CollapsibleContent>
              <div className="px-4 pb-4 border-t border-border pt-3">
                <Label className="text-xs text-muted-foreground mb-2 block">Activity History</Label>
                <div className="space-y-2">
                  {stage.production_stage_updates
                    .filter(u => u.update_type !== 'status_change' || u.note_text || u.image_url || u.file_url)
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((update) => {
                      const isCustomSub = update.note_text?.includes('<!--CUSTOM_SUBSTAGE:');
                      const customLabel = update.note_text?.match(/<!--CUSTOM_SUBSTAGE:(.*?)-->/)?.[1];
                      return (
                        <div key={update.id} className={cn("flex items-start gap-2 p-2 rounded-lg transition-colors",
                          update.update_type === 'note' ? 'bg-slate-100/80 dark:bg-slate-800/30 border-2 border-primary/20' :
                          update.update_type === 'image' ? 'bg-purple-50 dark:bg-purple-900/10' :
                          update.update_type === 'file' ? 'bg-amber-50 dark:bg-amber-900/10' :
                          update.new_status === 'completed' ? 'bg-green-50 dark:bg-green-900/10 border-2 border-success/20' : 'bg-muted/30'
                        )}>
                          <div className="flex-shrink-0 mt-0.5">
                            {update.update_type === 'note' ? <MessageSquare className="h-4 w-4 text-slate-500" /> :
                             update.update_type === 'image' ? <ImageIcon className="h-4 w-4 text-purple-500" /> :
                             update.update_type === 'file' ? <FileText className="h-4 w-4 text-amber-500" /> :
                             update.new_status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                             <Clock className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            {update.update_type === 'status_change' && <p className="text-sm">Status changed to <span className="font-medium capitalize">{update.new_status?.replace('_', ' ')}</span></p>}
                            {update.note_text && !isCustomSub && <p className="text-sm whitespace-pre-wrap">{update.note_text}</p>}
                            {isCustomSub && <p className="text-sm font-medium text-success">✓ {customLabel}</p>}
                            {update.image_url && <a href={update.image_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1"><ImageIcon className="h-3 w-3" /> View Image</a>}
                            {update.file_url && <a href={update.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1"><Download className="h-3 w-3" /> {update.file_name || 'Download File'}</a>}
                            <p className="text-xs text-muted-foreground mt-1">{new Date(update.created_at).toLocaleDateString()} {new Date(update.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          {isVibeAdmin && onDeleteUpdate && (
                            <button type="button" disabled={deletingUpdates.has(update.id)} onClick={(e) => { e.stopPropagation(); handleDeleteUpdate(update.id); }}
                              className={cn("flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors", "hover:bg-destructive/20 text-muted-foreground hover:text-destructive")} title="Delete this update">
                              {deletingUpdates.has(update.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
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
  };

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Production Progress</h3>
          <div className="flex items-center gap-2">
            {updatingProgress && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <span className="text-2xl font-bold text-primary">{displayPercent}%</span>
          </div>
        </div>
        
        {/* Progress Bar - Draggable slider for vibe_admin, Segmented for vendor, Smooth for customers */}
        {isVibeAdmin && onProgressSliderChange ? (
          <>
            {/* Draggable slider for Vibe Admin */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Slider
                  value={[isSliding && sliderValue !== null ? sliderValue : adminSliderPercent]}
                  onValueChange={(value) => {
                    setIsSliding(true);
                    setSliderValue(value[0]);
                  }}
                  onValueCommit={handleSliderCommit}
                  max={100}
                  min={0}
                  step={1}
                  disabled={updatingProgress}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Drag to adjust progress. Stages will auto-update based on target percentage.
              </p>
              
              {/* Segmented view below slider */}
              <div className="flex items-center gap-0.5">
                {visibleStageDefinitions.map((def) => {
                  const status = getStageStatus(def.value);
                  const weight = def.weight ?? (100 / visibleStageDefinitions.length);
                  return (
                    <div 
                      key={def.value} 
                      className={cn(
                        "h-2 rounded-sm transition-colors",
                        status === 'completed' ? 'bg-green-500' :
                        status === 'in_progress' ? 'bg-blue-500' :
                        'bg-muted'
                      )}
                      style={{ width: `${weight}%` }}
                      title={`${def.label}: ${status}`}
                    />
                  );
                })}
              </div>
              
              {/* Stage weight labels */}
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
            </div>
            
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>0%</span>
              <span>100%</span>
            </div>
          </>
        ) : isVendor ? (
          <>
            {/* Segmented progress bar for vendor */}
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
            
            {/* Stage weight labels for vendor */}
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
      {isVibeAdmin ? (
        <>
          {/* Internal Stages Section */}
          {(() => {
            const internalDefs = visibleStageDefinitions.filter(d => d.adminOnly);
            if (internalDefs.length === 0) return null;
            return (
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600 bg-amber-50/50 dark:bg-amber-500/10">
                    Internal Only
                  </Badge>
                  <span className="text-xs text-muted-foreground">Not visible to customers</span>
                </div>
                <div className="relative">
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-amber-300/40 dark:bg-amber-500/20" />
                  <div className="space-y-3">
                    {internalDefs.map((stageDef) => renderStageCard(stageDef))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Customer-Facing Stages Section */}
          {(() => {
            const customerDefs = visibleStageDefinitions.filter(d => !d.adminOnly);
            if (customerDefs.length === 0) return null;
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-600 bg-blue-50/50 dark:bg-blue-500/10">
                    Customer Visible
                  </Badge>
                  <span className="text-xs text-muted-foreground">Visible to customers &amp; vendors</span>
                </div>
                <div className="relative">
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
                  <div className="space-y-3">
                    {customerDefs.map((stageDef) => renderStageCard(stageDef))}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      ) : (
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-3">
            {visibleStageDefinitions.map((stageDef) => renderStageCard(stageDef))}
          </div>
        </div>
      )}
    </div>
  );
}

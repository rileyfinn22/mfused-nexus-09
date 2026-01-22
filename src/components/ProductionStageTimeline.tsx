import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp, Upload, FileText, Download, Image as ImageIcon, MessageSquare, Loader2, Truck, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}

interface ProductionStageTimelineProps {
  stages: ProductionStage[];
  stageDefinitions: StageDefinition[];
  onUpdateClick: (stage: ProductionStage, stageDef: StageDefinition) => void;
  onQuickStatusChange?: (stageId: string, newStatus: string) => Promise<void>;
  onVendorAssign?: (stageId: string, vendorId: string) => void;
  vendors?: { id: string; name: string }[];
  isVibeAdmin: boolean;
  isVendor: boolean;
  isCustomer: boolean;
}

export function ProductionStageTimeline({
  stages,
  stageDefinitions,
  onUpdateClick,
  onQuickStatusChange,
  onVendorAssign,
  vendors = [],
  isVibeAdmin,
  isVendor,
  isCustomer,
}: ProductionStageTimelineProps) {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [updatingStages, setUpdatingStages] = useState<Set<string>>(new Set());

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

  // Calculate weighted progress based on stage weights
  const calculateWeightedProgress = () => {
    let completedWeight = 0;
    let inProgressWeight = 0;
    
    stageDefinitions.forEach(def => {
      const status = getStageStatus(def.value);
      const weight = def.weight ?? (100 / stageDefinitions.length);
      
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

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Production Progress</h3>
          <span className="text-2xl font-bold text-primary">{progressPercent}%</span>
        </div>
        
        {/* Visual Timeline Header - Weighted Segments */}
        <div className="flex items-center gap-0.5 mb-2">
          {stageDefinitions.map((def) => {
            const status = getStageStatus(def.value);
            const weight = def.weight ?? (100 / stageDefinitions.length);
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
        
        {/* Stage Labels under progress bar */}
        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
          {stageDefinitions.map((def) => {
            const status = getStageStatus(def.value);
            const weight = def.weight ?? (100 / stageDefinitions.length);
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
        
        {/* Stage Labels */}
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>Start</span>
          <span>Complete</span>
        </div>
      </div>

      {/* Stage Cards */}
      <div className="relative">
        {/* Vertical Timeline Line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
        
        <div className="space-y-3">
          {stageDefinitions.map((stageDef, index) => {
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
                      <div className="border-t border-border px-4 py-3 bg-muted/30">
                        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Activity History
                        </h5>
                        <div className="space-y-3">
                          {stage.production_stage_updates
                            .filter((update) => {
                              // Show all non-status-change updates
                              if (update.update_type !== 'status_change') return true;
                              // For status_change, only show if it has actual content (note/image/file)
                              return update.note_text || update.image_url || update.file_url;
                            })
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((update) => (
                            <div
                              key={update.id}
                              className="bg-background border border-border rounded-lg p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className="text-xs capitalize">
                                  {update.update_type === 'status_change' && update.note_text ? 'note' : update.update_type.replace('_', ' ')}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(update.created_at).toLocaleString()}
                                </span>
                              </div>
                              
                              {update.note_text && (
                                <p className="text-sm text-foreground">{update.note_text.replace(/<!--[A-Z_]+-->/g, '')}</p>
                              )}
                              
                              {update.image_url && (
                                <img
                                  src={update.image_url}
                                  alt="Stage update"
                                  className="rounded-lg max-h-48 object-cover border border-border"
                                />
                              )}
                              
                              {update.file_url && (
                                <a
                                  href={update.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 bg-muted rounded-lg border border-border hover:border-primary transition-colors"
                                >
                                  <FileText className="h-4 w-4 text-primary" />
                                  <span className="text-sm text-primary hover:underline flex-1">
                                    {update.file_name || 'Download Document'}
                                  </span>
                                  <Download className="h-3 w-3 text-muted-foreground" />
                                </a>
                              )}
                            </div>
                          ))}
                          {stage.production_stage_updates.filter(u => u.update_type !== 'status_change' || u.note_text || u.image_url || u.file_url).length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-2">No notes or attachments yet</p>
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

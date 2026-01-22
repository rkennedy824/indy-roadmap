"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Initiative,
  InitiativeAssignment,
  Engineer,
  Specialty,
  Client,
  ScheduledBlock,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Clock,
  Users,
  Lock,
  ExternalLink,
  FileText,
  Building2,
  Tag,
  Save,
  X,
  Loader2,
  CheckCircle,
  Plus,
  Pencil,
  Sparkles,
  Rocket,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import Link from "next/link";
import { DocGenerationWizard } from "@/components/initiatives/doc-generation-wizard";
import { cn } from "@/lib/utils";

interface InitiativeWithFullRelations extends Initiative {
  tags: { id: string; specialty: Specialty }[];
  assignedEngineer: Engineer | null;
  assignedEngineers: (InitiativeAssignment & { engineer: Engineer })[];
  clientAccess: { id: string; client: Client }[];
  scheduledBlocks: (ScheduledBlock & { engineer: Engineer })[];
  dependencies: { id: string; dependency: Initiative }[];
}

interface InitiativeDetailPanelProps {
  initiativeId: string | null;
  onClose: () => void;
  engineers: Engineer[];
  specialties: Specialty[];
  clients: Client[];
}

const STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PROPOSED", label: "Proposed" },
  { value: "APPROVED", label: "Approved" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
  { value: "BLOCKED", label: "Blocked" },
];

// Expandable text section component
function ExpandableSection({
  title,
  content,
  icon,
  maxLines = 3,
  onEdit,
  isEditing,
  editValue,
  onEditChange,
  onSave,
  onCancel,
}: {
  title: string;
  content: string | null | undefined;
  icon?: React.ReactNode;
  maxLines?: number;
  onEdit?: () => void;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = content && content.trim().length > 0;
  const lineHeight = 20; // approximate line height in pixels
  const maxHeight = lineHeight * maxLines;

  if (isEditing) {
    return (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          {icon}
          {title}
        </Label>
        <Textarea
          value={editValue || ""}
          onChange={(e) => onEditChange?.(e.target.value)}
          rows={6}
          autoFocus
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={onSave}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          {icon}
          {title}
        </Label>
        {hasContent && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-xs"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                More
              </>
            )}
          </Button>
        )}
      </div>
      <div
        className={cn(
          "text-sm cursor-pointer hover:bg-muted p-2 rounded-md transition-colors",
          !isExpanded && hasContent && "overflow-hidden"
        )}
        style={!isExpanded && hasContent ? { maxHeight: `${maxHeight}px` } : undefined}
        onClick={onEdit}
      >
        {hasContent ? (
          <div className={cn(!isExpanded && "line-clamp-3")}>
            <pre className="whitespace-pre-wrap font-sans text-sm">{content}</pre>
          </div>
        ) : (
          <span className="text-muted-foreground italic">Click to add...</span>
        )}
      </div>
    </div>
  );
}

export function InitiativeDetailPanel({
  initiativeId,
  onClose,
  engineers,
  specialties,
  clients,
}: InitiativeDetailPanelProps) {
  const router = useRouter();
  const [initiative, setInitiative] = useState<InitiativeWithFullRelations | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string | number | boolean | null>>({});

  // Client editing state
  const [isEditingClients, setIsEditingClients] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [newClientName, setNewClientName] = useState("");

  // Engineer editing state
  const [isEditingEngineers, setIsEditingEngineers] = useState(false);
  const [selectedEngineerIds, setSelectedEngineerIds] = useState<string[]>([]);

  // Fetch initiative data when ID changes
  useEffect(() => {
    if (!initiativeId) {
      setInitiative(null);
      return;
    }

    const fetchInitiative = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/initiatives/${initiativeId}`);
        if (response.ok) {
          const data = await response.json();
          setInitiative(data);
          setEditValues({});
          setEditingField(null);
        }
      } catch (error) {
        console.error("Failed to fetch initiative:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitiative();
  }, [initiativeId]);

  const handleSave = async (field: string, value: string | number | boolean | null) => {
    if (!initiative) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/initiatives/${initiative.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });

      if (response.ok) {
        // Refetch to get full relations
        const refetch = await fetch(`/api/initiatives/${initiative.id}`);
        if (refetch.ok) {
          setInitiative(await refetch.json());
        }
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
      setEditingField(null);
    }
  };

  const startEditing = (field: string, currentValue: string | number | boolean | null) => {
    setEditingField(field);
    setEditValues({ ...editValues, [field]: currentValue });
  };

  const cancelEditing = () => {
    setEditingField(null);
  };

  // Client editing functions
  const startEditingClients = () => {
    if (initiative) {
      setSelectedClientIds(initiative.clientAccess?.map(ca => ca.client.id) || []);
      setNewClientName("");
      setIsEditingClients(true);
    }
  };

  const toggleClient = (clientId: string) => {
    setSelectedClientIds(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const addNewClient = async () => {
    if (!newClientName.trim()) return;

    const existingClient = clients.find(
      c => c.name.toLowerCase() === newClientName.trim().toLowerCase()
    );

    if (existingClient) {
      if (!selectedClientIds.includes(existingClient.id)) {
        setSelectedClientIds([...selectedClientIds, existingClient.id]);
      }
    } else {
      setSelectedClientIds([...selectedClientIds, `new:${newClientName.trim()}`]);
    }
    setNewClientName("");
  };

  const saveClients = async () => {
    if (!initiative) return;

    setIsSaving(true);
    try {
      const existingClientIds = selectedClientIds.filter(id => !id.startsWith("new:"));
      const newClientNames = selectedClientIds
        .filter(id => id.startsWith("new:"))
        .map(id => id.replace("new:", ""));

      const response = await fetch(`/api/initiatives/${initiative.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingClientIds,
          newClientNames,
        }),
      });

      if (response.ok) {
        const refetch = await fetch(`/api/initiatives/${initiative.id}`);
        if (refetch.ok) {
          setInitiative(await refetch.json());
        }
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to save clients:", error);
    } finally {
      setIsSaving(false);
      setIsEditingClients(false);
    }
  };

  // Engineer editing functions
  const startEditingEngineers = () => {
    if (initiative) {
      setSelectedEngineerIds(initiative.assignedEngineers?.map(a => a.engineerId).filter((id): id is string => id !== null) || []);
      setIsEditingEngineers(true);
    }
  };

  const toggleEngineer = (engineerId: string) => {
    setSelectedEngineerIds(prev =>
      prev.includes(engineerId)
        ? prev.filter(id => id !== engineerId)
        : [...prev, engineerId]
    );
  };

  const saveEngineers = async () => {
    if (!initiative) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/initiatives/${initiative.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedEngineerIds: selectedEngineerIds,
        }),
      });

      if (response.ok) {
        const refetch = await fetch(`/api/initiatives/${initiative.id}`);
        if (refetch.ok) {
          setInitiative(await refetch.json());
        }
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to save engineers:", error);
    } finally {
      setIsSaving(false);
      setIsEditingEngineers(false);
    }
  };

  const deleteScheduledBlock = async (blockId: string) => {
    if (!confirm("Are you sure you want to remove this scheduled block?")) {
      return;
    }

    try {
      const response = await fetch(`/api/schedule/${blockId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        const refetch = await fetch(`/api/initiatives/${initiative?.id}`);
        if (refetch.ok) {
          setInitiative(await refetch.json());
        }
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to delete scheduled block");
      }
    } catch (error) {
      console.error("Failed to delete scheduled block:", error);
      alert("Failed to delete scheduled block");
    }
  };

  if (!initiativeId) return null;

  return (
    <Sheet open={!!initiativeId} onOpenChange={() => onClose()}>
      <SheetContent className="!w-[500px] !max-w-[500px] overflow-y-auto p-6">
        {isLoading ? (
          <>
            <SheetHeader>
              <SheetTitle>Loading...</SheetTitle>
            </SheetHeader>
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : initiative ? (
          <>
            <SheetHeader className="pb-2">
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {isSaving && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>
              {editingField === "title" ? (
                <div className="flex gap-2">
                  <Input
                    value={editValues.title as string || ""}
                    onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                    className="text-lg font-semibold"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => handleSave("title", editValues.title as string)}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEditing}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <SheetTitle
                  className="cursor-pointer hover:text-primary transition-colors"
                  onClick={() => startEditing("title", initiative.title)}
                >
                  {initiative.title}
                </SheetTitle>
              )}
            </SheetHeader>

            <div className="space-y-4 mt-4">
              {/* Status & Assigned Engineers - TOP */}
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select
                    value={initiative.status}
                    onValueChange={(value) => handleSave("status", value)}
                  >
                    <SelectTrigger className="mt-1 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Engineers</Label>
                    {!isEditingEngineers && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 px-1"
                        onClick={startEditingEngineers}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {isEditingEngineers ? (
                    <div className="mt-1 space-y-2">
                      <div className="space-y-1 max-h-[120px] overflow-y-auto border rounded-md p-2">
                        {engineers.map((engineer) => (
                          <div key={engineer.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`engineer-${engineer.id}`}
                              checked={selectedEngineerIds.includes(engineer.id)}
                              onCheckedChange={() => toggleEngineer(engineer.id)}
                            />
                            <label
                              htmlFor={`engineer-${engineer.id}`}
                              className="text-xs cursor-pointer"
                            >
                              {engineer.name}
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-xs" onClick={saveEngineers} disabled={isSaving}>
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setIsEditingEngineers(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {initiative.assignedEngineers?.length > 0 ? (
                        initiative.assignedEngineers.map((assignment) => (
                          <Badge
                            key={assignment.id}
                            variant="secondary"
                            className="text-xs"
                          >
                            {assignment.engineer.name}
                          </Badge>
                        ))
                      ) : (
                        <span
                          className="text-xs text-muted-foreground italic cursor-pointer hover:text-foreground"
                          onClick={startEditingEngineers}
                        >
                          Unassigned
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule & Effort - Combined compact section */}
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Calendar className="h-4 w-4" />
                    Schedule & Effort
                  </div>
                  {editingField === "effortEstimate" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editValues.effortEstimate as number || ""}
                        onChange={(e) => setEditValues({ ...editValues, effortEstimate: e.target.value ? parseFloat(e.target.value) : null })}
                        className="h-6 w-16 text-xs"
                        autoFocus
                      />
                      <span className="text-xs text-muted-foreground">wks</span>
                      <Button size="sm" className="h-6 px-2" onClick={() => handleSave("effortEstimate", editValues.effortEstimate as number)}>
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={cancelEditing}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span
                      className="text-xs cursor-pointer hover:text-primary"
                      onClick={() => startEditing("effortEstimate", initiative.effortEstimate)}
                    >
                      Est: {initiative.effortEstimate ? `${initiative.effortEstimate} wk${initiative.effortEstimate !== 1 ? 's' : ''}` : 'Not set'}
                    </span>
                  )}
                </div>

                {initiative.scheduledBlocks?.length > 0 ? (
                  <div className="space-y-1">
                    {initiative.scheduledBlocks.map((block) => (
                      <div key={block.id} className="flex items-center justify-between text-xs group">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {format(new Date(block.startDate), "MMM d")} - {format(new Date(block.endDate), "MMM d")}
                          </span>
                          <span className="font-medium">{block.engineer.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span>{block.hoursAllocated}h</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                            onClick={() => deleteScheduledBlock(block.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No scheduled blocks</p>
                )}
              </div>

              {/* Target Release Dates - Compact */}
              <div className="flex gap-4 text-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Rocket className="h-3 w-3 text-blue-500" />
                    Beta Target
                  </div>
                  {editingField === "betaTargetDate" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={editValues.betaTargetDate as string || ""}
                        onChange={(e) => setEditValues({ ...editValues, betaTargetDate: e.target.value })}
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <Button size="sm" className="h-7 px-2" onClick={() => handleSave("betaTargetDate", editValues.betaTargetDate || null)}>
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEditing}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span
                      className="text-sm cursor-pointer hover:text-primary"
                      onClick={() => startEditing("betaTargetDate", initiative.betaTargetDate ? format(new Date(initiative.betaTargetDate), "yyyy-MM-dd") : "")}
                    >
                      {initiative.betaTargetDate
                        ? format(new Date(initiative.betaTargetDate), "MMM d, yyyy")
                        : <span className="text-muted-foreground italic text-xs">Not set</span>
                      }
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Rocket className="h-3 w-3 text-green-500" />
                    Production Target
                  </div>
                  {editingField === "masterTargetDate" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={editValues.masterTargetDate as string || ""}
                        onChange={(e) => setEditValues({ ...editValues, masterTargetDate: e.target.value })}
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <Button size="sm" className="h-7 px-2" onClick={() => handleSave("masterTargetDate", editValues.masterTargetDate || null)}>
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEditing}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span
                      className="text-sm cursor-pointer hover:text-primary"
                      onClick={() => startEditing("masterTargetDate", initiative.masterTargetDate ? format(new Date(initiative.masterTargetDate), "yyyy-MM-dd") : "")}
                    >
                      {initiative.masterTargetDate
                        ? format(new Date(initiative.masterTargetDate), "MMM d, yyyy")
                        : <span className="text-muted-foreground italic text-xs">Not set</span>
                      }
                    </span>
                  )}
                </div>
              </div>

              {/* Tags & Clients - Compact row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Tags
                  </Label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {initiative.tags?.length > 0 ? (
                      initiative.tags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="secondary"
                          className="text-xs"
                          style={{ backgroundColor: tag.specialty.color || undefined }}
                        >
                          {tag.specialty.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">None</span>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Clients
                    </Label>
                    {!isEditingClients && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 px-1"
                        onClick={startEditingClients}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {isEditingClients ? (
                    <div className="mt-1 space-y-2">
                      <div className="space-y-1 max-h-[100px] overflow-y-auto border rounded-md p-2">
                        {clients.map((client) => (
                          <div key={client.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`client-${client.id}`}
                              checked={selectedClientIds.includes(client.id)}
                              onCheckedChange={() => toggleClient(client.id)}
                            />
                            <label htmlFor={`client-${client.id}`} className="text-xs cursor-pointer">
                              {client.name}
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Input
                          placeholder="New client..."
                          value={newClientName}
                          onChange={(e) => setNewClientName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addNewClient()}
                          className="h-6 text-xs"
                        />
                        <Button size="sm" className="h-6" onClick={addNewClient}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-xs" onClick={saveClients}>Save</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setIsEditingClients(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {initiative.clientAccess?.length > 0 ? (
                        initiative.clientAccess.map((ca) => (
                          <Badge key={ca.id} variant="outline" className="text-xs">
                            {ca.client.name}
                          </Badge>
                        ))
                      ) : (
                        <span
                          className="text-xs text-muted-foreground italic cursor-pointer hover:text-foreground"
                          onClick={startEditingClients}
                        >
                          None
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Expandable Content Sections */}
              <ExpandableSection
                title="Description"
                content={initiative.description}
                onEdit={() => startEditing("description", initiative.description)}
                isEditing={editingField === "description"}
                editValue={editValues.description as string}
                onEditChange={(v) => setEditValues({ ...editValues, description: v })}
                onSave={() => handleSave("description", editValues.description as string)}
                onCancel={cancelEditing}
              />

              <ExpandableSection
                title="PRD"
                icon={<FileText className="h-3 w-3" />}
                content={initiative.prdContent}
                onEdit={() => startEditing("prdContent", initiative.prdContent)}
                isEditing={editingField === "prdContent"}
                editValue={editValues.prdContent as string}
                onEditChange={(v) => setEditValues({ ...editValues, prdContent: v })}
                onSave={() => handleSave("prdContent", editValues.prdContent as string)}
                onCancel={cancelEditing}
              />

              <ExpandableSection
                title="Executive Summary"
                content={initiative.executiveOverview}
                onEdit={() => startEditing("executiveOverview", initiative.executiveOverview)}
                isEditing={editingField === "executiveOverview"}
                editValue={editValues.executiveOverview as string}
                onEditChange={(v) => setEditValues({ ...editValues, executiveOverview: v })}
                onSave={() => handleSave("executiveOverview", editValues.executiveOverview as string)}
                onCancel={cancelEditing}
              />

              <ExpandableSection
                title="Client-Facing Summary"
                content={initiative.clientOverview}
                onEdit={() => startEditing("clientOverview", initiative.clientOverview)}
                isEditing={editingField === "clientOverview"}
                editValue={editValues.clientOverview as string}
                onEditChange={(v) => setEditValues({ ...editValues, clientOverview: v })}
                onSave={() => handleSave("clientOverview", editValues.clientOverview as string)}
                onCancel={cancelEditing}
              />

              {/* PRD Link */}
              {initiative.prdUrl && (
                <div>
                  <Label className="text-xs text-muted-foreground">External PRD</Label>
                  <a
                    href={initiative.prdUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    {initiative.prdUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Dependencies */}
              {initiative.dependencies?.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Dependencies</Label>
                  <div className="mt-1 space-y-1">
                    {initiative.dependencies.map((dep) => (
                      <div key={dep.id} className="text-xs flex items-center gap-2">
                        <span className="text-muted-foreground">→</span>
                        {dep.dependency.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Locks - Compact */}
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">Lock Assignment</span>
                  <Switch
                    checked={initiative.lockAssignment}
                    onCheckedChange={(checked) => handleSave("lockAssignment", checked)}
                    className="scale-75"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">Lock Dates</span>
                  <Switch
                    checked={initiative.lockDates}
                    onCheckedChange={(checked) => handleSave("lockDates", checked)}
                    className="scale-75"
                  />
                </div>
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <DocGenerationWizard
                  initiative={initiative}
                  trigger={
                    <Button variant="outline" size="sm" className="flex-1">
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Docs
                    </Button>
                  }
                />
                <Link href={`/initiatives/${initiative.id}`} className="flex-1">
                  <Button size="sm" className="w-full">
                    View & Edit
                  </Button>
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Not Found</SheetTitle>
            </SheetHeader>
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Initiative not found
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

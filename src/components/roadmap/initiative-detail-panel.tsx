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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Clock,
  Users,
  AlertTriangle,
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
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import Link from "next/link";
import { DocGenerationWizard } from "@/components/initiatives/doc-generation-wizard";

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
        const updated = await response.json();
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

    // Check if client already exists
    const existingClient = clients.find(
      c => c.name.toLowerCase() === newClientName.trim().toLowerCase()
    );

    if (existingClient) {
      if (!selectedClientIds.includes(existingClient.id)) {
        setSelectedClientIds([...selectedClientIds, existingClient.id]);
      }
    } else {
      // Will be handled when saving - store as a new client name
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
        // Refetch to get updated data
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
        // Refetch to get updated data
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
        // Refetch to get updated data
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DRAFT": return "bg-gray-500";
      case "PROPOSED": return "bg-blue-500";
      case "APPROVED": return "bg-green-500";
      case "IN_PROGRESS": return "bg-yellow-500";
      case "DONE": return "bg-emerald-600";
      case "BLOCKED": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  if (!initiativeId) return null;

  return (
    <Sheet open={!!initiativeId} onOpenChange={() => onClose()}>
      <SheetContent className="!w-[600px] !max-w-[600px] overflow-y-auto p-6">
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
            <SheetHeader className="pb-4">
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

            <div className="space-y-6 mt-4">
              {/* Target Release Dates - at the top for quick visibility */}
              <div>
                <h4 className="font-medium mb-2 text-sm">Target Release Dates</h4>
                <div className="border rounded-lg px-3 py-2 space-y-2 bg-muted/30">
                  {/* Beta Release */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Rocket className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Beta</span>
                    </div>
                    {editingField === "betaTargetDate" ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="date"
                          value={editValues.betaTargetDate as string || ""}
                          onChange={(e) => setEditValues({ ...editValues, betaTargetDate: e.target.value })}
                          className="h-7 w-[140px] text-sm"
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
                        className="text-sm font-medium cursor-pointer hover:text-primary"
                        onClick={() => startEditing("betaTargetDate", initiative.betaTargetDate ? format(new Date(initiative.betaTargetDate), "yyyy-MM-dd") : "")}
                      >
                        {initiative.betaTargetDate
                          ? format(new Date(initiative.betaTargetDate), "MMM d, yyyy")
                          : <span className="text-muted-foreground italic font-normal">Set date...</span>
                        }
                      </span>
                    )}
                  </div>
                  {/* Production Release */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Rocket className="h-4 w-4 text-green-500" />
                      <span className="font-medium">Production</span>
                    </div>
                    {editingField === "masterTargetDate" ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="date"
                          value={editValues.masterTargetDate as string || ""}
                          onChange={(e) => setEditValues({ ...editValues, masterTargetDate: e.target.value })}
                          className="h-7 w-[140px] text-sm"
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
                        className="text-sm font-medium cursor-pointer hover:text-primary"
                        onClick={() => startEditing("masterTargetDate", initiative.masterTargetDate ? format(new Date(initiative.masterTargetDate), "yyyy-MM-dd") : "")}
                      >
                        {initiative.masterTargetDate
                          ? format(new Date(initiative.masterTargetDate), "MMM d, yyyy")
                          : <span className="text-muted-foreground italic font-normal">Set date...</span>
                        }
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status & Engineer in a grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select
                    value={initiative.status}
                    onValueChange={(value) => handleSave("status", value)}
                  >
                    <SelectTrigger className="mt-1">
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
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Assigned Engineers</Label>
                    {!isEditingEngineers && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1"
                        onClick={startEditingEngineers}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {isEditingEngineers ? (
                    <div className="mt-1 space-y-2">
                      <div className="space-y-1 max-h-[150px] overflow-y-auto border rounded-md p-2">
                        {engineers.map((engineer, index) => (
                          <div key={engineer.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`engineer-${engineer.id}`}
                              checked={selectedEngineerIds.includes(engineer.id)}
                              onCheckedChange={() => toggleEngineer(engineer.id)}
                            />
                            <label
                              htmlFor={`engineer-${engineer.id}`}
                              className="text-xs cursor-pointer flex items-center gap-1"
                            >
                              {engineer.name}
                              {selectedEngineerIds[0] === engineer.id && (
                                <span className="text-muted-foreground">(primary)</span>
                              )}
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-xs" onClick={saveEngineers} disabled={isSaving}>
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
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
                        initiative.assignedEngineers.map((assignment, index) => (
                          <Badge
                            key={assignment.id}
                            variant={assignment.isPrimary ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {assignment.engineer.name}
                            {assignment.isPrimary && " ★"}
                          </Badge>
                        ))
                      ) : (
                        <span
                          className="text-xs text-muted-foreground italic cursor-pointer hover:text-foreground"
                          onClick={startEditingEngineers}
                        >
                          Click to assign...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule */}
              {initiative.scheduledBlocks?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {initiative.scheduledBlocks.map((block) => (
                      <div key={block.id} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2">
                          <span>
                            {format(new Date(block.startDate), "MMM d")} -{" "}
                            {format(new Date(block.endDate), "MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{block.hoursAllocated}h</span>
                          <Users className="h-3 w-3 ml-2" />
                          <span>{block.engineer.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteScheduledBlock(block.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Separator />

              {/* Description */}
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                {editingField === "description" ? (
                  <div className="mt-1 space-y-2">
                    <Textarea
                      value={editValues.description as string || ""}
                      onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                      rows={4}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSave("description", editValues.description as string)}>
                        <Save className="h-4 w-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditing}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="mt-1 text-sm cursor-pointer hover:bg-muted p-2 rounded-md transition-colors min-h-[60px]"
                    onClick={() => startEditing("description", initiative.description)}
                  >
                    {initiative.description || (
                      <span className="text-muted-foreground italic">Click to add description...</span>
                    )}
                  </p>
                )}
              </div>

              {/* PRD Link */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  PRD Link
                </Label>
                {editingField === "prdUrl" ? (
                  <div className="mt-1 space-y-2">
                    <Input
                      value={editValues.prdUrl as string || ""}
                      onChange={(e) => setEditValues({ ...editValues, prdUrl: e.target.value })}
                      placeholder="https://..."
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSave("prdUrl", editValues.prdUrl as string)}>
                        <Save className="h-4 w-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditing}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="mt-1 text-sm cursor-pointer hover:bg-muted p-2 rounded-md transition-colors"
                    onClick={() => startEditing("prdUrl", initiative.prdUrl)}
                  >
                    {initiative.prdUrl ? (
                      <a
                        href={initiative.prdUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {initiative.prdUrl}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground italic">Click to add PRD link...</span>
                    )}
                  </div>
                )}
              </div>

              {/* PRD Content */}
              <div>
                <Label className="text-xs text-muted-foreground">PRD Content / Notes</Label>
                {editingField === "prdContent" ? (
                  <div className="mt-1 space-y-2">
                    <Textarea
                      value={editValues.prdContent as string || ""}
                      onChange={(e) => setEditValues({ ...editValues, prdContent: e.target.value })}
                      rows={6}
                      placeholder="Add PRD content or notes..."
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSave("prdContent", editValues.prdContent as string)}>
                        <Save className="h-4 w-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditing}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="mt-1 text-sm cursor-pointer hover:bg-muted p-2 rounded-md transition-colors min-h-[80px] max-h-[200px] overflow-y-auto"
                    onClick={() => startEditing("prdContent", initiative.prdContent)}
                  >
                    {initiative.prdContent ? (
                      <pre className="whitespace-pre-wrap font-sans">{initiative.prdContent}</pre>
                    ) : (
                      <span className="text-muted-foreground italic">Click to add PRD content...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Effort Estimate */}
              <div>
                <Label className="text-xs text-muted-foreground">Effort Estimate (weeks)</Label>
                {editingField === "effortEstimate" ? (
                  <div className="mt-1 flex gap-2">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={editValues.effortEstimate as number || ""}
                      onChange={(e) => setEditValues({ ...editValues, effortEstimate: e.target.value ? parseFloat(e.target.value) : null })}
                      className="w-32"
                      autoFocus
                    />
                    <Button size="sm" onClick={() => handleSave("effortEstimate", editValues.effortEstimate as number)}>
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p
                    className="mt-1 text-sm cursor-pointer hover:bg-muted p-2 rounded-md transition-colors"
                    onClick={() => startEditing("effortEstimate", initiative.effortEstimate)}
                  >
                    {initiative.effortEstimate ? (
                      `${initiative.effortEstimate} week${initiative.effortEstimate !== 1 ? 's' : ''}`
                    ) : (
                      <span className="text-muted-foreground italic">Click to set estimate...</span>
                    )}
                  </p>
                )}
              </div>

              <Separator />

              {/* Tags */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Tags / Specialties
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {initiative.tags?.length > 0 ? (
                    initiative.tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        style={{ backgroundColor: tag.specialty.color || undefined }}
                      >
                        {tag.specialty.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No tags</span>
                  )}
                </div>
              </div>

              {/* Clients */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Clients
                  </Label>
                  {!isEditingClients && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={startEditingClients}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>

                {isEditingClients ? (
                  <div className="mt-2 space-y-3">
                    {/* Existing clients checkboxes */}
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {clients.map((client) => (
                        <div key={client.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`client-${client.id}`}
                            checked={selectedClientIds.includes(client.id)}
                            onCheckedChange={() => toggleClient(client.id)}
                          />
                          <label
                            htmlFor={`client-${client.id}`}
                            className="text-sm cursor-pointer"
                          >
                            {client.name}
                          </label>
                        </div>
                      ))}
                      {/* Show newly added clients */}
                      {selectedClientIds
                        .filter(id => id.startsWith("new:"))
                        .map((id) => (
                          <div key={id} className="flex items-center gap-2">
                            <Checkbox
                              checked={true}
                              onCheckedChange={() => toggleClient(id)}
                            />
                            <span className="text-sm">
                              {id.replace("new:", "")}
                              <Badge variant="secondary" className="ml-2 text-xs">New</Badge>
                            </span>
                          </div>
                        ))}
                    </div>

                    {/* Add new client */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add new client..."
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addNewClient();
                          }
                        }}
                        className="h-8"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={addNewClient}
                        disabled={!newClientName.trim()}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Save/Cancel buttons */}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveClients} disabled={isSaving}>
                        {isSaving ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Save className="h-3 w-3 mr-1" />
                        )}
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingClients(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {initiative.clientAccess?.length > 0 ? (
                      initiative.clientAccess.map((ca) => (
                        <Badge key={ca.id} variant="outline">
                          {ca.client.name}
                        </Badge>
                      ))
                    ) : (
                      <span
                        className="text-sm text-muted-foreground italic cursor-pointer hover:text-foreground"
                        onClick={startEditingClients}
                      >
                        Click to add clients...
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Dependencies */}
              {initiative.dependencies?.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Dependencies</Label>
                  <div className="mt-2 space-y-1">
                    {initiative.dependencies.map((dep) => (
                      <div key={dep.id} className="text-sm flex items-center gap-2">
                        <span className="text-muted-foreground">→</span>
                        {dep.dependency.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Locks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Lock Assignment
                  </Label>
                  <Switch
                    checked={initiative.lockAssignment}
                    onCheckedChange={(checked) => handleSave("lockAssignment", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Lock Dates
                  </Label>
                  <Switch
                    checked={initiative.lockDates}
                    onCheckedChange={(checked) => handleSave("lockDates", checked)}
                  />
                </div>
              </div>

              <Separator />

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <DocGenerationWizard
                  initiative={initiative}
                  trigger={
                    <Button variant="outline" className="w-full">
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Docs
                    </Button>
                  }
                />
                <Link href={`/initiatives/${initiative.id}`}>
                  <Button className="w-full">
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

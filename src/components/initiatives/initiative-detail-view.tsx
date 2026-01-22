"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Initiative,
  InitiativeTag,
  Specialty,
  Engineer,
  InitiativeDependency,
  Client,
  ClientInitiativeAccess,
  ScheduledBlock,
  InitiativeAssignment,
  Squad,
  SquadMember,
  Idea,
  User,
  InitiativeStatus,
  VisibilityLevel,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  CalendarIcon,
  Clock,
  Lock,
  AlertTriangle,
  GitBranch,
  Users,
  Rocket,
  Lightbulb,
  X,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  FileText,
  Briefcase,
  Sparkles,
  ExternalLink,
  User as UserIcon,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { DocGenerationWizard } from "./doc-generation-wizard";
import { DeleteInitiativeButton } from "./delete-initiative-button";

// Types
type InitiativeWithRelations = Initiative & {
  tags: (InitiativeTag & { specialty: Specialty })[];
  dependencies: (InitiativeDependency & { dependency: Initiative })[];
  dependents: (InitiativeDependency & { dependent: Initiative })[];
  clientAccess: (ClientInitiativeAccess & { client: Client })[];
  scheduledBlocks: (ScheduledBlock & { engineer: Engineer | null; squad: Squad | null })[];
  assignedEngineer: Engineer | null;
  assignedEngineers?: (InitiativeAssignment & { engineer: Engineer | null })[];
  sourceIdea?: {
    id: string;
    title: string;
    problemStatement: string;
    status: string;
    submitter: { name: string | null; email: string };
  } | null;
};

type SquadWithMembers = Squad & { members: (SquadMember & { engineer: Engineer })[] };

interface InitiativeDetailViewProps {
  initiative: InitiativeWithRelations;
  specialties: Specialty[];
  engineers: Engineer[];
  squads: SquadWithMembers[];
  allInitiatives: Initiative[];
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

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  PROPOSED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  DONE: "bg-emerald-100 text-emerald-800",
  BLOCKED: "bg-red-100 text-red-800",
};

const VISIBILITY_LEVELS = [
  { value: "INTERNAL", label: "Internal Only" },
  { value: "CLIENT_VISIBLE", label: "Client Visible" },
];

// Helper to parse dates safely
const parseLocalDate = (dateStr: string | Date | null | undefined): Date | null => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  if (dateStr.length === 10 && dateStr.includes("-")) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(dateStr);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

// Helper to format date for API
const formatDateOnly = (date: Date | null): string | null => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function InitiativeDetailView({
  initiative,
  specialties,
  engineers,
  squads,
  allInitiatives,
  clients,
}: InitiativeDetailViewProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [activeDocTab, setActiveDocTab] = useState<"prd" | "executive" | "client">("prd");
  const [newClientName, setNewClientName] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    title: initiative.title,
    description: initiative.description || "",
    status: initiative.status,
    priority: initiative.priority,
    effortEstimate: initiative.effortEstimate ?? 1,
    deadline: parseLocalDate(initiative.deadline?.toString()),
    visibilityLevel: initiative.visibilityLevel || "INTERNAL",
    lockAssignment: initiative.lockAssignment || false,
    lockDates: initiative.lockDates || false,
    lockedStart: parseLocalDate(initiative.lockedStart?.toString()),
    lockedEnd: parseLocalDate(initiative.lockedEnd?.toString()),
    prdContent: initiative.prdContent || "",
    prdUrl: initiative.prdUrl || "",
    executiveOverview: initiative.executiveOverview || "",
    clientOverview: initiative.clientOverview || "",
    betaTargetDate: parseLocalDate(initiative.betaTargetDate?.toString()),
    masterTargetDate: parseLocalDate(initiative.masterTargetDate?.toString()),
  });

  // Sync AI-generated docs when initiative prop changes (e.g., after wizard completes)
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      prdContent: initiative.prdContent || "",
      executiveOverview: initiative.executiveOverview || "",
      clientOverview: initiative.clientOverview || "",
    }));
  }, [initiative.prdContent, initiative.executiveOverview, initiative.clientOverview]);

  // Engineer and squad assignments
  const [selectedEngineerIds, setSelectedEngineerIds] = useState<string[]>(
    initiative.assignedEngineers?.map((a) => a.engineerId).filter((id): id is string => id !== null) ||
    (initiative.assignedEngineerId ? [initiative.assignedEngineerId] : [])
  );
  const [selectedSquadId, setSelectedSquadId] = useState<string>(initiative.assignedSquadId || "");

  // Tags
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initiative.tags.map((t) => t.specialtyId)
  );

  // Dependencies
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>(
    initiative.dependencies.map((d) => d.dependencyId)
  );

  // Clients
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>(
    initiative.clientAccess.map((ca) => ca.clientId)
  );
  const [newClientNames, setNewClientNames] = useState<string[]>([]);

  // Schedule blocks - maintain local state for editing
  const [scheduleBlocks, setScheduleBlocks] = useState(
    initiative.scheduledBlocks.map((block) => ({
      id: block.id,
      engineerId: block.engineerId,
      squadId: block.squadId,
      startDate: parseLocalDate(block.startDate.toString()),
      endDate: parseLocalDate(block.endDate.toString()),
      hoursAllocated: block.hoursAllocated,
      isAtRisk: block.isAtRisk,
      riskReason: block.riskReason,
      engineer: block.engineer,
      squad: block.squad,
    }))
  );

  // Track original values for dirty checking
  const originalValues = useMemo(() => ({
    title: initiative.title,
    description: initiative.description || "",
    status: initiative.status,
    priority: initiative.priority,
    effortEstimate: initiative.effortEstimate ?? 1,
    deadline: initiative.deadline?.toString() || null,
    visibilityLevel: initiative.visibilityLevel || "INTERNAL",
    lockAssignment: initiative.lockAssignment || false,
    lockDates: initiative.lockDates || false,
    lockedStart: initiative.lockedStart?.toString() || null,
    lockedEnd: initiative.lockedEnd?.toString() || null,
    prdContent: initiative.prdContent || "",
    prdUrl: initiative.prdUrl || "",
    executiveOverview: initiative.executiveOverview || "",
    clientOverview: initiative.clientOverview || "",
    betaTargetDate: initiative.betaTargetDate?.toString() || null,
    masterTargetDate: initiative.masterTargetDate?.toString() || null,
    engineerIds: initiative.assignedEngineers?.map((a) => a.engineerId).filter((id): id is string => id !== null) ||
      (initiative.assignedEngineerId ? [initiative.assignedEngineerId] : []),
    squadId: initiative.assignedSquadId || "",
    tags: initiative.tags.map((t) => t.specialtyId),
    dependencies: initiative.dependencies.map((d) => d.dependencyId),
    clientIds: initiative.clientAccess.map((ca) => ca.clientId),
  }), [initiative]);

  // Check if form is dirty
  const isDirty = useMemo(() => {
    if (formData.title !== originalValues.title) return true;
    if (formData.description !== originalValues.description) return true;
    if (formData.status !== originalValues.status) return true;
    if (formData.priority !== originalValues.priority) return true;
    if (formData.effortEstimate !== originalValues.effortEstimate) return true;
    if (formatDateOnly(formData.deadline) !== (originalValues.deadline ? formatDateOnly(parseLocalDate(originalValues.deadline)) : null)) return true;
    if (formData.visibilityLevel !== originalValues.visibilityLevel) return true;
    if (formData.lockAssignment !== originalValues.lockAssignment) return true;
    if (formData.lockDates !== originalValues.lockDates) return true;
    if (formatDateOnly(formData.lockedStart) !== (originalValues.lockedStart ? formatDateOnly(parseLocalDate(originalValues.lockedStart)) : null)) return true;
    if (formatDateOnly(formData.lockedEnd) !== (originalValues.lockedEnd ? formatDateOnly(parseLocalDate(originalValues.lockedEnd)) : null)) return true;
    if (formData.prdContent !== originalValues.prdContent) return true;
    if (formData.prdUrl !== originalValues.prdUrl) return true;
    if (formData.executiveOverview !== originalValues.executiveOverview) return true;
    if (formData.clientOverview !== originalValues.clientOverview) return true;
    if (formatDateOnly(formData.betaTargetDate) !== (originalValues.betaTargetDate ? formatDateOnly(parseLocalDate(originalValues.betaTargetDate)) : null)) return true;
    if (formatDateOnly(formData.masterTargetDate) !== (originalValues.masterTargetDate ? formatDateOnly(parseLocalDate(originalValues.masterTargetDate)) : null)) return true;
    if (JSON.stringify(selectedEngineerIds.sort()) !== JSON.stringify(originalValues.engineerIds.sort())) return true;
    if (selectedSquadId !== originalValues.squadId) return true;
    if (JSON.stringify(selectedTags.sort()) !== JSON.stringify(originalValues.tags.sort())) return true;
    if (JSON.stringify(selectedDependencies.sort()) !== JSON.stringify(originalValues.dependencies.sort())) return true;
    if (JSON.stringify(selectedClientIds.sort()) !== JSON.stringify(originalValues.clientIds.sort())) return true;
    if (newClientNames.length > 0) return true;
    return false;
  }, [formData, originalValues, selectedEngineerIds, selectedSquadId, selectedTags, selectedDependencies, selectedClientIds, newClientNames]);

  // Computed values
  const isAtRisk = scheduleBlocks.some((block) => block.isAtRisk);
  const getSpecialtyById = (id: string) => specialties.find((s) => s.id === id);
  const getInitiativeById = (id: string) => allInitiatives.find((i) => i.id === id);
  const getClientById = (id: string) => clients.find((c) => c.id === id);

  const availableInitiatives = allInitiatives.filter(
    (i) => i.id !== initiative.id && !selectedDependencies.includes(i.id)
  );
  const availableClients = clients.filter((c) => !selectedClientIds.includes(c.id));

  // Handle save
  const handleSave = async () => {
    if (!formData.title.trim()) {
      alert("Title is required");
      return;
    }

    setIsSaving(true);
    try {
      // Get the first schedule block data if any
      const firstBlock = scheduleBlocks[0];

      const payload = {
        ...formData,
        deadline: formatDateOnly(formData.deadline),
        lockedStart: formatDateOnly(formData.lockedStart),
        lockedEnd: formatDateOnly(formData.lockedEnd),
        betaTargetDate: formatDateOnly(formData.betaTargetDate),
        masterTargetDate: formatDateOnly(formData.masterTargetDate),
        assignedEngineerIds: selectedEngineerIds,
        assignedSquadId: selectedSquadId || null,
        tags: selectedTags,
        dependencies: selectedDependencies,
        existingClientIds: selectedClientIds,
        newClientNames: newClientNames,
        // Schedule data from first block
        scheduleStart: firstBlock ? formatDateOnly(firstBlock.startDate) : null,
        scheduleEnd: firstBlock ? formatDateOnly(firstBlock.endDate) : null,
        scheduleHours: firstBlock?.hoursAllocated || null,
      };

      const response = await fetch(`/api/initiatives/${initiative.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to save initiative");

      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle discard
  const handleDiscard = () => {
    setFormData({
      title: initiative.title,
      description: initiative.description || "",
      status: initiative.status,
      priority: initiative.priority,
      effortEstimate: initiative.effortEstimate ?? 1,
      deadline: parseLocalDate(initiative.deadline?.toString()),
      visibilityLevel: initiative.visibilityLevel || "INTERNAL",
      lockAssignment: initiative.lockAssignment || false,
      lockDates: initiative.lockDates || false,
      lockedStart: parseLocalDate(initiative.lockedStart?.toString()),
      lockedEnd: parseLocalDate(initiative.lockedEnd?.toString()),
      prdContent: initiative.prdContent || "",
      prdUrl: initiative.prdUrl || "",
      executiveOverview: initiative.executiveOverview || "",
      clientOverview: initiative.clientOverview || "",
      betaTargetDate: parseLocalDate(initiative.betaTargetDate?.toString()),
      masterTargetDate: parseLocalDate(initiative.masterTargetDate?.toString()),
    });
    setSelectedEngineerIds(
      initiative.assignedEngineers?.map((a) => a.engineerId).filter((id): id is string => id !== null) ||
      (initiative.assignedEngineerId ? [initiative.assignedEngineerId] : [])
    );
    setSelectedSquadId(initiative.assignedSquadId || "");
    setSelectedTags(initiative.tags.map((t) => t.specialtyId));
    setSelectedDependencies(initiative.dependencies.map((d) => d.dependencyId));
    setSelectedClientIds(initiative.clientAccess.map((ca) => ca.clientId));
    setNewClientNames([]);
    setShowDiscardDialog(false);
  };

  // Tag handlers
  const addTag = (specialtyId: string) => {
    if (!selectedTags.includes(specialtyId)) {
      setSelectedTags([...selectedTags, specialtyId]);
    }
  };

  const removeTag = (specialtyId: string) => {
    setSelectedTags(selectedTags.filter((id) => id !== specialtyId));
  };

  // Dependency handlers
  const addDependency = (initiativeId: string) => {
    if (!selectedDependencies.includes(initiativeId)) {
      setSelectedDependencies([...selectedDependencies, initiativeId]);
    }
  };

  const removeDependency = (initiativeId: string) => {
    setSelectedDependencies(selectedDependencies.filter((id) => id !== initiativeId));
  };

  // Client handlers
  const addExistingClient = (clientId: string) => {
    if (!selectedClientIds.includes(clientId)) {
      setSelectedClientIds([...selectedClientIds, clientId]);
    }
  };

  const removeExistingClient = (clientId: string) => {
    setSelectedClientIds(selectedClientIds.filter((id) => id !== clientId));
  };

  const addNewClient = () => {
    const trimmed = newClientName.trim();
    if (trimmed && !newClientNames.includes(trimmed)) {
      const existingClient = clients.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existingClient) {
        addExistingClient(existingClient.id);
      } else {
        setNewClientNames([...newClientNames, trimmed]);
      }
      setNewClientName("");
    }
  };

  const removeNewClient = (name: string) => {
    setNewClientNames(newClientNames.filter((n) => n !== name));
  };

  // Engineer handlers
  const addEngineer = (engineerId: string) => {
    if (!selectedEngineerIds.includes(engineerId)) {
      setSelectedEngineerIds([...selectedEngineerIds, engineerId]);
    }
  };

  const removeEngineer = (engineerId: string) => {
    setSelectedEngineerIds(selectedEngineerIds.filter((id) => id !== engineerId));
  };

  // Beta date auto-calculation
  const handleBetaDateChange = (date: Date | null) => {
    setFormData((prev) => ({ ...prev, betaTargetDate: date }));
    if (date && !formData.masterTargetDate) {
      const defaultMaster = new Date(date);
      defaultMaster.setDate(defaultMaster.getDate() + 7);
      setFormData((prev) => ({ ...prev, masterTargetDate: defaultMaster }));
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/initiatives"
          className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Initiatives
        </Link>

        {/* Title and Actions Row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            {/* Editable Title */}
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="text-2xl font-bold h-auto py-1 px-2 border-transparent hover:border-input focus:border-input bg-transparent"
              placeholder="Initiative title"
            />

            {/* Status, Tags, and Indicators */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as InitiativeStatus })}
              >
                <SelectTrigger className="w-[140px] h-8">
                  <Badge className={STATUS_COLORS[formData.status]} variant="secondary">
                    {formData.status.replace("_", " ")}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(formData.lockAssignment || formData.lockDates) && (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}

              {isAtRisk && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  At Risk
                </Badge>
              )}

              {/* Tags */}
              {selectedTags.map((tagId) => {
                const specialty = getSpecialtyById(tagId);
                return specialty ? (
                  <Badge
                    key={tagId}
                    variant="outline"
                    style={{
                      borderColor: specialty.color || undefined,
                      color: specialty.color || undefined,
                    }}
                    className="gap-1"
                  >
                    {specialty.name}
                    <button
                      type="button"
                      onClick={() => removeTag(tagId)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null;
              })}

              {/* Add Tag */}
              <Select onValueChange={addTag}>
                <SelectTrigger className="w-[120px] h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Add tag
                </SelectTrigger>
                <SelectContent>
                  {specialties
                    .filter((s) => !selectedTags.includes(s.id))
                    .map((specialty) => (
                      <SelectItem key={specialty.id} value={specialty.id}>
                        {specialty.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {isDirty && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDiscardDialog(true)}
                  disabled={isSaving}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Discard
                </Button>
                <Button onClick={handleSave} disabled={isSaving} size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </>
            )}
            <DocGenerationWizard initiative={initiative} />
            <DeleteInitiativeButton
              initiativeId={initiative.id}
              initiativeTitle={initiative.title}
            />
          </div>
        </div>

        {/* Unsaved Changes Indicator */}
        {isDirty && (
          <div className="mt-2 text-sm text-amber-600 flex items-center gap-1">
            <Pencil className="h-3 w-3" />
            You have unsaved changes
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Add a description..."
                className="min-h-[100px] border-transparent hover:border-input focus:border-input bg-transparent resize-none"
              />
            </CardContent>
          </Card>

          {/* Documentation */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Documentation
                </CardTitle>
                {initiative.docsGeneratedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last generated: {format(new Date(initiative.docsGeneratedAt), "MMM d, yyyy")}
                  </p>
                )}
              </div>
              <DocGenerationWizard
                initiative={initiative}
                trigger={
                  <Button variant="outline" size="sm">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate with AI
                  </Button>
                }
              />
            </CardHeader>
            <CardContent>
              <Tabs value={activeDocTab} onValueChange={(v) => setActiveDocTab(v as typeof activeDocTab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="prd">
                    <FileText className="h-4 w-4 mr-2" />
                    PRD
                  </TabsTrigger>
                  <TabsTrigger value="executive">
                    <Briefcase className="h-4 w-4 mr-2" />
                    Executive
                  </TabsTrigger>
                  <TabsTrigger value="client">
                    <Users className="h-4 w-4 mr-2" />
                    Client
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="prd" className="mt-4 space-y-4">
                  <Textarea
                    value={formData.prdContent}
                    onChange={(e) => setFormData({ ...formData, prdContent: e.target.value })}
                    placeholder="Enter PRD content in Markdown format..."
                    className="min-h-[300px] font-mono text-sm border-transparent hover:border-input focus:border-input bg-muted/30"
                  />
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={formData.prdUrl}
                      onChange={(e) => setFormData({ ...formData, prdUrl: e.target.value })}
                      placeholder="Or link to external PRD..."
                      className="border-transparent hover:border-input focus:border-input bg-transparent"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="executive" className="mt-4">
                  <Textarea
                    value={formData.executiveOverview}
                    onChange={(e) => setFormData({ ...formData, executiveOverview: e.target.value })}
                    placeholder="Executive overview content..."
                    className="min-h-[300px] border-transparent hover:border-input focus:border-input bg-muted/30"
                  />
                </TabsContent>

                <TabsContent value="client" className="mt-4">
                  <Textarea
                    value={formData.clientOverview}
                    onChange={(e) => setFormData({ ...formData, clientOverview: e.target.value })}
                    placeholder="Client-facing overview content..."
                    className="min-h-[300px] border-transparent hover:border-input focus:border-input bg-muted/30"
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              {scheduleBlocks.length > 0 ? (
                <div className="space-y-3">
                  {scheduleBlocks.map((block, index) => (
                    <div
                      key={block.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg border p-3",
                        block.isAtRisk && "border-destructive bg-destructive/5"
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {block.engineer?.name || block.squad?.name || "Unassigned"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <div className="flex items-center gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground">
                                  {block.startDate ? format(block.startDate, "MMM d") : "Start"} - {block.endDate ? format(block.endDate, "MMM d, yyyy") : "End"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <div className="p-3 space-y-3">
                                  <div>
                                    <Label className="text-xs">Start Date</Label>
                                    <Calendar
                                      mode="single"
                                      selected={block.startDate || undefined}
                                      onSelect={(date) => {
                                        const updated = [...scheduleBlocks];
                                        updated[index] = { ...updated[index], startDate: date || null };
                                        setScheduleBlocks(updated);
                                      }}
                                    />
                                  </div>
                                  <Separator />
                                  <div>
                                    <Label className="text-xs">End Date</Label>
                                    <Calendar
                                      mode="single"
                                      selected={block.endDate || undefined}
                                      onSelect={(date) => {
                                        const updated = [...scheduleBlocks];
                                        updated[index] = { ...updated[index], endDate: date || null };
                                        setScheduleBlocks(updated);
                                      }}
                                    />
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <Input
                            type="number"
                            value={block.hoursAllocated || ""}
                            onChange={(e) => {
                              const updated = [...scheduleBlocks];
                              updated[index] = { ...updated[index], hoursAllocated: parseInt(e.target.value) || 0 };
                              setScheduleBlocks(updated);
                            }}
                            className="w-16 h-8 text-right"
                          />
                          <span className="text-xs text-muted-foreground">hours</span>
                        </div>
                        {block.isAtRisk && (
                          <div className="text-sm text-destructive">
                            {block.riskReason || "At risk"}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No schedule blocks. Assign engineers above and set dates to add to the roadmap.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Assignment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Engineers</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedEngineerIds.map((engineerId, index) => {
                    const engineer = engineers.find((e) => e.id === engineerId);
                    return engineer ? (
                      <Badge
                        key={engineerId}
                        variant={index === 0 ? "default" : "secondary"}
                        className="gap-1"
                      >
                        {engineer.name}
                        {index === 0 && <span className="text-xs opacity-70">(primary)</span>}
                        <button
                          type="button"
                          onClick={() => removeEngineer(engineerId)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
                <Select onValueChange={addEngineer}>
                  <SelectTrigger className="mt-2 h-8">
                    <SelectValue placeholder="Add engineer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers
                      .filter((e) => !selectedEngineerIds.includes(e.id))
                      .map((engineer) => (
                        <SelectItem key={engineer.id} value={engineer.id}>
                          {engineer.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Squad</Label>
                <Select
                  value={selectedSquadId || "none"}
                  onValueChange={(value) => setSelectedSquadId(value === "none" ? "" : value)}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue placeholder="Select squad..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No squad</SelectItem>
                    {squads.map((squad) => (
                      <SelectItem key={squad.id} value={squad.id}>
                        {squad.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="lockAssignment"
                  checked={formData.lockAssignment}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, lockAssignment: checked })
                  }
                />
                <Label htmlFor="lockAssignment" className="text-sm flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Lock Assignment
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Release Targets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                Release Targets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Beta Release</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal mt-1 h-8",
                        !formData.betaTargetDate && "text-muted-foreground"
                      )}
                    >
                      <Rocket className="mr-2 h-4 w-4 text-blue-500" />
                      {formData.betaTargetDate
                        ? format(formData.betaTargetDate, "MMM d, yyyy")
                        : "Not set"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.betaTargetDate || undefined}
                      onSelect={(date) => handleBetaDateChange(date || null)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Production Release</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal mt-1 h-8",
                        !formData.masterTargetDate && "text-muted-foreground"
                      )}
                    >
                      <Rocket className="mr-2 h-4 w-4 text-green-500" />
                      {formData.masterTargetDate
                        ? format(formData.masterTargetDate, "MMM d, yyyy")
                        : "Not set"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.masterTargetDate || undefined}
                      onSelect={(date) => setFormData({ ...formData, masterTargetDate: date || null })}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* Effort & Timing */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Effort & Timing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Effort Estimate</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formData.effortEstimate || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        effortEstimate: e.target.value ? parseFloat(e.target.value) : 1,
                      })
                    }
                    className="h-8 w-20"
                  />
                  <span className="text-sm text-muted-foreground">weeks</span>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Deadline</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal mt-1 h-8",
                        !formData.deadline && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.deadline
                        ? format(formData.deadline, "MMM d, yyyy")
                        : "Not set"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.deadline || undefined}
                      onSelect={(date) => setFormData({ ...formData, deadline: date || null })}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Visibility</Label>
                <Select
                  value={formData.visibilityLevel}
                  onValueChange={(value) => setFormData({ ...formData, visibilityLevel: value as VisibilityLevel })}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIBILITY_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Date Locking */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Date Locking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="lockDates"
                  checked={formData.lockDates}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, lockDates: checked })
                  }
                />
                <Label htmlFor="lockDates" className="text-sm">Lock Date Range</Label>
              </div>

              {formData.lockDates && (
                <div className="space-y-3 pt-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Locked Start</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal mt-1 h-8",
                            !formData.lockedStart && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.lockedStart
                            ? format(formData.lockedStart, "MMM d, yyyy")
                            : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.lockedStart || undefined}
                          onSelect={(date) => setFormData({ ...formData, lockedStart: date || null })}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Locked End</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal mt-1 h-8",
                            !formData.lockedEnd && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.lockedEnd
                            ? format(formData.lockedEnd, "MMM d, yyyy")
                            : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.lockedEnd || undefined}
                          onSelect={(date) => setFormData({ ...formData, lockedEnd: date || null })}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dependencies */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Dependencies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedDependencies.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Depends on</Label>
                  <div className="space-y-1 mt-1">
                    {selectedDependencies.map((depId) => {
                      const dep = getInitiativeById(depId);
                      return dep ? (
                        <div
                          key={depId}
                          className="flex items-center justify-between text-sm group"
                        >
                          <Link
                            href={`/initiatives/${dep.id}`}
                            className="hover:underline truncate flex-1"
                          >
                            {dep.title}
                          </Link>
                          <button
                            type="button"
                            onClick={() => removeDependency(depId)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {availableInitiatives.length > 0 && (
                <Select onValueChange={addDependency}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Add dependency..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInitiatives.map((init) => (
                      <SelectItem key={init.id} value={init.id}>
                        {init.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {initiative.dependents.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Blocking</Label>
                  <div className="space-y-1 mt-1">
                    {initiative.dependents.map((dep) => (
                      <Link
                        key={dep.id}
                        href={`/initiatives/${dep.dependent.id}`}
                        className="block text-sm hover:underline"
                      >
                        {dep.dependent.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Clients */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Clients
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {selectedClientIds.map((clientId) => {
                  const client = getClientById(clientId);
                  return client ? (
                    <Badge key={clientId} variant="secondary" className="gap-1">
                      {client.name}
                      <button
                        type="button"
                        onClick={() => removeExistingClient(clientId)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
                {newClientNames.map((name) => (
                  <Badge key={name} variant="default" className="gap-1">
                    {name}
                    <span className="text-xs opacity-70">(new)</span>
                    <button
                      type="button"
                      onClick={() => removeNewClient(name)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="New client name..."
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
                <Button type="button" variant="outline" size="sm" onClick={addNewClient}>
                  Add
                </Button>
              </div>

              {availableClients.length > 0 && (
                <Select onValueChange={addExistingClient}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select existing client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Source Idea */}
          {initiative.sourceIdea && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Source Idea
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/ideas/${initiative.sourceIdea.id}`}
                  className="block hover:bg-muted/50 -mx-4 -my-2 px-4 py-2 rounded-lg"
                >
                  <p className="font-medium">{initiative.sourceIdea.title}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {initiative.sourceIdea.problemStatement}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Submitted by {initiative.sourceIdea.submitter.name || initiative.sourceIdea.submitter.email}
                  </p>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Discard Changes Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

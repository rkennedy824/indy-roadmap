"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, CalendarIcon, Lock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type InitiativeWithRelations = Initiative & {
  tags: (InitiativeTag & { specialty: Specialty })[];
  dependencies: (InitiativeDependency & { dependency: Initiative })[];
  clientAccess?: (ClientInitiativeAccess & { client: Client })[];
  scheduledBlocks?: ScheduledBlock[];
  assignedEngineers?: (InitiativeAssignment & { engineer: Engineer | null })[];
};

type SquadWithMembers = Squad & { members: (SquadMember & { engineer: Engineer })[] };

interface InitiativeFormProps {
  initiative?: InitiativeWithRelations;
  specialties: Specialty[];
  engineers: Engineer[];
  squads: SquadWithMembers[];
  allInitiatives: Initiative[];
  clients: Client[];
  defaultScheduleDate?: string;
  defaultScheduleEndDate?: string;
  defaultEngineerId?: string;
}

const STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PROPOSED", label: "Proposed" },
  { value: "APPROVED", label: "Approved" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DEV_COMPLETE", label: "Dev Complete" },
  { value: "DONE", label: "Done" },
  { value: "BLOCKED", label: "Blocked" },
];

const VISIBILITY_LEVELS = [
  { value: "INTERNAL", label: "Internal Only" },
  { value: "CLIENT_VISIBLE", label: "Client Visible" },
];

export function InitiativeForm({
  initiative,
  specialties,
  engineers,
  squads,
  allInitiatives,
  clients,
  defaultScheduleDate,
  defaultScheduleEndDate,
  defaultEngineerId,
}: InitiativeFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [selectedSquadId, setSelectedSquadId] = useState<string>(initiative?.assignedSquadId || "");

  const [formData, setFormData] = useState({
    title: initiative?.title || "",
    description: initiative?.description || "",
    prdContent: initiative?.prdContent || "",
    prdUrl: initiative?.prdUrl || "",
    status: initiative?.status || "DRAFT",
    priority: initiative?.priority || 0,
    effortEstimate: initiative?.effortEstimate ?? 1,
    deadline: initiative?.deadline ? new Date(initiative.deadline) : null,
    visibilityLevel: initiative?.visibilityLevel || "INTERNAL",
    lockAssignment: initiative?.lockAssignment || false,
    lockDates: initiative?.lockDates || false,
    lockedStart: initiative?.lockedStart ? new Date(initiative.lockedStart) : null,
    lockedEnd: initiative?.lockedEnd ? new Date(initiative.lockedEnd) : null,
  });

  // Multiple engineers support
  const [selectedEngineerIds, setSelectedEngineerIds] = useState<string[]>(
    initiative?.assignedEngineers?.map((a) => a.engineerId).filter((id): id is string => id !== null) ||
    (defaultEngineerId ? [defaultEngineerId] : (initiative?.assignedEngineerId ? [initiative.assignedEngineerId] : []))
  );

  const [selectedTags, setSelectedTags] = useState<string[]>(
    initiative?.tags.map((t) => t.specialtyId) || []
  );

  const [selectedDependencies, setSelectedDependencies] = useState<string[]>(
    initiative?.dependencies.map((d) => d.dependencyId) || []
  );

  // Clients - track both existing client IDs and new client names
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>(
    initiative?.clientAccess?.map((ca) => ca.clientId) || []
  );
  const [newClientNames, setNewClientNames] = useState<string[]>([]);

  // Schedule - for creating/updating scheduled blocks
  const existingBlock = initiative?.scheduledBlocks?.[0];

  // Parse date string as local date (not UTC) to avoid timezone shifts
  const parseLocalDate = (dateStr: string | undefined | null): Date | null => {
    if (!dateStr) return null;
    // For YYYY-MM-DD format, parse as local date
    if (dateStr.length === 10 && dateStr.includes("-")) {
      const [year, month, day] = dateStr.split("-").map(Number);
      return new Date(year, month - 1, day);
    }
    // For ISO strings from database, extract just the date part
    const date = new Date(dateStr);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const [scheduleStart, setScheduleStart] = useState<Date | null>(
    existingBlock?.startDate
      ? parseLocalDate(existingBlock.startDate.toString())
      : parseLocalDate(defaultScheduleDate)
  );
  const [scheduleEnd, setScheduleEnd] = useState<Date | null>(
    existingBlock?.endDate
      ? parseLocalDate(existingBlock.endDate.toString())
      : parseLocalDate(defaultScheduleEndDate)
  );
  const [scheduleHours, setScheduleHours] = useState<number | null>(
    existingBlock?.hoursAllocated || null
  );

  // Release target dates
  const [betaTargetDate, setBetaTargetDate] = useState<Date | null>(
    initiative?.betaTargetDate ? parseLocalDate(initiative.betaTargetDate.toString()) : null
  );
  const [masterTargetDate, setMasterTargetDate] = useState<Date | null>(
    initiative?.masterTargetDate ? parseLocalDate(initiative.masterTargetDate.toString()) : null
  );

  // Auto-calculate master date when beta is set (1 week after beta by default)
  const handleBetaDateChange = (date: Date | null) => {
    setBetaTargetDate(date);
    if (date && !masterTargetDate) {
      const defaultMaster = new Date(date);
      defaultMaster.setDate(defaultMaster.getDate() + 7);
      setMasterTargetDate(defaultMaster);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Format date as YYYY-MM-DD to avoid timezone issues
      const formatDateOnly = (date: Date | null): string | null => {
        if (!date) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const payload = {
        ...formData,
        deadline: formatDateOnly(formData.deadline),
        lockedStart: formatDateOnly(formData.lockedStart),
        lockedEnd: formatDateOnly(formData.lockedEnd),
        assignedEngineerIds: selectedEngineerIds,
        assignedSquadId: selectedSquadId || null,
        tags: selectedTags,
        dependencies: selectedDependencies,
        existingClientIds: selectedClientIds,
        newClientNames: newClientNames,
        // Schedule data
        scheduleStart: formatDateOnly(scheduleStart),
        scheduleEnd: formatDateOnly(scheduleEnd),
        scheduleHours: scheduleHours,
        // Release target dates
        betaTargetDate: formatDateOnly(betaTargetDate),
        masterTargetDate: formatDateOnly(masterTargetDate),
      };

      const response = await fetch(
        initiative ? `/api/initiatives/${initiative.id}` : "/api/initiatives",
        {
          method: initiative ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) throw new Error("Failed to save initiative");

      router.push("/initiatives");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to save initiative");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addTag = (specialtyId: string) => {
    if (!selectedTags.includes(specialtyId)) {
      setSelectedTags([...selectedTags, specialtyId]);
    }
  };

  const removeTag = (specialtyId: string) => {
    setSelectedTags(selectedTags.filter((id) => id !== specialtyId));
  };

  const addDependency = (initiativeId: string) => {
    if (!selectedDependencies.includes(initiativeId)) {
      setSelectedDependencies([...selectedDependencies, initiativeId]);
    }
  };

  const removeDependency = (initiativeId: string) => {
    setSelectedDependencies(selectedDependencies.filter((id) => id !== initiativeId));
  };

  const getSpecialtyById = (id: string) => specialties.find((s) => s.id === id);
  const getInitiativeById = (id: string) => allInitiatives.find((i) => i.id === id);
  const getClientById = (id: string) => clients.find((c) => c.id === id);

  const availableInitiatives = allInitiatives.filter(
    (i) => i.id !== initiative?.id && !selectedDependencies.includes(i.id)
  );

  const availableClients = clients.filter(
    (c) => !selectedClientIds.includes(c.id)
  );

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
      // Check if client with this name already exists
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as typeof formData.status })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority (0-100)</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                max="100"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priority: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="effortEstimate">Effort Estimate (weeks)</Label>
              <Input
                id="effortEstimate"
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
              />
            </div>
            <div className="space-y-2">
              <Label>Deadline</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.deadline && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.deadline
                      ? format(formData.deadline, "PPP")
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.deadline || undefined}
                    onSelect={(date) =>
                      setFormData({ ...formData, deadline: date || null })
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility</Label>
            <Select
              value={formData.visibilityLevel}
              onValueChange={(value) =>
                setFormData({ ...formData, visibilityLevel: value as typeof formData.visibilityLevel })
              }
            >
              <SelectTrigger>
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

      <Card>
        <CardHeader>
          <CardTitle>PRD Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prdContent">PRD (Markdown)</Label>
            <Textarea
              id="prdContent"
              value={formData.prdContent}
              onChange={(e) =>
                setFormData({ ...formData, prdContent: e.target.value })
              }
              rows={10}
              placeholder="Enter PRD content in Markdown format..."
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prdUrl">Or External PRD Link</Label>
            <Input
              id="prdUrl"
              type="url"
              value={formData.prdUrl}
              onChange={(e) =>
                setFormData({ ...formData, prdUrl: e.target.value })
              }
              placeholder="https://..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Work Types (Tags)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedTags.map((tagId) => {
              const specialty = getSpecialtyById(tagId);
              return specialty ? (
                <Badge
                  key={tagId}
                  style={{ backgroundColor: specialty.color || undefined }}
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
          </div>
          <Select onValueChange={addTag}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Add work type..." />
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Assigned Engineers</Label>
            <div className="flex flex-wrap gap-2 mb-2">
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
                      onClick={() =>
                        setSelectedEngineerIds(selectedEngineerIds.filter((id) => id !== engineerId))
                      }
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null;
              })}
            </div>
            <Select
              onValueChange={(value) => {
                if (!selectedEngineerIds.includes(value)) {
                  setSelectedEngineerIds([...selectedEngineerIds, value]);
                }
              }}
            >
              <SelectTrigger className="w-[200px]">
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
            <p className="text-xs text-muted-foreground">
              The first engineer is the primary owner. Drag to reorder (or remove and re-add).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Assigned Squad</Label>
            {selectedSquadId && (
              <div className="flex flex-wrap gap-2 mb-2">
                {(() => {
                  const squad = squads.find((s) => s.id === selectedSquadId);
                  return squad ? (
                    <Badge
                      style={{ backgroundColor: squad.color || undefined }}
                      className="gap-1"
                    >
                      {squad.name}
                      {squad.members.length > 0 && (
                        <span className="text-xs opacity-70">
                          ({squad.members.map((m) => m.engineer.name).join(", ")})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedSquadId("")}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })()}
              </div>
            )}
            <Select
              value={selectedSquadId || "none"}
              onValueChange={(value) => setSelectedSquadId(value === "none" ? "" : value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Assign to squad..." />
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
            <p className="text-xs text-muted-foreground">
              Optionally assign to a squad. You can assign both individual engineers and a squad.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="lockAssignment"
                checked={formData.lockAssignment}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, lockAssignment: checked })
                }
              />
              <Label htmlFor="lockAssignment" className="flex items-center gap-1">
                <Lock className="h-4 w-4" />
                Lock Assignment
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set the dates when work will be done on this initiative. This will show on the roadmap.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !scheduleStart && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduleStart
                      ? format(scheduleStart, "PPP")
                      : "Pick start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={scheduleStart || undefined}
                    onSelect={(date) => setScheduleStart(date || null)}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !scheduleEnd && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduleEnd
                      ? format(scheduleEnd, "PPP")
                      : "Pick end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={scheduleEnd || undefined}
                    onSelect={(date) => setScheduleEnd(date || null)}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduleHours">Hours Allocated</Label>
              <Input
                id="scheduleHours"
                type="number"
                min="0"
                value={scheduleHours || ""}
                onChange={(e) =>
                  setScheduleHours(e.target.value ? parseInt(e.target.value) : null)
                }
                placeholder="e.g., 40"
              />
            </div>
          </div>
          {scheduleStart && scheduleEnd && selectedEngineerIds.length === 0 && !selectedSquadId && (
            <p className="text-sm text-amber-600">
              Note: Assign an engineer or squad above for the schedule to appear on the roadmap.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Release Targets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Target dates for beta and production releases. These are shown to clients and on the initiatives overview.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Beta Release Target</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !betaTargetDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {betaTargetDate
                      ? format(betaTargetDate, "PPP")
                      : "Pick beta date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={betaTargetDate || undefined}
                    onSelect={(date) => handleBetaDateChange(date || null)}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Production Release Target</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !masterTargetDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {masterTargetDate
                      ? format(masterTargetDate, "PPP")
                      : "Pick production date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={masterTargetDate || undefined}
                    onSelect={(date) => setMasterTargetDate(date || null)}
                  />
                </PopoverContent>
              </Popover>
              {betaTargetDate && !masterTargetDate && (
                <p className="text-xs text-muted-foreground">
                  Defaults to 1 week after beta if not set
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Date Locking</CardTitle>
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
            <Label htmlFor="lockDates" className="flex items-center gap-1">
              <Lock className="h-4 w-4" />
              Lock Date Range
            </Label>
          </div>
          {formData.lockDates && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Locked Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.lockedStart && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.lockedStart
                        ? format(formData.lockedStart, "PPP")
                        : "Pick start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.lockedStart || undefined}
                      onSelect={(date) =>
                        setFormData({ ...formData, lockedStart: date || null })
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Locked End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.lockedEnd && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.lockedEnd
                        ? format(formData.lockedEnd, "PPP")
                        : "Pick end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.lockedEnd || undefined}
                      onSelect={(date) =>
                        setFormData({ ...formData, lockedEnd: date || null })
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dependencies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select initiatives that must be completed before this one.
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedDependencies.map((depId) => {
              const dep = getInitiativeById(depId);
              return dep ? (
                <Badge key={depId} variant="outline" className="gap-1">
                  {dep.title}
                  <button
                    type="button"
                    onClick={() => removeDependency(depId)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ) : null;
            })}
          </div>
          {availableInitiatives.length > 0 && (
            <Select onValueChange={addDependency}>
              <SelectTrigger className="w-[300px]">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Associate clients with this initiative. Type a new client name or select from existing.
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
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
              placeholder="Type client name..."
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNewClient();
                }
              }}
              className="w-[250px]"
            />
            <Button type="button" variant="outline" onClick={addNewClient}>
              Add
            </Button>
          </div>
          {availableClients.length > 0 && (
            <Select onValueChange={addExistingClient}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Or select existing client..." />
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

      <div className="flex gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : initiative
            ? "Update Initiative"
            : "Create Initiative"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState, useMemo } from "react";
import {
  Initiative,
  InitiativeTag,
  Specialty,
  ScheduledBlock,
  ClientInitiativeAccess,
  Client,
  Engineer,
  Squad,
  InitiativeAssignment,
  UnavailabilityBlock,
  UnavailabilityType,
} from "@prisma/client";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { DateRangeSelector } from "@/components/ui/date-range-selector";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Sparkles,
  Briefcase,
  Users,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  format,
  startOfQuarter,
  endOfQuarter,
  eachDayOfInterval,
  isSameDay,
} from "date-fns";

// Convert a UTC date to local date (preserving the date, not the instant)
function toLocalDate(date: Date | string): Date {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

type InitiativeWithRelations = Initiative & {
  tags: (InitiativeTag & { specialty: Specialty })[];
  scheduledBlocks: ScheduledBlock[];
  clientAccess?: (ClientInitiativeAccess & { client: Client })[];
  assignedEngineer?: Engineer | null;
  assignedSquad?: Squad | null;
  assignedEngineers?: (InitiativeAssignment & { engineer?: Engineer | null; squad?: Squad | null })[];
};

type UnavailabilityWithEngineer = UnavailabilityBlock & {
  engineer: Engineer;
};

interface ExecutiveRoadmapViewProps {
  initiatives: InitiativeWithRelations[];
  specialties: Specialty[];
  executiveBrief?: string | null;
  briefGeneratedAt?: Date | null;
  unavailability?: UnavailabilityWithEngineer[];
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
}

const UNAVAILABILITY_LABELS: Record<UnavailabilityType, string> = {
  PTO: "PTO",
  TRAVEL: "Travel",
  SICK: "Sick",
  HOLIDAY: "Holiday",
  OTHER: "Unavailable",
};

const UNAVAILABILITY_COLORS: Record<UnavailabilityType, string> = {
  PTO: "bg-orange-400",
  TRAVEL: "bg-purple-400",
  SICK: "bg-red-400",
  HOLIDAY: "bg-blue-400",
  OTHER: "bg-gray-400",
};

const CELL_WIDTH = 40;
const ROW_HEIGHT = 60;

const STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  IN_PROGRESS: "In Progress",
  DEV_COMPLETE: "Dev Complete",
  DONE: "Completed",
  BLOCKED: "Blocked",
};

const STATUS_COLORS: Record<string, string> = {
  PROPOSED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  DEV_COMPLETE: "bg-purple-100 text-purple-800",
  DONE: "bg-emerald-100 text-emerald-800",
  BLOCKED: "bg-red-100 text-red-800",
};

export function ExecutiveRoadmapView({
  initiatives,
  specialties,
  executiveBrief,
  briefGeneratedAt,
  unavailability = [],
  initialStartDate,
  initialEndDate,
}: ExecutiveRoadmapViewProps) {
  const [selectedInitiative, setSelectedInitiative] =
    useState<InitiativeWithRelations | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [inProgressExpanded, setInProgressExpanded] = useState(false);
  const [startDate, setStartDate] = useState(() =>
    initialStartDate ? new Date(initialStartDate) : startOfQuarter(new Date())
  );
  const [endDate, setEndDate] = useState(() =>
    initialEndDate ? new Date(initialEndDate) : endOfQuarter(new Date())
  );

  const handleRangeChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  // Extract unique clients from initiatives
  const clients = useMemo(() => {
    const clientMap = new Map<string, Client>();
    initiatives.forEach((initiative) => {
      initiative.clientAccess?.forEach((access) => {
        if (!clientMap.has(access.client.id)) {
          clientMap.set(access.client.id, access.client);
        }
      });
    });
    return Array.from(clientMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [initiatives]);

  const days = useMemo(() => {
    // Convert UTC dates to local dates to avoid timezone issues
    const localStart = toLocalDate(startDate);
    const localEnd = toLocalDate(endDate);
    return eachDayOfInterval({ start: localStart, end: localEnd }).filter(
      (day) => day.getDay() !== 0 && day.getDay() !== 6
    );
  }, [startDate, endDate]);

  // Find today's index in the days array
  const todayIndex = useMemo(() => {
    const today = new Date();
    return days.findIndex(day => isSameDay(day, today));
  }, [days]);

  const filteredInitiatives = useMemo(() => {
    let filtered = initiatives;

    // Status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter((i) => statusFilter.includes(i.status));
    }

    // Specialty filter
    if (specialtyFilter.length > 0) {
      filtered = filtered.filter((i) =>
        i.tags.some((t) => specialtyFilter.includes(t.specialtyId))
      );
    }

    // Client filter
    if (clientFilter.length > 0) {
      filtered = filtered.filter((i) =>
        i.clientAccess?.some((access) => clientFilter.includes(access.clientId))
      );
    }

    // Sort by earliest scheduled block start date
    filtered = [...filtered].sort((a, b) => {
      const aStart = a.scheduledBlocks[0]?.startDate;
      const bStart = b.scheduledBlocks[0]?.startDate;

      // Initiatives without scheduled blocks go to the end
      if (!aStart && !bStart) return 0;
      if (!aStart) return 1;
      if (!bStart) return -1;

      return new Date(aStart).getTime() - new Date(bStart).getTime();
    });

    return filtered;
  }, [initiatives, statusFilter, specialtyFilter, clientFilter]);

  // Find the weekday index for a given date (converted to local date)
  const getWeekdayIndex = (date: Date) => {
    const localDate = toLocalDate(date);
    const idx = days.findIndex(day => isSameDay(day, localDate));
    if (idx !== -1) return idx;
    // If exact date not found, find closest weekday
    const closestIdx = days.findIndex(day => day >= localDate);
    return closestIdx === -1 ? days.length - 1 : Math.max(0, closestIdx);
  };

  const getBlockStyle = (block: ScheduledBlock) => {
    // Convert UTC dates to local dates to avoid timezone issues
    const blockStart = toLocalDate(block.startDate);
    const blockEnd = toLocalDate(block.endDate);

    // Find the index in the weekday-only days array
    let startIdx = days.findIndex(day => day >= blockStart);
    if (startIdx === -1) startIdx = days.length; // Block starts after visible range

    let endIdx = days.findIndex(day => day > blockEnd);
    if (endIdx === -1) endIdx = days.length; // Block ends after visible range
    else endIdx = endIdx - 1; // Go back to last day that's <= blockEnd

    // Clamp to valid range
    startIdx = Math.max(0, startIdx);
    endIdx = Math.max(startIdx, Math.min(days.length - 1, endIdx));

    const width = Math.max(1, endIdx - startIdx + 1) * CELL_WIDTH - 4;
    const left = startIdx * CELL_WIDTH + 2;

    return { left, width };
  };

  const getTagColor = (initiative: InitiativeWithRelations) => {
    const firstTag = initiative.tags[0];
    return firstTag?.specialty.color || "#6B7280";
  };

  // Calculate summary stats
  const stats = useMemo(() => {
    const inProgress = initiatives.filter((i) => i.status === "IN_PROGRESS").length;
    const planned = initiatives.filter((i) =>
      ["APPROVED", "PROPOSED"].includes(i.status)
    ).length;
    const completed = initiatives.filter((i) => i.status === "DONE").length;
    return { inProgress, planned, completed, total: initiatives.length };
  }, [initiatives]);

  // Get in-progress initiatives for the summary section
  const inProgressInitiatives = useMemo(() => {
    return initiatives.filter((i) => i.status === "IN_PROGRESS");
  }, [initiatives]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Briefcase className="h-5 w-5" />
                </div>
                <span className="text-xl font-semibold">Executive Roadmap</span>
              </div>
              <p className="text-muted-foreground">
                Strategic overview of engineering initiatives
              </p>
            </div>
            <div className="text-right">
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">In Progress: </span>
                  <span className="font-semibold">{stats.inProgress}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Planned: </span>
                  <span className="font-semibold">{stats.planned}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed: </span>
                  <span className="font-semibold">{stats.completed}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {format(startDate, "MMM d")} - {format(endDate, "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Executive Brief */}
      {executiveBrief && (
        <div className="border-b bg-muted/20">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Executive Summary
                </CardTitle>
                {briefGeneratedAt && (
                  <p className="text-sm text-muted-foreground">
                    Generated {format(new Date(briefGeneratedAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert prose-p:text-muted-foreground prose-p:leading-relaxed prose-headings:text-foreground prose-strong:text-foreground">
                  <ReactMarkdown>{executiveBrief}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* What's in Progress */}
      {inProgressInitiatives.length > 0 && (
        <div className="border-b bg-muted/20">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Card>
              <CardHeader
                className="pb-3 cursor-pointer select-none"
                onClick={() => setInProgressExpanded(!inProgressExpanded)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    What&apos;s in Progress
                    <span className="text-sm font-normal text-muted-foreground">
                      ({inProgressInitiatives.length})
                    </span>
                  </CardTitle>
                  {inProgressExpanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              {inProgressExpanded && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {inProgressInitiatives.map((init) => {
                      const clients = init.clientAccess?.map(a => a.client.name) || [];
                      const clientNote = clients.length > 0 ? ` (${clients.join(", ")})` : "";
                      // Get first sentence as a succinct summary
                      const fullText = init.executiveOverview || init.description || "";
                      const firstSentence = fullText.split(/[.!?]\s/)[0];
                      const summary = firstSentence ? (firstSentence.endsWith('.') ? firstSentence : firstSentence + ".") : "No description";
                      return (
                        <div
                          key={init.id}
                          className="flex gap-3 cursor-pointer hover:bg-muted/50 rounded px-2 py-2 -mx-2"
                          onClick={() => setSelectedInitiative(init)}
                        >
                          <div
                            className="w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: getTagColor(init) }}
                          />
                          <p className="text-sm">
                            <span className="font-medium">{init.title}</span>
                            {clientNote}
                            {" — "}
                            <span className="text-muted-foreground">{summary}</span>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="border-b bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MultiSelectFilter
              options={[
                { value: "IN_PROGRESS", label: "In Progress" },
                { value: "PROPOSED", label: "Proposed" },
                { value: "APPROVED", label: "Approved" },
                { value: "DONE", label: "Completed" },
                { value: "BLOCKED", label: "Blocked" },
              ]}
              selected={statusFilter}
              onChange={setStatusFilter}
              placeholder="All Statuses"
              className="w-[150px]"
            />
            <MultiSelectFilter
              options={specialties.map((s) => ({ value: s.id, label: s.name, color: s.color || undefined }))}
              selected={specialtyFilter}
              onChange={setSpecialtyFilter}
              placeholder="All Types"
              className="w-[150px]"
            />
            <MultiSelectFilter
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
              selected={clientFilter}
              onChange={setClientFilter}
              placeholder="All Clients"
              className="w-[180px]"
              searchable
            />
          </div>
          <DateRangeSelector
            startDate={startDate}
            endDate={endDate}
            onRangeChange={handleRangeChange}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ScrollArea className="w-full">
          <div className="min-w-max">
            {/* Timeline Header */}
            <div className="flex border rounded-t-lg">
              <div className="w-[300px] shrink-0 p-3 border-r font-medium bg-muted sticky left-0 z-10">
                Initiative
              </div>
              <div className="flex">
                {days.map((day, i) => (
                  <div
                    key={i}
                    className="text-center text-xs border-r"
                    style={{ width: CELL_WIDTH }}
                  >
                    <div className="font-medium pt-1">{format(day, "EEE")}</div>
                    <div className="text-muted-foreground pb-1">
                      {format(day, "d")}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Initiative Rows with Today indicator */}
            <div className="relative">
              {/* Today indicator line */}
              {todayIndex >= 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none"
                  style={{
                    left: 300 + todayIndex * CELL_WIDTH + CELL_WIDTH / 2,
                  }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
                </div>
              )}

            {filteredInitiatives.map((initiative) => (
              <div
                key={initiative.id}
                className="flex border-x border-b hover:bg-muted/20 cursor-pointer"
                onClick={() => setSelectedInitiative(initiative)}
              >
                <div className="w-[300px] shrink-0 p-3 border-r flex flex-col justify-center sticky left-0 z-10 bg-background">
                  <div className="font-medium truncate">
                    {initiative.title}
                  </div>
                  {(() => {
                    // Collect all assignees
                    const assignees: string[] = [];
                    if (initiative.assignedSquad) {
                      assignees.push(initiative.assignedSquad.name);
                    }
                    if (initiative.assignedEngineer) {
                      assignees.push(initiative.assignedEngineer.name);
                    }
                    initiative.assignedEngineers?.forEach((a) => {
                      if (a.squad && !assignees.includes(a.squad.name)) {
                        assignees.push(a.squad.name);
                      }
                      if (a.engineer && !assignees.includes(a.engineer.name)) {
                        assignees.push(a.engineer.name);
                      }
                    });

                    if (assignees.length === 0) return null;

                    return (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {assignees.join(", ")}
                      </div>
                    );
                  })()}
                </div>
                <div className="relative flex" style={{ height: ROW_HEIGHT }}>
                  {/* Day cells */}
                  {days.map((day, i) => (
                    <div
                      key={i}
                      className={`border-r ${
                        day.getDay() === 0 || day.getDay() === 6
                          ? "bg-muted/20"
                          : ""
                      }`}
                      style={{ width: CELL_WIDTH }}
                    />
                  ))}
                  {/* Beta release marker */}
                  {initiative.betaTargetDate && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-blue-500"
                      style={{
                        left:
                          getWeekdayIndex(new Date(initiative.betaTargetDate)) *
                            CELL_WIDTH +
                          CELL_WIDTH / 2,
                      }}
                      title="Beta Release"
                    />
                  )}
                  {/* Master release marker */}
                  {initiative.masterTargetDate && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-green-500"
                      style={{
                        left:
                          getWeekdayIndex(new Date(initiative.masterTargetDate)) *
                            CELL_WIDTH +
                          CELL_WIDTH / 2,
                      }}
                      title="Production Release"
                    />
                  )}
                  {/* Scheduled blocks */}
                  {initiative.scheduledBlocks.map((block) => {
                    const style = getBlockStyle(block);
                    return (
                      <div
                        key={block.id}
                        className="absolute top-3 h-8 rounded-md text-white text-xs font-medium px-2 truncate flex items-center"
                        style={{
                          left: style.left,
                          width: style.width,
                          backgroundColor: getTagColor(initiative),
                        }}
                      >
                        <span className="truncate">
                          {STATUS_LABELS[initiative.status]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {filteredInitiatives.length === 0 && (
              <div className="border-x border-b p-8 text-center text-muted-foreground">
                No initiatives match the current filters.
              </div>
            )}

            {/* Unavailability Section */}
            {unavailability.length > 0 && (
              <>
                <div className="flex border-x border-b bg-muted/50">
                  <div className="w-[300px] shrink-0 p-2 border-r font-medium text-sm text-muted-foreground sticky left-0 z-10 bg-muted/50">
                    Team Availability
                  </div>
                  <div className="flex-1" />
                </div>
                {unavailability.map((block) => {
                  // Convert UTC dates to local dates
                  const blockStart = toLocalDate(block.startDate);
                  const blockEnd = toLocalDate(block.endDate);

                  // Find the index in the weekday-only days array
                  let startIdx = days.findIndex(day => day >= blockStart);
                  if (startIdx === -1) startIdx = days.length;

                  let endIdx = days.findIndex(day => day > blockEnd);
                  if (endIdx === -1) endIdx = days.length;
                  else endIdx = endIdx - 1;

                  // Skip if completely outside visible range
                  if (endIdx < 0 || startIdx >= days.length) return null;

                  startIdx = Math.max(0, startIdx);
                  endIdx = Math.max(startIdx, Math.min(days.length - 1, endIdx));

                  const width = Math.max(1, endIdx - startIdx + 1) * CELL_WIDTH - 4;
                  const left = startIdx * CELL_WIDTH + 2;

                  return (
                    <div
                      key={block.id}
                      className="flex border-x border-b"
                    >
                      <div className="w-[300px] shrink-0 p-3 border-r flex flex-col justify-center sticky left-0 z-10 bg-background">
                        <div className="font-medium truncate text-sm">
                          {block.engineer.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {UNAVAILABILITY_LABELS[block.type]}
                          {block.reason && ` - ${block.reason}`}
                        </div>
                      </div>
                      <div className="relative flex" style={{ height: ROW_HEIGHT }}>
                        {days.map((day, i) => (
                          <div
                            key={i}
                            className={`border-r ${
                              day.getDay() === 0 || day.getDay() === 6
                                ? "bg-muted/20"
                                : ""
                            }`}
                            style={{ width: CELL_WIDTH }}
                          />
                        ))}
                        <div
                          className={`absolute top-3 h-8 rounded-md text-white text-xs font-medium px-2 truncate flex items-center ${UNAVAILABILITY_COLORS[block.type]}`}
                          style={{ left, width }}
                        >
                          <span className="truncate">
                            {UNAVAILABILITY_LABELS[block.type]}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Detail Sheet */}
      <Sheet
        open={!!selectedInitiative}
        onOpenChange={() => setSelectedInitiative(null)}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedInitiative && (
            <div className="px-6 py-2">
              <SheetHeader className="mb-4">
                <SheetTitle className="text-xl pr-8">{selectedInitiative.title}</SheetTitle>
                <SheetDescription>
                  <Badge
                    variant="secondary"
                    className={STATUS_COLORS[selectedInitiative.status] || ""}
                  >
                    {STATUS_LABELS[selectedInitiative.status]}
                  </Badge>
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6">
                {/* Release Schedule - at the top for quick visibility */}
                {(selectedInitiative.betaTargetDate ||
                  selectedInitiative.masterTargetDate) && (
                  <div>
                    <h4 className="font-medium mb-2 text-sm">Target Release Dates</h4>
                    <div className="border rounded-lg px-3 py-2 space-y-1 bg-muted/30">
                      {selectedInitiative.betaTargetDate && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <Rocket className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">Beta Release</span>
                          </div>
                          <span className="text-sm font-medium">
                            {format(
                              new Date(selectedInitiative.betaTargetDate),
                              "MMMM d, yyyy"
                            )}
                          </span>
                        </div>
                      )}
                      {selectedInitiative.masterTargetDate && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <Rocket className="h-4 w-4 text-green-500" />
                            <span className="font-medium">Production Release</span>
                          </div>
                          <span className="text-sm font-medium">
                            {format(
                              new Date(selectedInitiative.masterTargetDate),
                              "MMMM d, yyyy"
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Impacted Clients */}
                {selectedInitiative.clientAccess && selectedInitiative.clientAccess.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 text-sm flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Impacted Clients
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedInitiative.clientAccess.map((access) => (
                        <Badge key={access.id} variant="secondary" className="text-xs">
                          {access.client.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Executive Overview */}
                {selectedInitiative.executiveOverview ? (
                  <div>
                    <h4 className="font-semibold text-base mb-3 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Executive Overview
                    </h4>
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-base prose-headings:font-semibold prose-headings:mt-5 prose-headings:mb-2 prose-p:text-foreground/80 prose-p:leading-relaxed prose-p:mb-3 prose-ul:my-3 prose-li:text-foreground/80 prose-li:mb-1 prose-strong:text-foreground prose-strong:font-semibold">
                      <ReactMarkdown>
                        {selectedInitiative.executiveOverview}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : selectedInitiative.description ? (
                  <div>
                    <h4 className="font-semibold text-base mb-2">Description</h4>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {selectedInitiative.description}
                    </p>
                  </div>
                ) : null}

                <div>
                  <h4 className="font-medium mb-2">Work Types</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedInitiative.tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        style={{
                          backgroundColor: tag.specialty.color || undefined,
                        }}
                      >
                        {tag.specialty.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                {selectedInitiative.effortEstimate && (
                  <div>
                    <h4 className="font-medium mb-2">Effort Estimate</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedInitiative.effortEstimate} week
                      {selectedInitiative.effortEstimate !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

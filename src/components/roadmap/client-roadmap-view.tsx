"use client";

import { useState, useMemo } from "react";
import {
  Initiative,
  InitiativeTag,
  Specialty,
  ScheduledBlock,
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
import { ChevronLeft, ChevronRight, ChevronDown, Rocket, Sparkles, Zap, Film } from "lucide-react";
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
};

interface ClientRoadmapViewProps {
  initiatives: InitiativeWithRelations[];
  specialties: Specialty[];
  clientName?: string;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
}

const CELL_WIDTH = 40;
const ROW_HEIGHT = 60;

const STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Planned",
  APPROVED: "Planned",
  IN_PROGRESS: "In Progress",
  DEV_COMPLETE: "In Progress",
  DONE: "Completed",
  BLOCKED: "On Hold",
};

export function ClientRoadmapView({
  initiatives,
  specialties,
  clientName,
  initialStartDate,
  initialEndDate,
}: ClientRoadmapViewProps) {
  const [selectedInitiative, setSelectedInitiative] =
    useState<InitiativeWithRelations | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState<string[]>([]);
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

  // Calculate stats for filter labels
  const stats = useMemo(() => {
    const inProgress = initiatives.filter((i) => i.status === "IN_PROGRESS").length;
    const planned = initiatives.filter((i) =>
      ["APPROVED", "PROPOSED"].includes(i.status)
    ).length;
    const launched = initiatives.filter((i) => i.status === "DONE").length;
    return { inProgress, planned, launched };
  }, [initiatives]);

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

    // Sort by earliest scheduled block start date
    filtered = [...filtered].sort((a, b) => {
      const aStart = a.scheduledBlocks.length > 0
        ? Math.min(...a.scheduledBlocks.map((block) => new Date(block.startDate).getTime()))
        : Infinity;
      const bStart = b.scheduledBlocks.length > 0
        ? Math.min(...b.scheduledBlocks.map((block) => new Date(block.startDate).getTime()))
        : Infinity;
      return aStart - bStart;
    });

    return filtered;
  }, [initiatives, statusFilter, specialtyFilter]);

  // Find the weekday index for a given date (converted to local date)
  const getWeekdayIndex = (date: Date) => {
    const localDate = toLocalDate(date);
    const idx = days.findIndex(day => isSameDay(day, localDate));
    if (idx !== -1) return idx;
    // If exact date not found, find closest weekday
    const closestIdx = days.findIndex(day => day >= localDate);
    return closestIdx === -1 ? days.length - 1 : Math.max(0, closestIdx);
  };

  // Get the timeline bar style for an initiative
  // For client view: extends from dev start to production release date (or dev end if no release date)
  const getInitiativeBarStyle = (initiative: InitiativeWithRelations) => {
    if (initiative.scheduledBlocks.length === 0) return null;

    // Find earliest start date from scheduled blocks
    const blockStarts = initiative.scheduledBlocks.map(b => toLocalDate(b.startDate));
    const earliestStart = new Date(Math.min(...blockStarts.map(d => d.getTime())));

    // Find the end date: use production release date if set, otherwise latest block end
    const blockEnds = initiative.scheduledBlocks.map(b => toLocalDate(b.endDate));
    const latestBlockEnd = new Date(Math.max(...blockEnds.map(d => d.getTime())));

    // Use masterTargetDate (production release) if available, otherwise fall back to block end
    const displayEnd = initiative.masterTargetDate
      ? toLocalDate(initiative.masterTargetDate)
      : initiative.betaTargetDate
        ? toLocalDate(initiative.betaTargetDate)
        : latestBlockEnd;

    // Find the index in the weekday-only days array
    let startIdx = days.findIndex(day => day >= earliestStart);
    if (startIdx === -1) startIdx = days.length;

    let endIdx = days.findIndex(day => day > displayEnd);
    if (endIdx === -1) endIdx = days.length;
    else endIdx = endIdx - 1;

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

  const getSimplifiedStatus = (status: string) => {
    return STATUS_LABELS[status] || status;
  };

  // Get in-progress initiatives for the summary section
  const inProgressInitiatives = useMemo(() => {
    return initiatives.filter((i) => i.status === "IN_PROGRESS" || i.status === "DEV_COMPLETE");
  }, [initiatives]);

  // INDY Cinema Group brand colors
  const INDY_BLUE = "#2ea3f2";
  const INDY_DARK = "#1d1d22";

  return (
    <div className="min-h-screen bg-background font-[family-name:var(--font-montserrat)]">
      {/* Header - INDY Cinema Group branded */}
      <header
        className="border-b"
        style={{ backgroundColor: INDY_DARK }}
      >
        <div className="max-w-7xl mx-auto px-4 py-5 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div
                  className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: INDY_BLUE }}
                >
                  <Film className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div>
                  <span className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                    INDY Cinema Group
                  </span>
                  <p className="text-xs sm:text-sm text-gray-400">
                    Product Roadmap
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {clientName && (
                <span
                  className="text-sm font-medium px-3 py-1 rounded-full"
                  style={{ backgroundColor: `${INDY_BLUE}20`, color: INDY_BLUE }}
                >
                  {clientName}
                </span>
              )}
              <span className="text-sm text-gray-400">
                {format(startDate, "MMM d")} - {format(endDate, "MMM d, yyyy")}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* What's In Progress Section */}
      {inProgressInitiatives.length > 0 && (
        <div
          className="border-b"
          style={{ background: `linear-gradient(135deg, ${INDY_BLUE}08 0%, ${INDY_BLUE}03 100%)` }}
        >
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Card className="border-[#2ea3f2]/30 shadow-sm">
              <CardHeader
                className="pb-3 cursor-pointer select-none"
                onClick={() => setInProgressExpanded(!inProgressExpanded)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${INDY_BLUE}15` }}
                    >
                      <Zap className="h-4 w-4" style={{ color: INDY_BLUE }} />
                    </div>
                    Currently In Development
                    <span className="text-sm font-normal text-muted-foreground">
                      ({inProgressInitiatives.length} {inProgressInitiatives.length === 1 ? 'feature' : 'features'})
                    </span>
                  </CardTitle>
                  {inProgressExpanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                {!inProgressExpanded && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Click to see what our team is actively building for you
                  </p>
                )}
              </CardHeader>
              {inProgressExpanded && (
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {inProgressInitiatives.map((init) => {
                      // Use customer-facing content first, then client overview, then internal
                      const displayTitle = init.customerFacingTitle || init.title;
                      const fullText = init.customerFacingDescription || init.clientOverview || init.description || "";
                      // Get first two sentences as a summary
                      const sentences = fullText.split(/[.!?]\s/).slice(0, 2);
                      const summary = sentences.length > 0
                        ? sentences.join(". ").trim() + (sentences[sentences.length - 1]?.endsWith('.') ? '' : '.')
                        : "More details coming soon.";

                      // Calculate expected completion from scheduled blocks
                      const latestEndDate = init.scheduledBlocks.length > 0
                        ? Math.max(...init.scheduledBlocks.map(b => new Date(b.endDate).getTime()))
                        : null;
                      const targetDate = init.masterTargetDate || init.betaTargetDate;
                      const displayDate = targetDate
                        ? format(new Date(targetDate), "MMMM yyyy")
                        : latestEndDate
                          ? format(new Date(latestEndDate), "MMMM yyyy")
                          : null;

                      return (
                        <div
                          key={init.id}
                          className="flex gap-3 cursor-pointer hover:bg-muted/50 rounded-lg px-3 py-3 -mx-3 transition-colors"
                          onClick={() => setSelectedInitiative(init)}
                        >
                          <div
                            className="w-1.5 shrink-0 rounded-full mt-1"
                            style={{ backgroundColor: getTagColor(init) }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-medium text-sm">{displayTitle}</h4>
                              {displayDate && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                                  <Rocket className="h-3 w-3" />
                                  {displayDate}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {summary}
                            </p>
                          </div>
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
                { value: "PROPOSED", label: "Planned" },
                { value: "APPROVED", label: "Planned" },
                { value: "DONE", label: "Launched" },
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
              <div className="w-[250px] shrink-0 p-3 border-r font-medium bg-muted sticky left-0 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
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
                  className="absolute top-0 bottom-0 w-0.5 z-10 pointer-events-none"
                  style={{
                    left: 250 + todayIndex * CELL_WIDTH + CELL_WIDTH / 2,
                    backgroundColor: INDY_BLUE,
                  }}
                >
                  <div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                    style={{ backgroundColor: INDY_BLUE }}
                  />
                </div>
              )}

            {filteredInitiatives.map((initiative) => (
              <div
                key={initiative.id}
                className="flex border-x border-b hover:bg-muted/20 cursor-pointer group"
                onClick={() => setSelectedInitiative(initiative)}
              >
                <div className="w-[250px] shrink-0 p-3 border-r bg-background group-hover:bg-muted sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  <div className="font-medium truncate">{initiative.customerFacingTitle || initiative.title}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {initiative.tags.slice(0, 2).map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="text-xs py-0"
                        style={{
                          borderColor: tag.specialty.color || undefined,
                          color: tag.specialty.color || undefined,
                        }}
                      >
                        {tag.specialty.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="relative flex" style={{ height: ROW_HEIGHT }}>
                  {/* Day cells */}
                  {days.map((day, i) => (
                    <div
                      key={i}
                      className="border-r"
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
                  {/* Initiative timeline bar (extends to release date for clients) */}
                  {(() => {
                    const style = getInitiativeBarStyle(initiative);
                    if (!style) return null;
                    return (
                      <div
                        className="absolute top-3 h-8 rounded-md text-white text-xs font-medium px-2 truncate flex items-center"
                        style={{
                          left: style.left,
                          width: style.width,
                          backgroundColor: getTagColor(initiative),
                        }}
                      >
                        <span className="truncate">
                          {getSimplifiedStatus(initiative.status)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}

            {filteredInitiatives.length === 0 && (
              <div className="border-x border-b p-8 text-center text-muted-foreground">
                No initiatives to display.
              </div>
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
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
          {selectedInitiative && (
            <>
              {/* Header with gradient background */}
              <div
                className="px-6 pt-8 pb-6"
                style={{
                  background: `linear-gradient(135deg, ${selectedInitiative.tags[0]?.specialty.color || '#6366f1'}15 0%, transparent 100%)`,
                }}
              >
                <SheetHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <SheetTitle className="text-xl font-semibold leading-tight pr-4">
                      {selectedInitiative.customerFacingTitle || selectedInitiative.title}
                    </SheetTitle>
                  </div>
                  <SheetDescription asChild>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="font-medium"
                        style={{
                          backgroundColor: selectedInitiative.status === "IN_PROGRESS"
                            ? "rgb(34 197 94 / 0.15)"
                            : selectedInitiative.status === "DONE"
                            ? "rgb(34 197 94 / 0.2)"
                            : undefined,
                          color: selectedInitiative.status === "IN_PROGRESS" || selectedInitiative.status === "DONE"
                            ? "rgb(22 163 74)"
                            : undefined,
                        }}
                      >
                        {getSimplifiedStatus(selectedInitiative.status)}
                      </Badge>
                      {selectedInitiative.tags.length > 0 && (
                        <div className="flex gap-1.5">
                          {selectedInitiative.tags.slice(0, 2).map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="outline"
                              className="text-xs font-normal"
                              style={{
                                borderColor: tag.specialty.color || undefined,
                                color: tag.specialty.color || undefined,
                              }}
                            >
                              {tag.specialty.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </SheetDescription>
                </SheetHeader>
              </div>

              <div className="px-6 pb-8 space-y-6">
                {/* Release Dates Card */}
                {(selectedInitiative.betaTargetDate || selectedInitiative.masterTargetDate) && (
                  <div className="rounded-xl border bg-card p-4 shadow-sm">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Target Release Timeline
                    </h4>
                    <div className="space-y-3">
                      {selectedInitiative.betaTargetDate && (
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
                            <Rocket className="h-5 w-5 text-blue-500" />
                          </div>
                          <div className="flex-1">
                            <div className="text-xs text-muted-foreground">Beta Release</div>
                            <div className="font-semibold">
                              {format(new Date(selectedInitiative.betaTargetDate), "MMMM d, yyyy")}
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedInitiative.betaTargetDate && selectedInitiative.masterTargetDate && (
                        <div className="ml-5 border-l-2 border-dashed border-muted h-2" />
                      )}
                      {selectedInitiative.masterTargetDate && (
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                            <Rocket className="h-5 w-5 text-green-500" />
                          </div>
                          <div className="flex-1">
                            <div className="text-xs text-muted-foreground">Production Release</div>
                            <div className="font-semibold">
                              {format(new Date(selectedInitiative.masterTargetDate), "MMMM d, yyyy")}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Description/Overview Card */}
                {(selectedInitiative.customerFacingDescription || selectedInitiative.clientOverview || selectedInitiative.description) && (
                  <div className="rounded-xl border bg-card p-4 shadow-sm">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      {(selectedInitiative.clientOverview && !selectedInitiative.customerFacingDescription) && <Sparkles className="h-3.5 w-3.5" />}
                      {(selectedInitiative.customerFacingDescription || selectedInitiative.clientOverview) ? "About This Feature" : "Description"}
                    </h4>
                    {(selectedInitiative.customerFacingDescription || selectedInitiative.clientOverview) ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-p:text-foreground/80 prose-p:leading-relaxed prose-p:mb-3 prose-p:text-sm prose-ul:my-2 prose-ul:text-sm prose-li:text-foreground/80 prose-li:mb-1 prose-strong:text-foreground prose-strong:font-medium">
                        <ReactMarkdown>
                          {selectedInitiative.customerFacingDescription || selectedInitiative.clientOverview || ""}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        {selectedInitiative.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Work Types - only show if there are more than already shown in header */}
                {selectedInitiative.tags.length > 2 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      All Work Types
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedInitiative.tags.map((tag) => (
                        <Badge
                          key={tag.id}
                          className="font-normal"
                          style={{
                            backgroundColor: tag.specialty.color || undefined,
                          }}
                        >
                          {tag.specialty.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

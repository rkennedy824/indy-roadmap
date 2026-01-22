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
import { ChevronLeft, ChevronRight, Rocket, Sparkles } from "lucide-react";
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

  const getSimplifiedStatus = (status: string) => {
    return STATUS_LABELS[status] || status;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                  I
                </div>
                <span className="text-xl font-semibold">INDY Roadmap</span>
              </div>
              {clientName && (
                <p className="text-muted-foreground">
                  Roadmap for {clientName}
                </p>
              )}
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>
                {format(startDate, "MMM d")} - {format(endDate, "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </div>
      </header>

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
              <div className="w-[250px] shrink-0 p-3 border-r font-medium bg-muted">
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
                    left: 250 + todayIndex * CELL_WIDTH + CELL_WIDTH / 2,
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
                <div className="w-[250px] shrink-0 p-3 border-r">
                  <div className="font-medium truncate">{initiative.title}</div>
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
                  {/* Scheduled blocks (without engineer names) */}
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
                          {getSimplifiedStatus(initiative.status)}
                        </span>
                      </div>
                    );
                  })}
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
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedInitiative && (
            <div className="px-6 py-2">
              <SheetHeader className="mb-4">
                <SheetTitle className="text-xl pr-8">{selectedInitiative.title}</SheetTitle>
                <SheetDescription>
                  <Badge variant="secondary">
                    {getSimplifiedStatus(selectedInitiative.status)}
                  </Badge>
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6">
                {/* Release Schedule - at the top for quick visibility */}
                {(selectedInitiative.betaTargetDate || selectedInitiative.masterTargetDate) && (
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

                {/* Client Overview (AI-generated) or Description */}
                {selectedInitiative.clientOverview ? (
                  <div>
                    <h4 className="font-semibold text-base mb-3 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      About This Feature
                    </h4>
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-base prose-headings:font-semibold prose-headings:mt-5 prose-headings:mb-2 prose-p:text-foreground/80 prose-p:leading-relaxed prose-p:mb-3 prose-ul:my-3 prose-li:text-foreground/80 prose-li:mb-1 prose-strong:text-foreground prose-strong:font-semibold">
                      <ReactMarkdown>
                        {selectedInitiative.clientOverview}
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
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

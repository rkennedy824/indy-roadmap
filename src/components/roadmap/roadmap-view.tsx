"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Engineer,
  EngineerSpecialty,
  Specialty,
  Initiative,
  InitiativeTag,
  InitiativeAssignment,
  ScheduledBlock,
  UnavailabilityBlock,
  Client,
  ClientInitiativeAccess,
  Squad,
  SquadMember,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Users,
  UsersRound,
  Target,
  RefreshCw,
  Lock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import {
  format,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addMonths,
  addQuarters,
  subMonths,
  subQuarters,
  eachDayOfInterval,
  isWithinInterval,
  differenceInDays,
  addWeeks,
  subWeeks,
  isToday,
  isSameDay,
} from "date-fns";
import Link from "next/link";
import { InitiativeDetailPanel } from "./initiative-detail-panel";
import { AddInitiativeDialog } from "./add-initiative-dialog";
import { EditTimeOffDialog } from "./edit-timeoff-dialog";
import { ConflictResolutionDialog } from "./conflict-resolution-dialog";

const UNAVAILABILITY_LABELS: Record<string, string> = {
  PTO: "PTO",
  TRAVEL: "Travel",
  SICK: "Sick",
  HOLIDAY: "Holiday",
  OTHER: "Unavailable",
};

const UNAVAILABILITY_COLORS: Record<string, string> = {
  PTO: "bg-white border-2 border-dashed border-red-400 text-red-500",
  TRAVEL: "bg-purple-400",
  SICK: "bg-red-400",
  HOLIDAY: "bg-blue-400",
  OTHER: "bg-gray-400",
};

type EngineerWithRelations = Engineer & {
  specialties: (EngineerSpecialty & { specialty: Specialty })[];
  unavailability: UnavailabilityBlock[];
};

type SquadWithRelations = Squad & {
  members: (SquadMember & { engineer: Engineer })[];
};

type InitiativeWithRelations = Initiative & {
  tags: (InitiativeTag & { specialty: Specialty })[];
  assignedEngineer: Engineer | null;
  assignedSquad: Squad | null;
  assignedEngineers: (InitiativeAssignment & { engineer: Engineer | null; squad: Squad | null })[];
  clientAccess: (ClientInitiativeAccess & { client: Client })[];
  scheduledBlocks: { id: string }[];
};

type ScheduledBlockWithRelations = ScheduledBlock & {
  initiative: Initiative & {
    tags: (InitiativeTag & { specialty: Specialty })[];
  };
  engineer: Engineer | null;
  squad: Squad | null;
};

interface RoadmapViewProps {
  engineers: EngineerWithRelations[];
  initiatives: InitiativeWithRelations[];
  scheduledBlocks: ScheduledBlockWithRelations[];
  specialties: Specialty[];
  clients: Client[];
  squads: SquadWithRelations[];
}

const CELL_WIDTH = 40; // pixels per day
const BLOCK_HEIGHT = 32; // pixels per block
const BLOCK_GAP = 4; // gap between stacked blocks
const ROW_PADDING = 8; // top/bottom padding in row
const DEFAULT_ROW_HEIGHT = 48; // default height for single-block rows

export function RoadmapView({
  engineers,
  initiatives,
  scheduledBlocks,
  specialties,
  clients,
  squads,
}: RoadmapViewProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"engineers" | "squads" | "initiatives">("engineers");
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null);
  const [specialtyFilter, setSpecialtyFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [timeframe, setTimeframe] = useState<"month" | "quarter" | "half" | "year">("quarter");
  const [baseDate, setBaseDate] = useState(() => new Date());

  // Time off edit state
  const [selectedTimeOff, setSelectedTimeOff] = useState<(UnavailabilityBlock & { engineer: Engineer }) | null>(null);

  // Drag selection state (for creating new initiatives)
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    startDayIndex: number;
    endDayIndex: number;
    engineerId: string | null;
  } | null>(null);

  // Block drag state (for moving existing blocks)
  const [blockDragState, setBlockDragState] = useState<{
    block: ScheduledBlockWithRelations;
    currentDayIndex: number;
    originalDayIndex: number;
    currentEngineerId: string | null;
    originalEngineerId: string | null;
  } | null>(null);
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);

  // Conflict resolution state
  const [conflictState, setConflictState] = useState<{
    blockId: string;
    initiativeTitle: string;
    newStartDate: Date;
    newEndDate: Date;
    newEngineerId: string | null;
    conflictingBlocks: { id: string; initiative: { title: string }; startDate: string; endDate: string }[];
  } | null>(null);

  // Add initiative dialog state
  const [addDialogState, setAddDialogState] = useState<{
    open: boolean;
    startDate: Date;
    endDate: Date;
    engineerId: string | null;
    engineerName: string | null;
  } | null>(null);

  // Scroll ref for scrolling to today
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Calculate start and end dates based on timeframe
  const { startDate, endDate } = useMemo(() => {
    switch (timeframe) {
      case "month":
        return {
          startDate: startOfMonth(baseDate),
          endDate: endOfMonth(baseDate),
        };
      case "quarter":
        return {
          startDate: startOfQuarter(baseDate),
          endDate: endOfQuarter(baseDate),
        };
      case "half":
        // Half year: Q1-Q2 or Q3-Q4
        const quarterNum = Math.floor(baseDate.getMonth() / 3);
        const isFirstHalf = quarterNum < 2;
        return {
          startDate: isFirstHalf
            ? new Date(baseDate.getFullYear(), 0, 1)
            : new Date(baseDate.getFullYear(), 6, 1),
          endDate: isFirstHalf
            ? new Date(baseDate.getFullYear(), 5, 30)
            : new Date(baseDate.getFullYear(), 11, 31),
        };
      case "year":
        return {
          startDate: startOfYear(baseDate),
          endDate: endOfYear(baseDate),
        };
      default:
        return {
          startDate: startOfQuarter(baseDate),
          endDate: endOfQuarter(baseDate),
        };
    }
  }, [timeframe, baseDate]);

  // Navigation handlers
  const navigatePrevious = () => {
    switch (timeframe) {
      case "month":
        setBaseDate(subMonths(baseDate, 1));
        break;
      case "quarter":
        setBaseDate(subQuarters(baseDate, 1));
        break;
      case "half":
        setBaseDate(subMonths(baseDate, 6));
        break;
      case "year":
        setBaseDate(new Date(baseDate.getFullYear() - 1, baseDate.getMonth(), 1));
        break;
    }
  };

  const navigateNext = () => {
    switch (timeframe) {
      case "month":
        setBaseDate(addMonths(baseDate, 1));
        break;
      case "quarter":
        setBaseDate(addQuarters(baseDate, 1));
        break;
      case "half":
        setBaseDate(addMonths(baseDate, 6));
        break;
      case "year":
        setBaseDate(new Date(baseDate.getFullYear() + 1, baseDate.getMonth(), 1));
        break;
    }
  };

  const navigateToday = () => {
    setBaseDate(new Date());
    // Scroll will happen automatically via useEffect when days update
  };

  // Get display label for current period
  const getPeriodLabel = () => {
    switch (timeframe) {
      case "month":
        return format(startDate, "MMMM yyyy");
      case "quarter":
        const q = Math.floor(startDate.getMonth() / 3) + 1;
        return `Q${q} ${startDate.getFullYear()}`;
      case "half":
        const isFirstHalf = startDate.getMonth() < 6;
        return `${isFirstHalf ? "H1" : "H2"} ${startDate.getFullYear()}`;
      case "year":
        return startDate.getFullYear().toString();
      default:
        return "";
    }
  };

  const days = useMemo(() => {
    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    // Filter out weekends (Saturday = 6, Sunday = 0)
    return allDays.filter(day => day.getDay() !== 0 && day.getDay() !== 6);
  }, [startDate, endDate]);

  // Find today's index in the days array
  const todayIndex = useMemo(() => {
    const today = new Date();
    return days.findIndex(day => isSameDay(day, today));
  }, [days]);

  // Scroll to a specific day index
  const scrollToDay = useCallback((dayIndex: number, offset: number = 3) => {
    if (scrollContainerRef.current && dayIndex >= 0) {
      const scrollPosition = Math.max(0, (dayIndex - offset) * CELL_WIDTH);
      scrollContainerRef.current.scrollLeft = scrollPosition;
    }
  }, []);

  // Scroll to today when the view changes or on mount
  useEffect(() => {
    if (todayIndex >= 0) {
      // Small delay to ensure DOM is ready
      setTimeout(() => scrollToDay(todayIndex), 100);
    }
  }, [todayIndex, scrollToDay]);

  const filteredInitiatives = useMemo(() => {
    let filtered = initiatives;

    if (specialtyFilter.length > 0) {
      filtered = filtered.filter((i) =>
        i.tags.some((t) => specialtyFilter.includes(t.specialtyId))
      );
    }

    if (clientFilter.length > 0) {
      filtered = filtered.filter((i) =>
        i.clientAccess.some((ca) => clientFilter.includes(ca.clientId))
      );
    }

    // Sort by earliest scheduled block start date
    filtered = [...filtered].sort((a, b) => {
      // Find the earliest block for each initiative from scheduledBlocks
      const aBlocks = scheduledBlocks.filter((block) => block.initiativeId === a.id);
      const bBlocks = scheduledBlocks.filter((block) => block.initiativeId === b.id);

      const aStart = aBlocks.length > 0
        ? Math.min(...aBlocks.map((block) => new Date(block.startDate).getTime()))
        : null;
      const bStart = bBlocks.length > 0
        ? Math.min(...bBlocks.map((block) => new Date(block.startDate).getTime()))
        : null;

      // Initiatives without scheduled blocks go to the end
      if (!aStart && !bStart) return 0;
      if (!aStart) return 1;
      if (!bStart) return -1;

      return aStart - bStart;
    });

    return filtered;
  }, [initiatives, specialtyFilter, clientFilter, scheduledBlocks]);

  // Get initiative IDs that match the client filter (for filtering blocks)
  const filteredInitiativeIds = useMemo(() => {
    return new Set(filteredInitiatives.map((i) => i.id));
  }, [filteredInitiatives]);

  const filteredBlocks = useMemo(() => {
    let filtered = scheduledBlocks;

    if (specialtyFilter.length > 0) {
      filtered = filtered.filter((b) =>
        b.initiative.tags.some((t) => specialtyFilter.includes(t.specialtyId))
      );
    }

    if (clientFilter.length > 0) {
      filtered = filtered.filter((b) => filteredInitiativeIds.has(b.initiativeId));
    }

    return filtered;
  }, [scheduledBlocks, specialtyFilter, clientFilter, filteredInitiativeIds]);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const response = await fetch("/api/schedule", { method: "POST" });
      if (!response.ok) throw new Error("Failed to regenerate");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to regenerate schedule");
    } finally {
      setIsRegenerating(false);
    }
  };

  const getBlockStyle = (block: ScheduledBlockWithRelations) => {
    const blockStart = new Date(block.startDate);
    const blockEnd = new Date(block.endDate);

    // Find the index in the days array (which excludes weekends)
    // For start: find the first day that is >= blockStart
    // For end: find the last day that is <= blockEnd
    let startIndex = days.findIndex(day => {
      const dayTime = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const blockStartTime = new Date(blockStart.getFullYear(), blockStart.getMonth(), blockStart.getDate()).getTime();
      return dayTime >= blockStartTime;
    });

    let endIndex = -1;
    for (let i = days.length - 1; i >= 0; i--) {
      const dayTime = new Date(days[i].getFullYear(), days[i].getMonth(), days[i].getDate()).getTime();
      const blockEndTime = new Date(blockEnd.getFullYear(), blockEnd.getMonth(), blockEnd.getDate()).getTime();
      if (dayTime <= blockEndTime) {
        endIndex = i;
        break;
      }
    }

    // If block is outside visible range
    if (startIndex === -1) startIndex = days.length;
    if (endIndex === -1) endIndex = -1;

    // Clamp to visible range
    startIndex = Math.max(0, startIndex);
    endIndex = Math.min(days.length - 1, endIndex);

    // Calculate width based on the number of visible weekdays
    const visibleDays = Math.max(1, endIndex - startIndex + 1);
    const width = visibleDays * CELL_WIDTH - 4;
    const left = startIndex * CELL_WIDTH + 2;

    return { left, width };
  };

  const getEngineerBlocks = (engineerId: string) => {
    return filteredBlocks.filter((b) => b.engineerId === engineerId);
  };

  const getSquadBlocks = (squadId: string) => {
    // Find the squad and get its member engineer IDs
    const squad = squads.find((s) => s.id === squadId);
    if (!squad) return [];
    const memberEngineerIds = new Set(squad.members.map((m) => m.engineerId));

    // Return blocks assigned to the squad OR to any engineer in the squad
    return filteredBlocks.filter(
      (b) => b.squadId === squadId || (b.engineerId && memberEngineerIds.has(b.engineerId))
    );
  };

  const getInitiativeBlocks = (initiativeId: string) => {
    return filteredBlocks.filter((b) => b.initiativeId === initiativeId);
  };

  const getTagColor = (block: ScheduledBlockWithRelations) => {
    const firstTag = block.initiative.tags[0];
    return firstTag?.specialty.color || "#6B7280";
  };

  
  // Check if two blocks overlap in time
  const blocksOverlap = (block1: ScheduledBlockWithRelations, block2: ScheduledBlockWithRelations) => {
    const start1 = new Date(block1.startDate).getTime();
    const end1 = new Date(block1.endDate).getTime();
    const start2 = new Date(block2.startDate).getTime();
    const end2 = new Date(block2.endDate).getTime();
    return start1 <= end2 && start2 <= end1;
  };

  // Calculate lanes for blocks to avoid overlapping - returns a map of blockId to lane number
  const calculateBlockLanes = (blocks: ScheduledBlockWithRelations[]): Map<string, number> => {
    const lanes = new Map<string, number>();
    const sortedBlocks = [...blocks].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    for (const block of sortedBlocks) {
      // Find the first available lane
      let lane = 0;
      const usedLanes = new Set<number>();

      for (const otherBlock of sortedBlocks) {
        if (otherBlock.id === block.id) continue;
        if (lanes.has(otherBlock.id) && blocksOverlap(block, otherBlock)) {
          usedLanes.add(lanes.get(otherBlock.id)!);
        }
      }

      while (usedLanes.has(lane)) {
        lane++;
      }

      lanes.set(block.id, lane);
    }

    return lanes;
  };

  // Get the maximum number of lanes needed for an engineer
  const getEngineerLaneCount = (engineerId: string): number => {
    const blocks = getEngineerBlocks(engineerId);
    if (blocks.length === 0) return 1;
    const lanes = calculateBlockLanes(blocks);
    return Math.max(...Array.from(lanes.values())) + 1;
  };

  // Get the row height based on the number of lanes
  const getRowHeight = (laneCount: number): number => {
    return ROW_PADDING * 2 + laneCount * BLOCK_HEIGHT + (laneCount - 1) * BLOCK_GAP;
  };

  // Memoize lane calculations for all engineers
  const engineerLanes = useMemo(() => {
    const lanesMap = new Map<string, Map<string, number>>();
    for (const engineer of engineers) {
      const blocks = getEngineerBlocks(engineer.id);
      lanesMap.set(engineer.id, calculateBlockLanes(blocks));
    }
    return lanesMap;
  }, [engineers, filteredBlocks]);

  // Memoize lane calculations for all squads
  const squadLanes = useMemo(() => {
    const lanesMap = new Map<string, Map<string, number>>();
    for (const squad of squads) {
      const blocks = getSquadBlocks(squad.id);
      lanesMap.set(squad.id, calculateBlockLanes(blocks));
    }
    return lanesMap;
  }, [squads, filteredBlocks]);

  // Get the maximum number of lanes needed for a squad
  const getSquadLaneCount = (squadId: string): number => {
    const blocks = getSquadBlocks(squadId);
    if (blocks.length === 0) return 1;
    const lanes = squadLanes.get(squadId);
    if (!lanes || lanes.size === 0) return 1;
    return Math.max(...Array.from(lanes.values())) + 1;
  };

  // Drag selection handlers
  const handleDragStart = (dayIndex: number, engineerId: string | null) => {
    setDragState({
      isDragging: true,
      startDayIndex: dayIndex,
      endDayIndex: dayIndex,
      engineerId,
    });
  };

  const handleDragMove = (dayIndex: number) => {
    if (dragState?.isDragging) {
      setDragState({
        ...dragState,
        endDayIndex: dayIndex,
      });
    }
  };

  const handleDragEnd = () => {
    if (dragState?.isDragging) {
      const minIndex = Math.min(dragState.startDayIndex, dragState.endDayIndex);
      const maxIndex = Math.max(dragState.startDayIndex, dragState.endDayIndex);
      const selectedStartDate = days[minIndex];
      const selectedEndDate = days[maxIndex];

      // Find engineer name if one is selected
      const engineer = dragState.engineerId
        ? engineers.find((e) => e.id === dragState.engineerId)
        : null;

      // Open the add initiative dialog
      setAddDialogState({
        open: true,
        startDate: selectedStartDate,
        endDate: selectedEndDate,
        engineerId: dragState.engineerId,
        engineerName: engineer?.name || null,
      });

      setDragState(null);
    }
  };

  const isDayInSelection = (dayIndex: number, engineerId: string | null) => {
    if (!dragState?.isDragging) return false;
    // For engineer view, only highlight if same engineer
    if (dragState.engineerId !== null && dragState.engineerId !== engineerId) return false;
    // For initiative view, engineerId will be null for both
    const minIndex = Math.min(dragState.startDayIndex, dragState.endDayIndex);
    const maxIndex = Math.max(dragState.startDayIndex, dragState.endDayIndex);
    return dayIndex >= minIndex && dayIndex <= maxIndex;
  };

  // Block drag handlers (for moving existing blocks)
  const handleBlockDragStart = (e: React.MouseEvent, block: ScheduledBlockWithRelations, dayIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (block.initiative.lockDates) return; // Don't allow dragging locked blocks
    if (block.initiative.lockAssignment) return; // Don't allow dragging if assignment is locked
    setBlockDragState({
      block,
      currentDayIndex: dayIndex,
      originalDayIndex: dayIndex,
      currentEngineerId: block.engineerId,
      originalEngineerId: block.engineerId,
    });
  };

  const handleBlockDragMove = (dayIndex: number, engineerId?: string) => {
    if (blockDragState) {
      setBlockDragState({
        ...blockDragState,
        currentDayIndex: dayIndex,
        currentEngineerId: engineerId || blockDragState.currentEngineerId,
      });
    }
  };

  const handleBlockDragEnd = async () => {
    if (!blockDragState || isUpdatingBlock) return;

    const dayOffset = blockDragState.currentDayIndex - blockDragState.originalDayIndex;
    const engineerChanged = blockDragState.currentEngineerId !== blockDragState.originalEngineerId;

    // If nothing changed, just cancel
    if (dayOffset === 0 && !engineerChanged) {
      setBlockDragState(null);
      return;
    }

    setIsUpdatingBlock(true);

    try {
      // Calculate new dates
      const blockStart = new Date(blockDragState.block.startDate);
      const blockEnd = new Date(blockDragState.block.endDate);

      // Calculate the actual day offset accounting for weekends
      // We need to add business days, not calendar days
      let newStart = new Date(blockStart);
      let newEnd = new Date(blockEnd);

      const addBusinessDays = (date: Date, numDays: number): Date => {
        const result = new Date(date);
        let remaining = Math.abs(numDays);
        const direction = numDays >= 0 ? 1 : -1;

        while (remaining > 0) {
          result.setDate(result.getDate() + direction);
          // Skip weekends
          if (result.getDay() !== 0 && result.getDay() !== 6) {
            remaining--;
          }
        }
        return result;
      };

      if (dayOffset !== 0) {
        newStart = addBusinessDays(blockStart, dayOffset);
        newEnd = addBusinessDays(blockEnd, dayOffset);
      }

      const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      // First, check for conflicts
      const checkResponse = await fetch("/api/schedule/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId: blockDragState.block.id,
          newStartDate: formatDate(newStart),
          newEndDate: formatDate(newEnd),
          newEngineerId: engineerChanged ? blockDragState.currentEngineerId : undefined,
          conflictResolution: "check",
        }),
      });

      if (!checkResponse.ok) {
        const error = await checkResponse.json();
        throw new Error(error.error || "Failed to check conflicts");
      }

      const checkResult = await checkResponse.json();

      // If there are conflicts, show the resolution dialog
      if (checkResult.hasConflicts && checkResult.conflictingBlocks.length > 0) {
        setConflictState({
          blockId: blockDragState.block.id,
          initiativeTitle: blockDragState.block.initiative.title,
          newStartDate: newStart,
          newEndDate: newEnd,
          newEngineerId: engineerChanged ? blockDragState.currentEngineerId : null,
          conflictingBlocks: checkResult.conflictingBlocks,
        });
        setIsUpdatingBlock(false);
        setBlockDragState(null);
        return;
      }

      // No conflicts, proceed with move
      const response = await fetch("/api/schedule/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId: blockDragState.block.id,
          newStartDate: formatDate(newStart),
          newEndDate: formatDate(newEnd),
          newEngineerId: engineerChanged ? blockDragState.currentEngineerId : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to move block");
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to move block:", error);
      alert(error instanceof Error ? error.message : "Failed to move block");
    } finally {
      setIsUpdatingBlock(false);
      setBlockDragState(null);
    }
  };

  // Handle conflict resolution
  const handleConflictResolution = async (resolution: "stack" | "push") => {
    if (!conflictState) return;

    setIsUpdatingBlock(true);

    try {
      const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const response = await fetch("/api/schedule/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId: conflictState.blockId,
          newStartDate: formatDate(conflictState.newStartDate),
          newEndDate: formatDate(conflictState.newEndDate),
          newEngineerId: conflictState.newEngineerId || undefined,
          conflictResolution: resolution,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to move block");
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to resolve conflict:", error);
      alert(error instanceof Error ? error.message : "Failed to move block");
    } finally {
      setIsUpdatingBlock(false);
      setConflictState(null);
    }
  };

  // Calculate the visual position of a block being dragged
  const getBlockDragOffset = (blockId: string): number => {
    if (!blockDragState || blockDragState.block.id !== blockId) return 0;
    return (blockDragState.currentDayIndex - blockDragState.originalDayIndex) * CELL_WIDTH;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div>
          <h1 className="text-2xl font-bold">Roadmap</h1>
          <p className="text-muted-foreground">
            {format(startDate, "MMM d")} - {format(endDate, "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeframe} onValueChange={(v) => setTimeframe(v as typeof timeframe)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="half">Half Year</SelectItem>
              <SelectItem value="year">Full Year</SelectItem>
            </SelectContent>
          </Select>
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
            className="w-[150px]"
          />
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
            <TabsList>
              <TabsTrigger value="engineers" className="gap-2">
                <Users className="h-4 w-4" />
                Engineers
              </TabsTrigger>
              <TabsTrigger value="squads" className="gap-2">
                <UsersRound className="h-4 w-4" />
                Squads
              </TabsTrigger>
              <TabsTrigger value="initiatives" className="gap-2">
                <Target className="h-4 w-4" />
                Initiatives
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={isRegenerating}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`} />
            {isRegenerating ? "Regenerating..." : "Regenerate Schedule"}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/50">
        <Button variant="ghost" size="sm" onClick={navigatePrevious}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-lg">{getPeriodLabel()}</span>
          <Button variant="ghost" size="sm" onClick={navigateToday}>
            Today
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={navigateNext}>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Timeline */}
      <div
        className="flex-1 overflow-hidden"
        onMouseUp={() => {
          handleDragEnd();
          handleBlockDragEnd();
        }}
        onMouseLeave={() => {
          if (dragState?.isDragging) setDragState(null);
          if (blockDragState) setBlockDragState(null);
        }}
      >
        <div className="h-full overflow-x-auto overflow-y-auto" ref={scrollContainerRef}>
          <div className="min-w-max">
            {/* Timeline Header */}
            <div className="sticky top-0 z-20 bg-card border-b">
              {/* Quarter Row */}
              <div className="flex border-b">
                <div className="w-[200px] shrink-0 border-r bg-muted sticky left-0 z-10" />
                <div className="flex">
                  {(() => {
                    // Group days by quarter
                    const quarterGroups: { quarter: string; year: number; count: number }[] = [];
                    let currentQuarter = "";
                    let currentYear = 0;
                    let count = 0;

                    days.forEach((day, i) => {
                      const month = day.getMonth();
                      const year = day.getFullYear();
                      const quarter = month < 3 ? "Q1" : month < 6 ? "Q2" : month < 9 ? "Q3" : "Q4";
                      const quarterKey = `${quarter}-${year}`;

                      if (quarterKey !== currentQuarter) {
                        if (count > 0) {
                          quarterGroups.push({
                            quarter: currentQuarter.split("-")[0],
                            year: currentYear,
                            count,
                          });
                        }
                        currentQuarter = quarterKey;
                        currentYear = year;
                        count = 1;
                      } else {
                        count++;
                      }

                      // Last day
                      if (i === days.length - 1) {
                        quarterGroups.push({
                          quarter: quarter,
                          year: year,
                          count,
                        });
                      }
                    });

                    return quarterGroups.map((group, i) => (
                      <div
                        key={i}
                        className="text-center text-xs font-semibold py-1 border-r bg-muted/50"
                        style={{ width: group.count * CELL_WIDTH }}
                      >
                        {group.quarter} {group.year}
                      </div>
                    ));
                  })()}
                </div>
              </div>
              {/* Day Headers */}
              <div className="flex">
                <div className="w-[200px] shrink-0 p-2 border-r font-medium bg-muted sticky left-0 z-10">
                  {viewMode === "engineers" ? "Engineer" : viewMode === "squads" ? "Squad" : "Initiative"}
                </div>
                <div className="flex">
                  {days.map((day, i) => {
                    const isTodayCell = isToday(day);
                    return (
                      <div
                        key={i}
                        className={`text-center text-xs border-r ${
                          isTodayCell ? "bg-primary/10 font-semibold" : ""
                        }`}
                        style={{ width: CELL_WIDTH }}
                      >
                        <div className={isTodayCell ? "text-primary" : "font-medium"}>
                          {format(day, "EEE")}
                        </div>
                        <div className={isTodayCell ? "text-primary" : "text-muted-foreground"}>
                          {format(day, "d")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Swimlanes with Today indicator */}
            <div className="relative">
              {/* Today indicator line */}
              {todayIndex >= 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none"
                  style={{
                    left: 200 + todayIndex * CELL_WIDTH + CELL_WIDTH / 2,
                  }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
                </div>
              )}

            {viewMode === "engineers" && (
              // Engineer Swimlanes
              engineers.map((engineer) => {
                const laneCount = getEngineerLaneCount(engineer.id);
                const rowHeight = getRowHeight(laneCount);
                const lanes = engineerLanes.get(engineer.id) || new Map();

                const isDropTarget = blockDragState &&
                  blockDragState.currentEngineerId === engineer.id &&
                  blockDragState.originalEngineerId !== engineer.id;

                return (
                  <div key={engineer.id} className={`flex border-b hover:bg-muted/30 ${
                    isDropTarget ? "bg-primary/10 ring-1 ring-inset ring-primary/50" : ""
                  }`}>
                    <div className={`w-[200px] shrink-0 p-2 border-r sticky left-0 z-10 bg-card ${isDropTarget ? "bg-primary/5" : ""}`}>
                      <Link
                        href={`/engineers/${engineer.id}`}
                        className="font-medium hover:underline"
                      >
                        {engineer.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {engineer.role || "Engineer"}
                      </div>
                      {isDropTarget && (
                        <div className="text-xs text-primary font-medium mt-1">
                          Drop to reassign
                        </div>
                      )}
                    </div>
                    <div
                      className="relative flex"
                      style={{ height: rowHeight }}
                    >
                      {/* Day cells with unavailability - drag to select date range */}
                      {days.map((day, i) => {
                        const isSelected = isDayInSelection(i, engineer.id);

                        return (
                          <div
                            key={i}
                            className={`border-r transition-colors group select-none ${
                              isSelected ? "bg-primary/20" : "hover:bg-primary/10"
                            } ${
                              blockDragState ? "cursor-grabbing" : "cursor-crosshair"
                            }`}
                            style={{ width: CELL_WIDTH }}
                            onMouseDown={(e) => {
                              if (blockDragState) return; // Don't start new selection while dragging block
                              e.preventDefault();
                              handleDragStart(i, engineer.id);
                            }}
                            onMouseEnter={() => {
                              handleDragMove(i);
                              handleBlockDragMove(i, engineer.id);
                            }}
                            onMouseUp={() => {
                              handleDragEnd();
                              handleBlockDragEnd();
                            }}
                            title={blockDragState ? "Drop here to move" : `Drag to select dates for ${engineer.name}`}
                          >
                            <Plus className={`h-3 w-3 mx-auto mt-1 text-primary ${isSelected ? "opacity-50" : "opacity-0 group-hover:opacity-50"} ${blockDragState ? "hidden" : ""}`} />
                          </div>
                        );
                      })}
                      {/* Scheduled blocks - stacked by lane */}
                      {getEngineerBlocks(engineer.id).map((block) => {
                        const style = getBlockStyle(block);
                        const lane = lanes.get(block.id) || 0;
                        const topPosition = ROW_PADDING + lane * (BLOCK_HEIGHT + BLOCK_GAP);
                        const isDragging = blockDragState?.block.id === block.id;
                        const dragOffset = getBlockDragOffset(block.id);
                        const isLocked = block.initiative.lockDates;

                        return (
                          <div
                            key={block.id}
                            className={`absolute rounded-md text-white text-xs font-medium px-2 truncate flex items-center gap-1 select-none ${
                              block.isAtRisk ? "ring-2 ring-destructive" : ""
                            } ${isDragging ? "opacity-70 ring-2 ring-primary z-30" : "hover:opacity-90"} ${
                              isLocked ? "cursor-not-allowed" : "cursor-grab"
                            } ${isDragging ? "cursor-grabbing" : ""}`}
                            style={{
                              left: style.left + dragOffset,
                              width: style.width,
                              top: topPosition,
                              height: BLOCK_HEIGHT,
                              backgroundColor: getTagColor(block),
                              transition: isDragging ? "none" : "opacity 0.15s",
                            }}
                            onMouseDown={(e) => {
                              // Find the day index for drag start
                              const blockStart = new Date(block.startDate);
                              const startIndex = days.findIndex(day => {
                                const dayTime = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
                                const blockStartTime = new Date(blockStart.getFullYear(), blockStart.getMonth(), blockStart.getDate()).getTime();
                                return dayTime >= blockStartTime;
                              });
                              handleBlockDragStart(e, block, Math.max(0, startIndex));
                            }}
                            onClick={(e) => {
                              if (!blockDragState) {
                                e.stopPropagation();
                                setSelectedInitiativeId(block.initiativeId);
                              }
                            }}
                            title={isLocked ? "This block is locked" : "Drag to reschedule"}
                          >
                            {isLocked && (
                              <Lock className="h-3 w-3 shrink-0" />
                            )}
                            {block.isAtRisk && (
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                            )}
                            <span className="truncate">{block.initiative.title}</span>
                          </div>
                        );
                      })}
                      {/* Unavailability blocks */}
                      {engineer.unavailability.map((unavail) => {
                        const unavailStart = new Date(unavail.startDate);
                        const unavailEnd = new Date(unavail.endDate);

                        // Find indices in filtered days array
                        let startIndex = days.findIndex(day => {
                          const dayTime = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
                          const unavailStartTime = new Date(unavailStart.getFullYear(), unavailStart.getMonth(), unavailStart.getDate()).getTime();
                          return dayTime >= unavailStartTime;
                        });

                        let endIndex = -1;
                        for (let i = days.length - 1; i >= 0; i--) {
                          const dayTime = new Date(days[i].getFullYear(), days[i].getMonth(), days[i].getDate()).getTime();
                          const unavailEndTime = new Date(unavailEnd.getFullYear(), unavailEnd.getMonth(), unavailEnd.getDate()).getTime();
                          if (dayTime <= unavailEndTime) {
                            endIndex = i;
                            break;
                          }
                        }

                        // Skip if outside visible range
                        if (startIndex === -1 || endIndex === -1 || endIndex < 0 || startIndex >= days.length) return null;

                        startIndex = Math.max(0, startIndex);
                        endIndex = Math.min(days.length - 1, endIndex);

                        const width = Math.max(1, endIndex - startIndex + 1) * CELL_WIDTH - 4;
                        const left = startIndex * CELL_WIDTH + 2;

                        const unavailType = (unavail as UnavailabilityBlock & { type?: string }).type || "OTHER";

                        return (
                          <div
                            key={unavail.id}
                            className={`absolute rounded-md text-xs font-medium px-2 truncate flex items-center cursor-pointer hover:opacity-80 ${unavailType === "PTO" ? "" : "text-white"} ${UNAVAILABILITY_COLORS[unavailType] || "bg-gray-400"}`}
                            style={{
                              left,
                              width,
                              bottom: ROW_PADDING,
                              height: BLOCK_HEIGHT,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTimeOff({ ...unavail, engineer });
                            }}
                            title={`${UNAVAILABILITY_LABELS[unavailType] || "Unavailable"}${unavail.reason ? `: ${unavail.reason}` : ""} - Click to edit`}
                          >
                            <span className="truncate">
                              {UNAVAILABILITY_LABELS[unavailType] || "Unavailable"}
                              {unavail.reason && `: ${unavail.reason}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}

            {viewMode === "squads" && (
              // Squad Swimlanes
              squads.map((squad) => {
                const squadBlocks = getSquadBlocks(squad.id);
                const laneCount = getSquadLaneCount(squad.id);
                const rowHeight = getRowHeight(laneCount);
                const lanes = squadLanes.get(squad.id) || new Map();

                return (
                  <div key={squad.id} className="flex border-b hover:bg-muted/30">
                    <div className="w-[200px] shrink-0 p-2 border-r sticky left-0 z-10 bg-card">
                      <div className="font-medium flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: squad.color || "#6B7280" }}
                        />
                        {squad.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {squad.members.length} member{squad.members.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div
                      className="relative flex"
                      style={{ height: rowHeight }}
                    >
                      {/* Day cells */}
                      {days.map((day, i) => {
                        const isTodayCell = isToday(day);
                        return (
                          <div
                            key={i}
                            className={`border-r ${isTodayCell ? "bg-primary/5" : ""}`}
                            style={{ width: CELL_WIDTH, height: "100%" }}
                          />
                        );
                      })}
                      {/* Blocks */}
                      {squadBlocks.map((block) => {
                        const style = getBlockStyle(block);
                        if (!style) return null;
                        const tagColor = getTagColor(block);
                        const isLocked = block.initiative.lockDates;
                        const lane = lanes.get(block.id) || 0;
                        const topPosition = ROW_PADDING + lane * (BLOCK_HEIGHT + BLOCK_GAP);

                        return (
                          <div
                            key={block.id}
                            className="absolute rounded-md px-2 text-xs font-medium text-white truncate cursor-pointer hover:opacity-90 flex items-center gap-1"
                            style={{
                              left: style.left,
                              width: style.width,
                              top: topPosition,
                              height: BLOCK_HEIGHT,
                              backgroundColor: tagColor,
                            }}
                            onClick={() => setSelectedInitiativeId(block.initiativeId)}
                            title={block.initiative.title}
                          >
                            {isLocked && <Lock className="h-3 w-3 shrink-0" />}
                            {block.isAtRisk && <AlertTriangle className="h-3 w-3 shrink-0" />}
                            <span className="truncate">{block.initiative.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}

            {viewMode === "initiatives" && (
              // Initiative Swimlanes
              filteredInitiatives.map((initiative) => (
                <div key={initiative.id} className="flex border-b hover:bg-muted/30">
                  <div className="w-[200px] shrink-0 p-2 border-r sticky left-0 z-10 bg-card">
                    <Link
                      href={`/initiatives/${initiative.id}`}
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      {initiative.lockAssignment && <Lock className="h-3 w-3" />}
                      <span className="truncate">{initiative.title}</span>
                    </Link>
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
                  <div
                    className="relative flex"
                    style={{ height: DEFAULT_ROW_HEIGHT }}
                  >
                    {/* Day cells - drag to select date range */}
                    {days.map((day, i) => {
                      const isSelected = isDayInSelection(i, null);

                      return (
                        <div
                          key={i}
                          className={`border-r transition-colors group select-none ${
                            isSelected ? "bg-primary/20" : "hover:bg-primary/10"
                          } ${blockDragState ? "cursor-grabbing" : "cursor-crosshair"}`}
                          style={{ width: CELL_WIDTH }}
                          onMouseDown={(e) => {
                            if (blockDragState) return;
                            e.preventDefault();
                            handleDragStart(i, null);
                          }}
                          onMouseEnter={() => {
                            handleDragMove(i);
                            handleBlockDragMove(i);
                          }}
                          onMouseUp={() => {
                            handleDragEnd();
                            handleBlockDragEnd();
                          }}
                          title={blockDragState ? "Drop here to move" : "Drag to select dates"}
                        >
                          <Plus className={`h-3 w-3 mx-auto mt-1 text-primary ${isSelected ? "opacity-50" : "opacity-0 group-hover:opacity-50"} ${blockDragState ? "hidden" : ""}`} />
                        </div>
                      );
                    })}
                    {/* Deadline marker */}
                    {initiative.deadline && (() => {
                      const deadline = new Date(initiative.deadline);
                      const deadlineIndex = days.findIndex(day => {
                        const dayTime = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
                        const deadlineTime = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()).getTime();
                        return dayTime >= deadlineTime;
                      });
                      if (deadlineIndex === -1) return null;
                      return (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-destructive"
                          style={{
                            left: deadlineIndex * CELL_WIDTH + CELL_WIDTH / 2,
                          }}
                        />
                      );
                    })()}
                    {/* Scheduled blocks */}
                    {getInitiativeBlocks(initiative.id).map((block) => {
                      const style = getBlockStyle(block);
                      const isDragging = blockDragState?.block.id === block.id;
                      const dragOffset = getBlockDragOffset(block.id);
                      const isLocked = block.initiative.lockDates;

                      return (
                        <div
                          key={block.id}
                          className={`absolute rounded-md text-white text-xs font-medium px-2 truncate flex items-center gap-1 select-none ${
                            block.isAtRisk ? "ring-2 ring-destructive" : ""
                          } ${isDragging ? "opacity-70 ring-2 ring-primary z-30" : "hover:opacity-90"} ${
                            isLocked ? "cursor-not-allowed" : "cursor-grab"
                          } ${isDragging ? "cursor-grabbing" : ""}`}
                          style={{
                            left: style.left + dragOffset,
                            width: style.width,
                            top: ROW_PADDING,
                            height: BLOCK_HEIGHT,
                            backgroundColor: getTagColor(block),
                            transition: isDragging ? "none" : "opacity 0.15s",
                          }}
                          onMouseDown={(e) => {
                            const blockStart = new Date(block.startDate);
                            const startIndex = days.findIndex(day => {
                              const dayTime = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
                              const blockStartTime = new Date(blockStart.getFullYear(), blockStart.getMonth(), blockStart.getDate()).getTime();
                              return dayTime >= blockStartTime;
                            });
                            handleBlockDragStart(e, block, Math.max(0, startIndex));
                          }}
                          onClick={(e) => {
                            if (!blockDragState) {
                              e.stopPropagation();
                              setSelectedInitiativeId(block.initiativeId);
                            }
                          }}
                          title={isLocked ? "This block is locked" : "Drag to reschedule"}
                        >
                          {isLocked && (
                            <Lock className="h-3 w-3 shrink-0" />
                          )}
                          {block.isAtRisk && (
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                          )}
                          <span className="truncate">{block.engineer?.name || block.squad?.name || "Unassigned"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Initiative Detail Panel */}
      <InitiativeDetailPanel
        initiativeId={selectedInitiativeId}
        onClose={() => setSelectedInitiativeId(null)}
        engineers={engineers}
        specialties={specialties}
        clients={clients}
      />

      {/* Add Initiative Dialog */}
      {addDialogState && (
        <AddInitiativeDialog
          open={addDialogState.open}
          onClose={() => setAddDialogState(null)}
          startDate={addDialogState.startDate}
          endDate={addDialogState.endDate}
          engineerId={addDialogState.engineerId}
          engineerName={addDialogState.engineerName}
          initiatives={initiatives}
        />
      )}

      {/* Edit Time Off Dialog */}
      {selectedTimeOff && (
        <EditTimeOffDialog
          block={selectedTimeOff}
          open={!!selectedTimeOff}
          onClose={() => setSelectedTimeOff(null)}
        />
      )}

      {/* Conflict Resolution Dialog */}
      {conflictState && (
        <ConflictResolutionDialog
          open={!!conflictState}
          onClose={() => setConflictState(null)}
          onResolve={handleConflictResolution}
          movingInitiativeTitle={conflictState.initiativeTitle}
          conflictingBlocks={conflictState.conflictingBlocks}
          newStartDate={conflictState.newStartDate}
          newEndDate={conflictState.newEndDate}
          isLoading={isUpdatingBlock}
        />
      )}
    </div>
  );
}

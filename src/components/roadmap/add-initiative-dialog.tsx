"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Initiative, UnavailabilityType } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Calendar, PalmtreeIcon, Plane, HeartPulse, PartyPopper, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const UNAVAILABILITY_OPTIONS: { type: UnavailabilityType; label: string; icon: typeof PalmtreeIcon }[] = [
  { type: "PTO", label: "PTO / Vacation", icon: PalmtreeIcon },
  { type: "TRAVEL", label: "Travel", icon: Plane },
  { type: "SICK", label: "Sick Leave", icon: HeartPulse },
  { type: "HOLIDAY", label: "Holiday", icon: PartyPopper },
  { type: "OTHER", label: "Other", icon: Clock },
];

interface AddInitiativeDialogProps {
  open: boolean;
  onClose: () => void;
  startDate: Date;
  endDate: Date;
  engineerId: string | null;
  engineerName: string | null;
  initiatives: (Initiative & {
    tags: { specialty: { name: string; color: string | null } }[];
    scheduledBlocks: { id: string }[];
    assignedEngineerId: string | null;
  })[];
}

export function AddInitiativeDialog({
  open,
  onClose,
  startDate,
  endDate,
  engineerId,
  engineerName,
  initiatives,
}: AddInitiativeDialogProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [activeTab, setActiveTab] = useState<"initiative" | "timeoff">("initiative");
  const [timeOffType, setTimeOffType] = useState<UnavailabilityType>("PTO");
  const [timeOffReason, setTimeOffReason] = useState("");

  // Filter to show initiatives (including DONE ones that may need schedule blocks added)
  const filteredInitiatives = useMemo(() => {
    return initiatives
      .filter((i) =>
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        i.description?.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        // Sort by: unscheduled first, then active before done, then by title
        const aUnscheduled = a.scheduledBlocks.length === 0 ? 0 : 1;
        const bUnscheduled = b.scheduledBlocks.length === 0 ? 0 : 1;
        if (aUnscheduled !== bUnscheduled) return aUnscheduled - bUnscheduled;

        // Active initiatives before done
        const aDone = a.status === "DONE" ? 1 : 0;
        const bDone = b.status === "DONE" ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;

        return a.title.localeCompare(b.title);
      });
  }, [initiatives, search]);

  const handleScheduleExisting = async (initiativeId: string) => {
    // Check if we have an engineer
    if (!engineerId) {
      const initiative = initiatives.find(i => i.id === initiativeId);
      if (!initiative?.assignedEngineerId) {
        alert("Please select dates from an engineer's row on the roadmap, or assign an engineer to this initiative first.");
        return;
      }
    }

    setIsScheduling(true);
    try {
      const response = await fetch("/api/schedule/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiativeId,
          startDate: format(startDate, "yyyy-MM-dd"),
          // Only send endDate if it's different from startDate (let API calculate from effort)
          endDate: startDate.getTime() !== endDate.getTime() ? format(endDate, "yyyy-MM-dd") : null,
          engineerId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to schedule initiative");
      }

      router.refresh();
      onClose();
    } catch (error) {
      console.error("Failed to schedule initiative:", error);
      alert(error instanceof Error ? error.message : "Failed to schedule initiative");
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCreateNew = () => {
    const startDateStr = format(startDate, "yyyy-MM-dd");
    const endDateStr = format(endDate, "yyyy-MM-dd");
    let url = `/initiatives/new?date=${startDateStr}&endDate=${endDateStr}`;
    if (engineerId) {
      url += `&engineer=${engineerId}`;
    }
    router.push(url);
    onClose();
  };

  const handleAddTimeOff = async () => {
    if (!engineerId) {
      alert("Please select dates from an engineer's row to add time off.");
      return;
    }

    setIsScheduling(true);
    try {
      const response = await fetch("/api/unavailability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineerId,
          type: timeOffType,
          startDate: format(startDate, "yyyy-MM-dd"),
          endDate: format(endDate, "yyyy-MM-dd"),
          reason: timeOffReason || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add time off");
      }

      router.refresh();
      onClose();
    } catch (error) {
      console.error("Failed to add time off:", error);
      alert(error instanceof Error ? error.message : "Failed to add time off");
    } finally {
      setIsScheduling(false);
    }
  };

  const dateRangeLabel = startDate.getTime() === endDate.getTime()
    ? format(startDate, "MMM d, yyyy")
    : `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add to Roadmap</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{dateRangeLabel}</span>
            {engineerName && (
              <>
                <span className="text-muted-foreground">for</span>
                <span className="font-medium text-foreground">{engineerName}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="initiative">Initiative</TabsTrigger>
            <TabsTrigger value="timeoff" disabled={!engineerId}>Time Off</TabsTrigger>
          </TabsList>

          <TabsContent value="initiative" className="flex-1 flex flex-col min-h-0 mt-4">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search initiatives..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Initiative List */}
            <div className="flex-1 overflow-y-auto min-h-0 max-h-[300px] space-y-2 pr-1">
              {filteredInitiatives.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {search ? "No initiatives found" : "No initiatives available"}
                </div>
              ) : (
                filteredInitiatives.map((initiative) => {
                  const isUnscheduled = initiative.scheduledBlocks.length === 0;
                  const isDone = initiative.status === "DONE";

                  return (
                    <button
                      key={initiative.id}
                      onClick={() => handleScheduleExisting(initiative.id)}
                      disabled={isScheduling}
                      className={`w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors disabled:opacity-50 ${
                        isDone ? "opacity-70" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-1.5">
                            {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                            <span className={isDone ? "text-muted-foreground" : ""}>{initiative.title}</span>
                          </div>
                          {initiative.description && (
                            <div className="text-sm text-muted-foreground truncate mt-0.5">
                              {initiative.description}
                            </div>
                          )}
                          {initiative.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {initiative.tags.slice(0, 3).map((tag, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-xs"
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
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {isDone && (
                            <Badge variant="outline" className="text-xs whitespace-nowrap text-green-600 border-green-600">
                              Completed
                            </Badge>
                          )}
                          {isUnscheduled ? (
                            <Badge variant="secondary" className="text-xs whitespace-nowrap">
                              Unscheduled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {initiative.scheduledBlocks.length} block{initiative.scheduledBlocks.length !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Create New Button */}
            <div className="pt-4 mt-4 border-t">
              <Button onClick={handleCreateNew} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Create New Initiative
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="timeoff" className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={timeOffType} onValueChange={(v) => setTimeOffType(v as UnavailabilityType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNAVAILABILITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.type} value={opt.type}>
                      <div className="flex items-center gap-2">
                        <opt.icon className="h-4 w-4" />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input
                placeholder="e.g., Conference, Doctor appointment..."
                value={timeOffReason}
                onChange={(e) => setTimeOffReason(e.target.value)}
              />
            </div>

            <Button
              onClick={handleAddTimeOff}
              disabled={isScheduling}
              className="w-full"
            >
              {isScheduling ? "Adding..." : "Add Time Off"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

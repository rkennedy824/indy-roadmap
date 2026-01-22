import {
  EngineerWithRelations,
  InitiativeWithRelations,
  ScheduleBlock,
  ScheduleResult,
  RiskFlag,
  SchedulerConfig,
  DEFAULT_CONFIG,
} from "./types";
import { recommendEngineers } from "./assign";
import {
  addDays,
  differenceInBusinessDays,
  isWithinInterval,
  max,
  min,
} from "date-fns";

interface DependencyGraph {
  [initiativeId: string]: string[]; // maps initiative to its dependencies
}

/**
 * Generates a schedule for all initiatives respecting constraints:
 * - Dependencies (topological ordering)
 * - Locked assignments and dates
 * - Engineer unavailability
 * - Weekly capacity limits
 */
export function generateSchedule(
  initiatives: InitiativeWithRelations[],
  engineers: EngineerWithRelations[],
  dependencies: { dependentId: string; dependencyId: string }[],
  config: SchedulerConfig = DEFAULT_CONFIG
): ScheduleResult {
  const blocks: ScheduleBlock[] = [];
  const risks: RiskFlag[] = [];
  const unscheduled: string[] = [];

  // Build dependency graph
  const dependencyGraph = buildDependencyGraph(dependencies);

  // Get topologically sorted initiatives
  const sortedInitiatives = topologicalSort(initiatives, dependencyGraph);

  // Track engineer availability per day
  const engineerSchedules: Map<string, Map<string, number>> = new Map();
  engineers.forEach((e) => engineerSchedules.set(e.id, new Map()));

  // Track when each initiative ends (for dependency resolution)
  const initiativeEndDates: Map<string, Date> = new Map();

  for (const initiative of sortedInitiatives) {
    // Skip if already done
    if (initiative.status === "DONE") continue;

    // Skip if no effort estimate
    if (!initiative.effortEstimate) {
      risks.push({
        initiativeId: initiative.id,
        reason: "No effort estimate provided",
        severity: "warning",
      });
      continue;
    }

    const result = scheduleInitiative(
      initiative,
      engineers,
      dependencyGraph,
      initiativeEndDates,
      engineerSchedules,
      config
    );

    if (result.block) {
      blocks.push(result.block);
      initiativeEndDates.set(initiative.id, result.block.endDate);

      // Update engineer schedule
      updateEngineerSchedule(
        engineerSchedules,
        result.block.engineerId,
        result.block.startDate,
        result.block.endDate,
        result.block.hoursAllocated,
        config.hoursPerDay
      );

      if (result.risk) {
        risks.push(result.risk);
      }
    } else {
      unscheduled.push(initiative.id);
      if (result.risk) {
        risks.push(result.risk);
      }
    }
  }

  return { blocks, risks, unscheduled };
}

function scheduleInitiative(
  initiative: InitiativeWithRelations,
  engineers: EngineerWithRelations[],
  dependencyGraph: DependencyGraph,
  initiativeEndDates: Map<string, Date>,
  engineerSchedules: Map<string, Map<string, number>>,
  config: SchedulerConfig
): { block?: ScheduleBlock; risk?: RiskFlag } {
  const now = new Date();
  // Convert weeks to hours (effortEstimate is stored in weeks)
  const effortHours = initiative.effortEstimate! * config.hoursPerWeek;

  // Determine earliest start date based on dependencies
  let earliestStart = now;
  const deps = dependencyGraph[initiative.id] || [];
  for (const depId of deps) {
    const depEnd = initiativeEndDates.get(depId);
    if (depEnd) {
      earliestStart = max([earliestStart, addDays(depEnd, 1)]);
    }
  }

  // Handle locked dates
  if (initiative.lockDates && initiative.lockedStart && initiative.lockedEnd) {
    const lockedStart = new Date(initiative.lockedStart);
    const lockedEnd = new Date(initiative.lockedEnd);

    // Find assigned engineer or best fit
    let engineerId = initiative.assignedEngineerId;
    if (!engineerId || !initiative.lockAssignment) {
      const recommendations = recommendEngineers(initiative, engineers, config);
      if (recommendations.length > 0) {
        engineerId = recommendations[0].engineerId;
      }
    }

    if (!engineerId) {
      return {
        risk: {
          initiativeId: initiative.id,
          reason: "No suitable engineer found",
          severity: "critical",
        },
      };
    }

    // Check for conflicts with unavailability
    const engineer = engineers.find((e) => e.id === engineerId)!;
    const hasConflict = engineer.unavailability.some(
      (block) =>
        isWithinInterval(lockedStart, {
          start: new Date(block.startDate),
          end: new Date(block.endDate),
        }) ||
        isWithinInterval(lockedEnd, {
          start: new Date(block.startDate),
          end: new Date(block.endDate),
        })
    );

    if (hasConflict) {
      return {
        block: {
          initiativeId: initiative.id,
          engineerId,
          startDate: lockedStart,
          endDate: lockedEnd,
          hoursAllocated: effortHours,
          isAtRisk: true,
          riskReason: "Conflicts with engineer unavailability",
        },
        risk: {
          initiativeId: initiative.id,
          reason: "Locked dates conflict with engineer unavailability",
          severity: "critical",
        },
      };
    }

    return {
      block: {
        initiativeId: initiative.id,
        engineerId,
        startDate: lockedStart,
        endDate: lockedEnd,
        hoursAllocated: effortHours,
        isAtRisk: false,
      },
    };
  }

  // Find best engineer
  let engineerId = initiative.assignedEngineerId;
  if (!engineerId || !initiative.lockAssignment) {
    const recommendations = recommendEngineers(initiative, engineers, config);
    if (recommendations.length > 0) {
      engineerId = initiative.lockAssignment
        ? initiative.assignedEngineerId
        : recommendations[0].engineerId;
    }
  }

  if (!engineerId) {
    return {
      risk: {
        initiativeId: initiative.id,
        reason: "No suitable engineer found",
        severity: "critical",
      },
    };
  }

  const engineer = engineers.find((e) => e.id === engineerId)!;

  // Find the earliest slot where the engineer can complete the work
  const slot = findEarliestSlot(
    engineer,
    earliestStart,
    initiative.deadline ? new Date(initiative.deadline) : null,
    effortHours,
    engineerSchedules.get(engineerId)!,
    config
  );

  if (!slot) {
    return {
      risk: {
        initiativeId: initiative.id,
        reason: "Cannot find available slot for scheduling",
        severity: "critical",
      },
    };
  }

  // Check if we can meet the deadline
  let isAtRisk = false;
  let riskReason: string | undefined;

  if (initiative.deadline) {
    const deadline = new Date(initiative.deadline);
    const bufferDate = addDays(deadline, -config.bufferDays);

    if (slot.endDate > deadline) {
      isAtRisk = true;
      riskReason = "Cannot meet deadline";
    } else if (slot.endDate > bufferDate) {
      isAtRisk = true;
      riskReason = "Deadline buffer exceeded";
    }
  }

  return {
    block: {
      initiativeId: initiative.id,
      engineerId,
      startDate: slot.startDate,
      endDate: slot.endDate,
      hoursAllocated: effortHours,
      isAtRisk,
      riskReason,
    },
    risk: isAtRisk
      ? {
          initiativeId: initiative.id,
          reason: riskReason!,
          severity: riskReason === "Cannot meet deadline" ? "critical" : "warning",
        }
      : undefined,
  };
}

function findEarliestSlot(
  engineer: EngineerWithRelations,
  earliestStart: Date,
  deadline: Date | null,
  hoursNeeded: number,
  schedule: Map<string, number>,
  config: SchedulerConfig
): { startDate: Date; endDate: Date } | null {
  const workingDays = engineer.workingDays.split(",").map(Number);
  const dailyCapacity = config.hoursPerDay;

  let currentDate = new Date(earliestStart);
  let startDate: Date | null = null;
  let hoursAccumulated = 0;

  // Look ahead up to 365 days
  const maxDate = deadline || addDays(earliestStart, 365);

  while (currentDate <= maxDate && hoursAccumulated < hoursNeeded) {
    const dayOfWeek = currentDate.getDay();
    const dateKey = currentDate.toISOString().split("T")[0];

    // Check if it's a working day
    if (workingDays.includes(dayOfWeek)) {
      // Check unavailability
      const isUnavailable = engineer.unavailability.some((block) =>
        isWithinInterval(currentDate, {
          start: new Date(block.startDate),
          end: new Date(block.endDate),
        })
      );

      if (!isUnavailable) {
        const alreadyScheduled = schedule.get(dateKey) || 0;
        const availableHours = Math.max(0, dailyCapacity - alreadyScheduled);

        if (availableHours > 0) {
          if (!startDate) {
            startDate = new Date(currentDate);
          }
          hoursAccumulated += availableHours;
        }
      }
    }

    currentDate = addDays(currentDate, 1);
  }

  if (hoursAccumulated >= hoursNeeded && startDate) {
    return {
      startDate,
      endDate: addDays(currentDate, -1),
    };
  }

  return null;
}

function buildDependencyGraph(
  dependencies: { dependentId: string; dependencyId: string }[]
): DependencyGraph {
  const graph: DependencyGraph = {};

  for (const dep of dependencies) {
    if (!graph[dep.dependentId]) {
      graph[dep.dependentId] = [];
    }
    graph[dep.dependentId].push(dep.dependencyId);
  }

  return graph;
}

function topologicalSort(
  initiatives: InitiativeWithRelations[],
  dependencyGraph: DependencyGraph
): InitiativeWithRelations[] {
  const visited = new Set<string>();
  const result: InitiativeWithRelations[] = [];
  const initiativeMap = new Map(initiatives.map((i) => [i.id, i]));

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);

    const deps = dependencyGraph[id] || [];
    for (const depId of deps) {
      visit(depId);
    }

    const initiative = initiativeMap.get(id);
    if (initiative) {
      result.push(initiative);
    }
  }

  // Sort by deadline first, then priority
  const sortedByDeadline = [...initiatives].sort((a, b) => {
    if (a.deadline && b.deadline) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return b.priority - a.priority;
  });

  for (const initiative of sortedByDeadline) {
    visit(initiative.id);
  }

  return result;
}

function updateEngineerSchedule(
  schedules: Map<string, Map<string, number>>,
  engineerId: string,
  startDate: Date,
  endDate: Date,
  totalHours: number,
  hoursPerDay: number
) {
  const schedule = schedules.get(engineerId)!;
  let currentDate = new Date(startDate);
  const days = differenceInBusinessDays(endDate, startDate) + 1;
  const dailyHours = totalHours / Math.max(days, 1);

  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split("T")[0];
    const current = schedule.get(dateKey) || 0;
    schedule.set(dateKey, Math.min(current + dailyHours, hoursPerDay));
    currentDate = addDays(currentDate, 1);
  }
}

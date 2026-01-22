import {
  EngineerWithRelations,
  InitiativeWithRelations,
  AssignmentRecommendation,
  SchedulerConfig,
  DEFAULT_CONFIG,
} from "./types";
import {
  differenceInBusinessDays,
  isWithinInterval,
  addDays,
} from "date-fns";

/**
 * Recommends the best engineers for an initiative based on:
 * - Specialty match (primary vs secondary)
 * - Current workload
 * - Deadline feasibility
 */
export function recommendEngineers(
  initiative: InitiativeWithRelations,
  engineers: EngineerWithRelations[],
  config: SchedulerConfig = DEFAULT_CONFIG
): AssignmentRecommendation[] {
  const now = new Date();
  const deadline = initiative.deadline ? new Date(initiative.deadline) : null;
  // Convert weeks to hours (effortEstimate is stored in weeks)
  const effortHours = (initiative.effortEstimate || 0) * config.hoursPerWeek;

  // Get specialty IDs required for this initiative
  const requiredSpecialtyIds = initiative.tags.map((t) => t.specialtyId);

  const recommendations: AssignmentRecommendation[] = [];

  for (const engineer of engineers) {
    if (!engineer.isActive) continue;

    const reasons: string[] = [];
    let specialtyScore = 0;
    let loadScore = 0;
    let feasibilityScore = 0;

    // Calculate specialty match score
    const primaryMatches = engineer.specialties.filter(
      (s) => s.level === "PRIMARY" && requiredSpecialtyIds.includes(s.specialtyId)
    );
    const secondaryMatches = engineer.specialties.filter(
      (s) => s.level === "SECONDARY" && requiredSpecialtyIds.includes(s.specialtyId)
    );

    if (primaryMatches.length > 0) {
      specialtyScore = config.weights.primarySpecialty;
      reasons.push(
        `Primary specialty match: ${primaryMatches.map((m) => m.specialty.name).join(", ")}`
      );
    } else if (secondaryMatches.length > 0) {
      specialtyScore = config.weights.secondarySpecialty;
      reasons.push(
        `Secondary specialty match: ${secondaryMatches.map((m) => m.specialty.name).join(", ")}`
      );
    } else if (requiredSpecialtyIds.length === 0) {
      // No specialty requirements, give partial score
      specialtyScore = config.weights.secondarySpecialty / 2;
      reasons.push("No specialty requirements for this initiative");
    }

    // Calculate current load score (inverse - less load = higher score)
    const currentLoad = calculateCurrentLoad(engineer, now);
    const loadPercentage = currentLoad / engineer.weeklyCapacity;
    loadScore = Math.max(0, config.weights.currentLoad * (1 - loadPercentage));

    if (loadPercentage < 0.5) {
      reasons.push(`Low current load (${Math.round(loadPercentage * 100)}% capacity used)`);
    } else if (loadPercentage < 0.8) {
      reasons.push(`Moderate current load (${Math.round(loadPercentage * 100)}% capacity used)`);
    } else {
      reasons.push(`High current load (${Math.round(loadPercentage * 100)}% capacity used)`);
    }

    // Calculate deadline feasibility score
    if (deadline && effortHours > 0) {
      const availability = calculateAvailability(
        engineer,
        now,
        deadline,
        config.hoursPerDay
      );

      if (availability >= effortHours) {
        feasibilityScore = config.weights.deadlineFeasibility;
        reasons.push(`Can complete before deadline (${availability}h available)`);
      } else if (availability >= effortHours * 0.7) {
        feasibilityScore = config.weights.deadlineFeasibility * 0.5;
        reasons.push(
          `Partial capacity before deadline (${availability}h of ${effortHours}h needed)`
        );
      } else {
        reasons.push(
          `Insufficient capacity before deadline (${availability}h of ${effortHours}h needed)`
        );
      }
    } else {
      // No deadline constraint
      feasibilityScore = config.weights.deadlineFeasibility * 0.8;
      reasons.push("No deadline constraint");
    }

    const totalScore = specialtyScore + loadScore + feasibilityScore;

    recommendations.push({
      engineerId: engineer.id,
      engineerName: engineer.name,
      score: totalScore,
      reasons,
      breakdown: {
        specialtyScore,
        loadScore,
        feasibilityScore,
      },
    });
  }

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations.slice(0, 5); // Return top 5
}

/**
 * Calculate current workload for an engineer in the current week
 */
function calculateCurrentLoad(
  engineer: EngineerWithRelations,
  now: Date
): number {
  const weekStart = getWeekStart(now);
  const weekEnd = addDays(weekStart, 7);

  let totalHours = 0;
  for (const block of engineer.scheduledBlocks) {
    const blockStart = new Date(block.startDate);
    const blockEnd = new Date(block.endDate);

    // Check if block overlaps with current week
    if (blockStart <= weekEnd && blockEnd >= weekStart) {
      // Calculate overlap days
      const overlapStart = blockStart < weekStart ? weekStart : blockStart;
      const overlapEnd = blockEnd > weekEnd ? weekEnd : blockEnd;
      const overlapDays = differenceInBusinessDays(overlapEnd, overlapStart) + 1;

      // Estimate hours per day from block
      const blockDays = differenceInBusinessDays(blockEnd, blockStart) + 1;
      const hoursPerDay = block.hoursAllocated / Math.max(blockDays, 1);

      totalHours += hoursPerDay * overlapDays;
    }
  }

  return totalHours;
}

/**
 * Calculate available hours between now and deadline, excluding unavailability
 */
function calculateAvailability(
  engineer: EngineerWithRelations,
  startDate: Date,
  endDate: Date,
  hoursPerDay: number
): number {
  const workingDays = engineer.workingDays.split(",").map(Number);
  let availableHours = 0;
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();

    // Check if it's a working day
    if (workingDays.includes(dayOfWeek)) {
      // Check if the day is available (not blocked)
      const isUnavailable = engineer.unavailability.some((block) =>
        isWithinInterval(currentDate, {
          start: new Date(block.startDate),
          end: new Date(block.endDate),
        })
      );

      if (!isUnavailable) {
        availableHours += hoursPerDay;
      }
    }

    currentDate = addDays(currentDate, 1);
  }

  // Subtract already scheduled work
  for (const block of engineer.scheduledBlocks) {
    const blockStart = new Date(block.startDate);
    const blockEnd = new Date(block.endDate);

    if (blockStart <= endDate && blockEnd >= startDate) {
      // Calculate overlap
      const overlapStart = blockStart < startDate ? startDate : blockStart;
      const overlapEnd = blockEnd > endDate ? endDate : blockEnd;
      const overlapDays = differenceInBusinessDays(overlapEnd, overlapStart) + 1;
      const blockDays = differenceInBusinessDays(blockEnd, blockStart) + 1;
      const hoursInOverlap =
        (block.hoursAllocated / Math.max(blockDays, 1)) * overlapDays;

      availableHours -= hoursInOverlap;
    }
  }

  return Math.max(0, availableHours);
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

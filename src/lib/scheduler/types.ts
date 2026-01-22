import {
  Engineer,
  EngineerSpecialty,
  Specialty,
  Initiative,
  InitiativeTag,
  ScheduledBlock,
  UnavailabilityBlock,
} from "@prisma/client";

export type EngineerWithRelations = Engineer & {
  specialties: (EngineerSpecialty & { specialty: Specialty })[];
  unavailability: UnavailabilityBlock[];
  scheduledBlocks: ScheduledBlock[];
};

export type InitiativeWithRelations = Initiative & {
  tags: (InitiativeTag & { specialty: Specialty })[];
  scheduledBlocks: ScheduledBlock[];
};

export interface AssignmentRecommendation {
  engineerId: string;
  engineerName: string;
  score: number;
  reasons: string[];
  breakdown: {
    specialtyScore: number;
    loadScore: number;
    feasibilityScore: number;
  };
}

export interface ScheduleBlock {
  initiativeId: string;
  engineerId: string;
  startDate: Date;
  endDate: Date;
  hoursAllocated: number;
  isAtRisk: boolean;
  riskReason?: string;
}

export interface ScheduleResult {
  blocks: ScheduleBlock[];
  risks: RiskFlag[];
  unscheduled: string[]; // initiative IDs that couldn't be scheduled
}

export interface RiskFlag {
  initiativeId: string;
  reason: string;
  severity: "warning" | "critical";
}

export interface SchedulerConfig {
  weights: {
    primarySpecialty: number;
    secondarySpecialty: number;
    currentLoad: number;
    deadlineFeasibility: number;
  };
  bufferDays: number; // days before deadline to finish
  hoursPerDay: number; // working hours per day
  hoursPerWeek: number; // working hours per week (for converting effort estimates)
}

export const DEFAULT_CONFIG: SchedulerConfig = {
  weights: {
    primarySpecialty: 40,
    secondarySpecialty: 20,
    currentLoad: 25,
    deadlineFeasibility: 15,
  },
  bufferDays: 2,
  hoursPerDay: 8,
  hoursPerWeek: 40,
};

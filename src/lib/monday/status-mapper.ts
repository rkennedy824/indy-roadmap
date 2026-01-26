import type { IdeaStatus, InitiativeStatus } from "@prisma/client";

// Default mappings from Monday status labels to INDY statuses
const DEFAULT_IDEA_STATUS_MAP: Record<string, IdeaStatus> = {
  // Common Monday status labels
  new: "NEW",
  stuck: "NEEDS_CLARIFICATION",
  "working on it": "TRIAGED",
  done: "ACCEPTED",
  rejected: "REJECTED",
  promoted: "PROMOTED",
  archived: "ARCHIVED",

  // Additional variations
  "needs review": "NEEDS_CLARIFICATION",
  "in review": "TRIAGED",
  approved: "ACCEPTED",
  completed: "ACCEPTED",
  closed: "ARCHIVED",
};

const DEFAULT_INITIATIVE_STATUS_MAP: Record<string, InitiativeStatus> = {
  draft: "DRAFT",
  new: "PROPOSED",
  proposed: "PROPOSED",
  approved: "APPROVED",
  "working on it": "IN_PROGRESS",
  "in progress": "IN_PROGRESS",
  "dev complete": "DEV_COMPLETE",
  "in review": "DEV_COMPLETE",
  done: "DONE",
  completed: "DONE",
  stuck: "BLOCKED",
  blocked: "BLOCKED",
};

const INDY_IDEA_TO_MONDAY: Record<IdeaStatus, string> = {
  NEW: "New",
  NEEDS_CLARIFICATION: "Stuck",
  TRIAGED: "Working on it",
  ACCEPTED: "Done",
  REJECTED: "Rejected",
  PROMOTED: "Promoted",
  ARCHIVED: "Archived",
};

const INDY_INITIATIVE_TO_MONDAY: Record<InitiativeStatus, string> = {
  DRAFT: "Draft",
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  IN_PROGRESS: "Working on it",
  DEV_COMPLETE: "Dev Complete",
  DONE: "Done",
  BLOCKED: "Stuck",
};

export function mapMondayStatusToIdea(
  mondayLabel: string,
  customMappings?: Record<string, IdeaStatus>
): IdeaStatus {
  const normalized = mondayLabel.toLowerCase().trim();

  // Check custom mappings first
  if (customMappings?.[normalized]) {
    return customMappings[normalized];
  }

  // Fall back to defaults
  return DEFAULT_IDEA_STATUS_MAP[normalized] || "NEW";
}

export function mapMondayStatusToInitiative(
  mondayLabel: string,
  customMappings?: Record<string, InitiativeStatus>
): InitiativeStatus {
  const normalized = mondayLabel.toLowerCase().trim();

  if (customMappings?.[normalized]) {
    return customMappings[normalized];
  }

  return DEFAULT_INITIATIVE_STATUS_MAP[normalized] || "DRAFT";
}

export function mapIdeaStatusToMonday(
  status: IdeaStatus,
  customMappings?: Record<IdeaStatus, string>
): string {
  return customMappings?.[status] || INDY_IDEA_TO_MONDAY[status];
}

export function mapInitiativeStatusToMonday(
  status: InitiativeStatus,
  customMappings?: Record<InitiativeStatus, string>
): string {
  return customMappings?.[status] || INDY_INITIATIVE_TO_MONDAY[status];
}

/**
 * Build custom mappings from database status mapping records
 */
export function buildStatusMappings(
  statusMappings: Array<{ mondayLabelName: string; indyStatus: string }>,
  entityType: "IDEA" | "INITIATIVE"
): Record<string, string> {
  const mappings: Record<string, string> = {};

  for (const mapping of statusMappings) {
    const key = mapping.mondayLabelName.toLowerCase().trim();
    mappings[key] = mapping.indyStatus;
  }

  return mappings;
}

/**
 * Get all available INDY statuses for a given entity type
 */
export function getIndyStatuses(entityType: "IDEA" | "INITIATIVE"): string[] {
  if (entityType === "IDEA") {
    return Object.keys(INDY_IDEA_TO_MONDAY);
  }
  return Object.keys(INDY_INITIATIVE_TO_MONDAY);
}

/**
 * Get default Monday labels for a given entity type
 */
export function getDefaultMondayLabels(
  entityType: "IDEA" | "INITIATIVE"
): string[] {
  if (entityType === "IDEA") {
    return Object.values(INDY_IDEA_TO_MONDAY);
  }
  return Object.values(INDY_INITIATIVE_TO_MONDAY);
}

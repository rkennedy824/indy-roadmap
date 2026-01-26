import type {
  MondayColumnValue,
  MondayColumnType,
  FieldMappingConfig,
  TransformedValue,
} from "./types";

export interface FieldMapping {
  mondayColumnId: string;
  mondayColumnType: MondayColumnType;
  indyFieldName: string;
  indyFieldType: string;
  syncDirection?: "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";
  config?: FieldMappingConfig;
}

/**
 * Transform a Monday column value to an INDY field value
 */
export function transformMondayToIndy(
  columnValue: MondayColumnValue,
  mapping: FieldMapping
): TransformedValue {
  const { text, value } = columnValue;
  const parsedValue = value ? safeJsonParse(value) : null;

  switch (mapping.mondayColumnType) {
    case "text":
    case "long-text":
      return { value: text || parsedValue || null, valid: true };

    case "name":
      return { value: text, valid: true };

    case "status":
      // Status is handled separately via status mapper
      return { value: text, valid: true };

    case "date":
      if (!parsedValue || typeof parsedValue !== "object" || !("date" in parsedValue)) {
        return { value: null, valid: true };
      }
      try {
        const dateVal = (parsedValue as { date: string }).date;
        return { value: new Date(dateVal), valid: true };
      } catch {
        return { value: null, valid: false, error: "Invalid date format" };
      }

    case "person":
      // Extract person IDs
      if (parsedValue && typeof parsedValue === "object" && "personsAndTeams" in parsedValue) {
        const pv = parsedValue as { personsAndTeams: Array<{ kind: string; id: number; name: string }> };
        const persons = pv.personsAndTeams
          .filter((p) => p.kind === "person")
          .map((p) => ({
            id: p.id,
            name: p.name,
          }));
        return { value: persons, valid: true };
      }
      return { value: null, valid: true };

    case "dropdown":
    case "tags":
      // Extract label values
      if (parsedValue && typeof parsedValue === "object" && "ids" in parsedValue) {
        const pv = parsedValue as { ids: number[]; labels?: Array<{ id: number; name: string }> };
        const labels = pv.ids.map(
          (id) =>
            pv.labels?.find((l) => l.id === id)?.name || String(id)
        );
        return { value: labels, valid: true };
      }
      return { value: text?.split(", ") || [], valid: true };

    case "numbers":
      const num = parseFloat(text || "");
      return { value: isNaN(num) ? null : num, valid: true };

    case "link":
      if (parsedValue?.url) {
        return { value: parsedValue.url, valid: true };
      }
      return { value: text, valid: true };

    case "checkbox":
      return { value: parsedValue?.checked === true, valid: true };

    default:
      return { value: text, valid: true };
  }
}

/**
 * Transform an INDY field value to Monday column format
 */
export function transformIndyToMonday(
  value: unknown,
  mapping: FieldMapping
): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  const columnId = mapping.mondayColumnId;

  switch (mapping.mondayColumnType) {
    case "text":
      return { [columnId]: String(value) };

    case "long-text":
      return { [columnId]: { text: String(value) } };

    case "status":
      // Status labels are set by name
      return { [columnId]: { label: String(value) } };

    case "date":
      if (value instanceof Date) {
        return { [columnId]: { date: value.toISOString().split("T")[0] } };
      }
      if (typeof value === "string") {
        return { [columnId]: { date: value.split("T")[0] } };
      }
      return null;

    case "numbers":
      return { [columnId]: String(value) };

    case "link":
      if (typeof value === "string") {
        return { [columnId]: { url: value, text: value } };
      }
      return null;

    case "dropdown":
    case "tags":
      if (Array.isArray(value)) {
        return { [columnId]: { labels: value.map(String) } };
      }
      return null;

    case "checkbox":
      return { [columnId]: { checked: value === true ? "true" : "false" } };

    default:
      return { [columnId]: value };
  }
}

function safeJsonParse(str: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Build column values object for Monday API from INDY entity
 */
export function buildMondayColumnValues(
  entity: Record<string, unknown>,
  mappings: FieldMapping[]
): Record<string, unknown> {
  const columnValues: Record<string, unknown> = {};

  for (const mapping of mappings) {
    if (mapping.syncDirection === "INBOUND") continue;

    const value = entity[mapping.indyFieldName];
    const transformed = transformIndyToMonday(value, mapping);

    if (transformed) {
      Object.assign(columnValues, transformed);
    }
  }

  return columnValues;
}

/**
 * Extract mapped fields from a Monday item
 */
export function extractMappedFields(
  columnValues: MondayColumnValue[],
  mappings: FieldMapping[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of mappings) {
    if (mapping.syncDirection === "OUTBOUND") continue;

    const colValue = columnValues.find((c) => c.id === mapping.mondayColumnId);
    if (!colValue) continue;

    const transformed = transformMondayToIndy(colValue, mapping);
    if (transformed.valid && transformed.value !== null) {
      result[mapping.indyFieldName] = transformed.value;
    }
  }

  return result;
}

/**
 * Get compatible INDY field types for a Monday column type
 */
export function getCompatibleIndyFields(
  mondayColumnType: MondayColumnType
): string[] {
  switch (mondayColumnType) {
    case "text":
    case "long-text":
      return [
        "title",
        "problemStatement",
        "description",
        "whoIsImpacted",
        "whereItHappens",
        "frequency",
        "severity",
        "currentWorkaround",
        "desiredOutcome",
        "evidence",
      ];

    case "status":
      return ["status"];

    case "date":
      return ["deadline", "betaTargetDate", "masterTargetDate"];

    case "dropdown":
    case "tags":
      return ["tags"];

    case "numbers":
      return [
        "priority",
        "effortEstimate",
        "impactScore",
        "confidenceScore",
        "easeScore",
      ];

    case "person":
      return ["assignee", "owner"];

    default:
      return [];
  }
}

/**
 * Get INDY fields that can be mapped for an entity type
 */
export function getIndyFieldsForEntity(
  entityType: "IDEA" | "INITIATIVE"
): Array<{ name: string; type: string; label: string }> {
  if (entityType === "IDEA") {
    return [
      { name: "title", type: "string", label: "Title" },
      { name: "problemStatement", type: "text", label: "Problem Statement" },
      { name: "whoIsImpacted", type: "string", label: "Who is Impacted" },
      { name: "whereItHappens", type: "string", label: "Where it Happens" },
      { name: "frequency", type: "string", label: "Frequency" },
      { name: "severity", type: "string", label: "Severity" },
      { name: "currentWorkaround", type: "text", label: "Current Workaround" },
      { name: "desiredOutcome", type: "text", label: "Desired Outcome" },
      { name: "evidence", type: "text", label: "Evidence" },
      { name: "status", type: "status", label: "Status" },
      { name: "priority", type: "number", label: "Priority" },
      { name: "impactScore", type: "number", label: "Impact Score" },
      { name: "confidenceScore", type: "number", label: "Confidence Score" },
      { name: "easeScore", type: "number", label: "Ease Score" },
    ];
  }

  return [
    { name: "title", type: "string", label: "Title" },
    { name: "description", type: "text", label: "Description" },
    { name: "status", type: "status", label: "Status" },
    { name: "priority", type: "number", label: "Priority" },
    { name: "effortEstimate", type: "number", label: "Effort Estimate (weeks)" },
    { name: "deadline", type: "date", label: "Deadline" },
    { name: "betaTargetDate", type: "date", label: "Beta Target Date" },
    { name: "masterTargetDate", type: "date", label: "Master Target Date" },
  ];
}

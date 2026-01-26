// Monday.com API Types for GraphQL API

export interface MondayConfig {
  accessToken: string;
  apiVersion: string;
  accountId?: string;
}

// ============================================
// Monday API Response Types
// ============================================

export interface MondayUser {
  id: number;
  name: string;
  email: string;
  photo_thumb?: string;
}

export interface MondayBoard {
  id: string;
  name: string;
  description?: string;
  state: "active" | "archived" | "deleted";
  board_kind: "public" | "private" | "share";
  columns: MondayColumn[];
  groups: MondayGroup[];
}

export interface MondayColumn {
  id: string;
  title: string;
  type: MondayColumnType;
  settings_str: string; // JSON string with column settings
}

export type MondayColumnType =
  | "text"
  | "long-text"
  | "status"
  | "date"
  | "person"
  | "dropdown"
  | "tags"
  | "link"
  | "numbers"
  | "timeline"
  | "checkbox"
  | "color"
  | "name"; // Item name column

export interface MondayGroup {
  id: string;
  title: string;
  color: string;
  position: string;
}

export interface MondayItem {
  id: string;
  name: string;
  state: "active" | "archived" | "deleted";
  created_at: string;
  updated_at: string;
  board: { id: string; name: string };
  group: { id: string; title: string };
  column_values: MondayColumnValue[];
  creator?: MondayUser;
}

export interface MondayColumnValue {
  id: string;
  type: MondayColumnType;
  text: string | null; // Display text
  value: string | null; // JSON value (parse for rich data)
  additional_info?: string; // Extra context
}

export interface MondayStatusLabel {
  id: number;
  label: string;
  color: string;
}

// ============================================
// GraphQL Query Types
// ============================================

export interface MondayGraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: {
      code: string;
      exception?: { stacktrace?: string[] };
    };
  }>;
  account_id?: number;
}

export interface MondayRateLimitInfo {
  complexity_budget: number;
  complexity_used: number;
  reset_in_x_seconds: number;
}

// ============================================
// Webhook Types
// ============================================

export interface MondayWebhookEvent {
  event: {
    type: MondayEventType;
    triggerTime: string;
    subscriptionId: number;
    userId: number;
    originalTriggerUuid?: string;
    boardId: number;
    pulseId: number; // Item ID
    pulseName?: string;
    groupId?: string;
    columnId?: string;
    columnType?: string;
    columnTitle?: string;
    value?: {
      label?: { index: number; text: string };
      linkedPulseIds?: number[];
      date?: string;
      text?: string;
    };
    previousValue?: Record<string, unknown>;
  };
  challenge?: string; // For verification
}

export type MondayEventType =
  | "create_pulse" // Item created
  | "update_column_value" // Column value changed
  | "change_status_column_value" // Status specifically changed
  | "delete_pulse" // Item deleted
  | "archive_pulse" // Item archived
  | "create_update" // Update/comment added
  | "move_pulse" // Item moved to different group
  | "change_name"; // Item name changed

// ============================================
// Sync Types
// ============================================

export type SyncDirection = "push" | "pull" | "none";

export interface SyncResult {
  success: boolean;
  direction: SyncDirection;
  error?: string;
  conflictDetected?: boolean;
  changes?: Record<string, { old: unknown; new: unknown }>;
}

export interface BackfillResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ itemId: string; error: string }>;
}

// ============================================
// Field Mapping Types
// ============================================

export interface FieldMappingConfig {
  defaultValue?: unknown;
  mapping?: Record<string, string>; // For enum/dropdown mappings
  format?: string; // For date formatting
  separator?: string; // For array fields
}

export interface TransformedValue {
  value: unknown;
  valid: boolean;
  error?: string;
}

// ============================================
// Parsed Webhook Event (normalized)
// ============================================

export interface ParsedWebhookEvent {
  type: MondayEventType;
  boardId: string;
  itemId: string;
  itemName?: string;
  userId: number;
  timestamp: Date;
  subscriptionId?: number;
  columnId?: string;
  columnType?: string;
  newValue?: unknown;
  previousValue?: unknown;
}

import type { MondayWebhookEvent, MondayEventType, ParsedWebhookEvent } from "./types";

export interface WebhookVerificationResult {
  verified: boolean;
  challenge?: string;
  error?: string;
}

/**
 * Verify a Monday.com webhook challenge request
 * Monday sends a POST with { challenge: "..." } that must be echoed back
 */
export function verifyWebhookChallenge(
  payload: unknown
): WebhookVerificationResult {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "challenge" in payload &&
    typeof (payload as MondayWebhookEvent).challenge === "string"
  ) {
    return {
      verified: true,
      challenge: (payload as MondayWebhookEvent).challenge,
    };
  }
  return { verified: false };
}

/**
 * Parse a Monday.com webhook event payload
 */
export function parseWebhookEvent(payload: unknown): ParsedWebhookEvent | null {
  if (typeof payload !== "object" || payload === null || !("event" in payload)) {
    return null;
  }

  const event = (payload as MondayWebhookEvent).event;

  if (!event || typeof event !== "object") {
    return null;
  }

  return {
    type: event.type,
    boardId: String(event.boardId),
    itemId: String(event.pulseId),
    itemName: event.pulseName,
    userId: event.userId,
    timestamp: new Date(event.triggerTime),
    subscriptionId: event.subscriptionId,
    columnId: event.columnId,
    columnType: event.columnType,
    newValue: event.value,
    previousValue: event.previousValue,
  };
}

/**
 * Determine if a webhook event should trigger sync
 */
export function shouldProcessEvent(
  event: ParsedWebhookEvent,
  lastOutboundAt?: Date | null,
  lockDurationMs = 5000 // 5 second loop prevention window
): { process: boolean; reason?: string } {
  // Check for loop prevention
  if (lastOutboundAt) {
    const timeSinceOutbound = Date.now() - lastOutboundAt.getTime();
    if (timeSinceOutbound < lockDurationMs) {
      return {
        process: false,
        reason: `Loop prevention: outbound update ${timeSinceOutbound}ms ago`,
      };
    }
  }

  // Always process create events
  if (event.type === "create_pulse") {
    return { process: true };
  }

  // Process column updates
  if (
    event.type === "update_column_value" ||
    event.type === "change_status_column_value" ||
    event.type === "change_name"
  ) {
    return { process: true };
  }

  // Skip archive/delete for now
  if (event.type === "delete_pulse" || event.type === "archive_pulse") {
    return { process: false, reason: "Archive/delete not handled" };
  }

  return { process: false, reason: `Unknown event type: ${event.type}` };
}

/**
 * Get webhook event types that should be registered for a board
 */
export function getWebhookEventTypes(): MondayEventType[] {
  return [
    "create_pulse",
    "update_column_value",
    "change_status_column_value",
    "change_name",
  ];
}

/**
 * Validate that a webhook payload has the expected structure
 */
export function isValidWebhookPayload(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  // Challenge request
  if ("challenge" in payload) {
    return typeof (payload as { challenge: unknown }).challenge === "string";
  }

  // Event payload
  if ("event" in payload) {
    const event = (payload as { event: unknown }).event;
    if (typeof event !== "object" || event === null) {
      return false;
    }
    const e = event as Record<string, unknown>;
    return (
      typeof e.type === "string" &&
      typeof e.boardId === "number" &&
      typeof e.pulseId === "number"
    );
  }

  return false;
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyWebhookChallenge,
  parseWebhookEvent,
  shouldProcessEvent,
  isValidWebhookPayload,
} from "@/lib/monday/webhooks";
import { getMondayContext, processInboundItem } from "@/lib/monday/sync";

export async function POST(request: NextRequest) {
  let eventLogId: string | null = null;

  try {
    const payload = await request.json();

    // Validate payload structure
    if (!isValidWebhookPayload(payload)) {
      return NextResponse.json(
        { error: "Invalid payload structure" },
        { status: 400 }
      );
    }

    // Handle challenge verification
    const verification = verifyWebhookChallenge(payload);
    if (verification.verified) {
      return NextResponse.json({ challenge: verification.challenge });
    }

    // Parse the webhook event
    const event = parseWebhookEvent(payload);
    if (!event) {
      return NextResponse.json(
        { error: "Invalid event payload" },
        { status: 400 }
      );
    }

    // Find the board config for this event
    const boardConfig = await db.mondayBoardConfig.findFirst({
      where: {
        boardId: event.boardId,
        isActive: true,
        webhookEnabled: true,
      },
      include: {
        fieldMappings: true,
        statusMappings: true,
        integration: true,
      },
    });

    if (!boardConfig) {
      return NextResponse.json({ status: "ignored", reason: "No active config" });
    }

    // Check for existing link (for loop prevention)
    const existingLink = await db.mondayItemLink.findUnique({
      where: {
        boardConfigId_mondayItemId: {
          boardConfigId: boardConfig.id,
          mondayItemId: event.itemId,
        },
      },
    });

    // Log the event
    const eventLog = await db.integrationEventLog.create({
      data: {
        integrationId: boardConfig.integrationId,
        direction: "INBOUND",
        eventType: event.type,
        source: "webhook",
        mondayItemId: event.itemId,
        payload: payload,
        status: "PENDING",
        receivedAt: new Date(),
      },
    });
    eventLogId = eventLog.id;

    // Check if we should process
    const processCheck = shouldProcessEvent(event, existingLink?.lastOutboundAt);

    if (!processCheck.process) {
      await db.integrationEventLog.update({
        where: { id: eventLogId },
        data: {
          status: "SKIPPED",
          errorMessage: processCheck.reason,
          processedAt: new Date(),
        },
      });
      return NextResponse.json({
        status: "skipped",
        reason: processCheck.reason,
      });
    }

    // Fetch full item details and process
    const context = await getMondayContext();
    if (!context) {
      throw new Error("Monday integration not configured");
    }

    const mondayItem = await context.service.getItem(event.itemId);
    if (!mondayItem) {
      throw new Error("Item not found in Monday");
    }

    await db.integrationEventLog.update({
      where: { id: eventLogId },
      data: { status: "PROCESSING" },
    });

    const startTime = Date.now();
    const result = await processInboundItem(boardConfig, mondayItem);
    const duration = Date.now() - startTime;

    // Get the created/updated entity ID
    const updatedLink = await db.mondayItemLink.findUnique({
      where: {
        boardConfigId_mondayItemId: {
          boardConfigId: boardConfig.id,
          mondayItemId: event.itemId,
        },
      },
    });

    await db.integrationEventLog.update({
      where: { id: eventLogId },
      data: {
        status: result.success ? "SUCCESS" : "FAILED",
        errorMessage: result.error,
        processedAt: new Date(),
        durationMs: duration,
        indyEntityType: boardConfig.entityType.toLowerCase(),
        indyEntityId: updatedLink?.ideaId || updatedLink?.initiativeId,
      },
    });

    return NextResponse.json({ status: "processed", result });
  } catch (error) {
    console.error("Webhook processing error:", error);

    if (eventLogId) {
      await db.integrationEventLog.update({
        where: { id: eventLogId },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          processedAt: new Date(),
        },
      });
    }

    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

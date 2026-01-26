import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getMondayContext,
  backfillFromBoard,
  pushToMonday,
  pollBoard,
  processInboundItem,
} from "@/lib/monday/sync";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, boardConfigId, entityId, entityType } = body;

    switch (action) {
      case "test": {
        const context = await getMondayContext();
        if (!context) {
          return NextResponse.json({
            success: false,
            error: "Monday integration not configured",
          });
        }
        const result = await context.service.testConnection();
        return NextResponse.json(result);
      }

      case "backfill": {
        if (
          !session.user.role ||
          !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)
        ) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!boardConfigId) {
          return NextResponse.json(
            { error: "boardConfigId is required" },
            { status: 400 }
          );
        }

        const result = await backfillFromBoard(boardConfigId);

        // Log the backfill operation
        const boardConfig = await db.mondayBoardConfig.findUnique({
          where: { id: boardConfigId },
        });

        if (boardConfig) {
          await db.integrationEventLog.create({
            data: {
              integrationId: boardConfig.integrationId,
              direction: "INBOUND",
              eventType: "backfill",
              source: "manual",
              status: result.errors.length === 0 ? "SUCCESS" : "FAILED",
              payload: JSON.parse(JSON.stringify(result)),
              processedAt: new Date(),
            },
          });
        }

        return NextResponse.json(result);
      }

      case "push": {
        if (!entityId || !entityType) {
          return NextResponse.json(
            { error: "entityId and entityType are required" },
            { status: 400 }
          );
        }

        if (!["IDEA", "INITIATIVE"].includes(entityType)) {
          return NextResponse.json(
            { error: "entityType must be IDEA or INITIATIVE" },
            { status: 400 }
          );
        }

        const link =
          entityType === "IDEA"
            ? await db.mondayItemLink.findUnique({
                where: { ideaId: entityId },
                include: {
                  boardConfig: {
                    include: { fieldMappings: true, statusMappings: true },
                  },
                  idea: true,
                },
              })
            : await db.mondayItemLink.findUnique({
                where: { initiativeId: entityId },
                include: {
                  boardConfig: {
                    include: { fieldMappings: true, statusMappings: true },
                  },
                  initiative: true,
                },
              });

        if (!link) {
          return NextResponse.json(
            { error: "Entity not linked to Monday" },
            { status: 404 }
          );
        }

        type LinkWithIdea = typeof link & { idea: Parameters<typeof pushToMonday>[1] };
        type LinkWithInitiative = typeof link & { initiative: Parameters<typeof pushToMonday>[1] };

        const entity = entityType === "IDEA"
          ? (link as LinkWithIdea).idea
          : (link as LinkWithInitiative).initiative;
        if (!entity) {
          return NextResponse.json(
            { error: "Entity not found" },
            { status: 404 }
          );
        }

        const result = await pushToMonday(
          link as Parameters<typeof pushToMonday>[0],
          entity,
          entityType as "IDEA" | "INITIATIVE"
        );

        // Log the push
        await db.integrationEventLog.create({
          data: {
            integrationId: link.boardConfig.integrationId,
            direction: "OUTBOUND",
            eventType: "status.writeback",
            source: "manual",
            mondayItemId: link.mondayItemId,
            indyEntityType: entityType.toLowerCase(),
            indyEntityId: entityId,
            status: result.success ? "SUCCESS" : "FAILED",
            errorMessage: result.error,
            processedAt: new Date(),
          },
        });

        return NextResponse.json(result);
      }

      case "poll": {
        if (
          !session.user.role ||
          !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)
        ) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!boardConfigId) {
          return NextResponse.json(
            { error: "boardConfigId is required" },
            { status: 400 }
          );
        }

        const result = await pollBoard(boardConfigId);

        // Log the poll operation
        const boardConfig = await db.mondayBoardConfig.findUnique({
          where: { id: boardConfigId },
        });

        if (boardConfig) {
          await db.integrationEventLog.create({
            data: {
              integrationId: boardConfig.integrationId,
              direction: "INBOUND",
              eventType: "poll",
              source: "manual",
              status: result.errors === 0 ? "SUCCESS" : "FAILED",
              payload: JSON.parse(JSON.stringify(result)),
              processedAt: new Date(),
            },
          });
        }

        return NextResponse.json(result);
      }

      case "sync-item": {
        // Manually sync a specific Monday item
        if (!boardConfigId) {
          return NextResponse.json(
            { error: "boardConfigId is required" },
            { status: 400 }
          );
        }

        const { mondayItemId } = body;
        if (!mondayItemId) {
          return NextResponse.json(
            { error: "mondayItemId is required" },
            { status: 400 }
          );
        }

        const context = await getMondayContext();
        if (!context) {
          return NextResponse.json(
            { error: "Monday integration not configured" },
            { status: 400 }
          );
        }

        const boardConfig = await db.mondayBoardConfig.findUnique({
          where: { id: boardConfigId },
          include: { fieldMappings: true, statusMappings: true },
        });

        if (!boardConfig) {
          return NextResponse.json(
            { error: "Board config not found" },
            { status: 404 }
          );
        }

        const mondayItem = await context.service.getItem(mondayItemId);
        if (!mondayItem) {
          return NextResponse.json(
            { error: "Monday item not found" },
            { status: 404 }
          );
        }

        const result = await processInboundItem(boardConfig, mondayItem);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}

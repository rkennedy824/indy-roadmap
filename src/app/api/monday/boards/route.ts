import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMondayContext } from "@/lib/monday/sync";
import type { MondayEntityType, MondayIngestMode } from "@prisma/client";

// GET - List available boards from Monday
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getMondayContext();
    if (!context) {
      return NextResponse.json(
        { error: "Monday integration not configured" },
        { status: 400 }
      );
    }

    const boards = await context.service.getBoards();

    // Get configured boards to mark which are already set up
    const configuredBoards = await db.mondayBoardConfig.findMany({
      select: { boardId: true },
    });
    const configuredIds = new Set(configuredBoards.map((b) => b.boardId));

    return NextResponse.json({
      boards: boards.map((board) => ({
        id: board.id,
        name: board.name,
        description: board.description,
        state: board.state,
        boardKind: board.board_kind,
        isConfigured: configuredIds.has(board.id),
        columns: board.columns.map((col) => ({
          id: col.id,
          title: col.title,
          type: col.type,
        })),
        groups: board.groups.map((group) => ({
          id: group.id,
          title: group.title,
          color: group.color,
        })),
      })),
    });
  } catch (error) {
    console.error("Error fetching Monday boards:", error);
    return NextResponse.json(
      { error: "Failed to fetch boards" },
      { status: 500 }
    );
  }
}

// POST - Configure a board for sync
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      boardId,
      boardName,
      entityType,
      ingestMode,
      writebackEnabled,
      webhookEnabled,
      pollingEnabled,
      pollingIntervalMins,
    } = body;

    if (!boardId) {
      return NextResponse.json(
        { error: "boardId is required" },
        { status: 400 }
      );
    }

    const integration = await db.mondayIntegration.findFirst({
      where: { isActive: true },
    });

    if (!integration) {
      return NextResponse.json(
        { error: "Monday integration not configured" },
        { status: 400 }
      );
    }

    // Check if board is already configured
    const existing = await db.mondayBoardConfig.findFirst({
      where: {
        integrationId: integration.id,
        boardId,
      },
    });

    if (existing) {
      // Update existing config
      const updated = await db.mondayBoardConfig.update({
        where: { id: existing.id },
        data: {
          boardName: boardName ?? existing.boardName,
          entityType: (entityType as MondayEntityType) ?? existing.entityType,
          ingestMode: (ingestMode as MondayIngestMode) ?? existing.ingestMode,
          writebackEnabled: writebackEnabled ?? existing.writebackEnabled,
          webhookEnabled: webhookEnabled ?? existing.webhookEnabled,
          pollingEnabled: pollingEnabled ?? existing.pollingEnabled,
          pollingIntervalMins:
            pollingIntervalMins ?? existing.pollingIntervalMins,
        },
        include: {
          fieldMappings: true,
          statusMappings: true,
          _count: { select: { itemLinks: true } },
        },
      });

      return NextResponse.json({ boardConfig: updated });
    }

    // Create new config
    const boardConfig = await db.mondayBoardConfig.create({
      data: {
        integrationId: integration.id,
        boardId,
        boardName: boardName || null,
        entityType: (entityType as MondayEntityType) || "IDEA",
        ingestMode: (ingestMode as MondayIngestMode) || "CONTINUOUS",
        writebackEnabled: writebackEnabled ?? false,
        webhookEnabled: webhookEnabled ?? true,
        pollingEnabled: pollingEnabled ?? true,
        pollingIntervalMins: pollingIntervalMins ?? 5,
      },
      include: {
        fieldMappings: true,
        statusMappings: true,
        _count: { select: { itemLinks: true } },
      },
    });

    return NextResponse.json({ boardConfig }, { status: 201 });
  } catch (error) {
    console.error("Error configuring Monday board:", error);
    return NextResponse.json(
      { error: "Failed to configure board" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMondayContext } from "@/lib/monday/sync";

// GET - Get board details and columns
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: boardConfigId } = await params;

  try {
    const boardConfig = await db.mondayBoardConfig.findUnique({
      where: { id: boardConfigId },
      include: {
        fieldMappings: true,
        statusMappings: true,
        _count: { select: { itemLinks: true } },
      },
    });

    if (!boardConfig) {
      return NextResponse.json(
        { error: "Board config not found" },
        { status: 404 }
      );
    }

    // Fetch latest board info from Monday
    const context = await getMondayContext();
    let mondayBoard = null;
    let statusLabels: Array<{ id: number; label: string; color: string }> = [];

    if (context) {
      mondayBoard = await context.service.getBoard(boardConfig.boardId);

      // Get status labels if there's a status column mapped
      const statusMapping = boardConfig.fieldMappings.find(
        (m) => m.indyFieldName === "status"
      );
      if (statusMapping) {
        statusLabels = await context.service.getStatusLabels(
          boardConfig.boardId,
          statusMapping.mondayColumnId
        );
      }
    }

    return NextResponse.json({
      boardConfig: {
        ...boardConfig,
        linkedItems: boardConfig._count.itemLinks,
      },
      mondayBoard: mondayBoard
        ? {
            id: mondayBoard.id,
            name: mondayBoard.name,
            columns: mondayBoard.columns.map((col) => ({
              id: col.id,
              title: col.title,
              type: col.type,
            })),
            groups: mondayBoard.groups.map((group) => ({
              id: group.id,
              title: group.title,
              color: group.color,
            })),
          }
        : null,
      statusLabels,
    });
  } catch (error) {
    console.error("Error fetching board config:", error);
    return NextResponse.json(
      { error: "Failed to fetch board config" },
      { status: 500 }
    );
  }
}

// PUT - Update board config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: boardConfigId } = await params;

  try {
    const body = await request.json();
    const {
      entityType,
      ingestMode,
      writebackEnabled,
      webhookEnabled,
      pollingEnabled,
      pollingIntervalMins,
      isActive,
    } = body;

    const boardConfig = await db.mondayBoardConfig.update({
      where: { id: boardConfigId },
      data: {
        ...(entityType !== undefined && { entityType }),
        ...(ingestMode !== undefined && { ingestMode }),
        ...(writebackEnabled !== undefined && { writebackEnabled }),
        ...(webhookEnabled !== undefined && { webhookEnabled }),
        ...(pollingEnabled !== undefined && { pollingEnabled }),
        ...(pollingIntervalMins !== undefined && { pollingIntervalMins }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        fieldMappings: true,
        statusMappings: true,
        _count: { select: { itemLinks: true } },
      },
    });

    return NextResponse.json({ boardConfig });
  } catch (error) {
    console.error("Error updating board config:", error);
    return NextResponse.json(
      { error: "Failed to update board config" },
      { status: 500 }
    );
  }
}

// DELETE - Remove board config
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: boardConfigId } = await params;

  try {
    await db.mondayBoardConfig.delete({
      where: { id: boardConfigId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting board config:", error);
    return NextResponse.json(
      { error: "Failed to delete board config" },
      { status: 500 }
    );
  }
}

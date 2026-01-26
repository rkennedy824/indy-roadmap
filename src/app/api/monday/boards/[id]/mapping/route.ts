import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { FieldSyncDirection } from "@prisma/client";

// GET - Get field and status mappings for a board
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
      },
    });

    if (!boardConfig) {
      return NextResponse.json(
        { error: "Board config not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      fieldMappings: boardConfig.fieldMappings,
      statusMappings: boardConfig.statusMappings,
    });
  } catch (error) {
    console.error("Error fetching mappings:", error);
    return NextResponse.json(
      { error: "Failed to fetch mappings" },
      { status: 500 }
    );
  }
}

// POST - Update field mappings (replace all)
export async function POST(
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
    const { fieldMappings, statusMappings } = body;

    // Verify board config exists
    const boardConfig = await db.mondayBoardConfig.findUnique({
      where: { id: boardConfigId },
    });

    if (!boardConfig) {
      return NextResponse.json(
        { error: "Board config not found" },
        { status: 404 }
      );
    }

    // Update field mappings if provided
    if (fieldMappings !== undefined) {
      // Delete existing field mappings
      await db.mondayFieldMapping.deleteMany({
        where: { boardConfigId },
      });

      // Create new field mappings
      if (Array.isArray(fieldMappings) && fieldMappings.length > 0) {
        for (const m of fieldMappings as Array<{
          mondayColumnId: string;
          mondayColumnType: string;
          mondayColumnTitle?: string;
          indyFieldName: string;
          indyFieldType: string;
          syncDirection?: FieldSyncDirection;
          isRequired?: boolean;
          transformConfig?: Record<string, unknown>;
        }>) {
          await db.mondayFieldMapping.create({
            data: {
              boardConfigId,
              mondayColumnId: m.mondayColumnId,
              mondayColumnType: m.mondayColumnType,
              mondayColumnTitle: m.mondayColumnTitle || null,
              indyFieldName: m.indyFieldName,
              indyFieldType: m.indyFieldType,
              syncDirection: m.syncDirection || "INBOUND",
              isRequired: m.isRequired || false,
              transformConfig: m.transformConfig ? JSON.parse(JSON.stringify(m.transformConfig)) : undefined,
            },
          });
        }
      }
    }

    // Update status mappings if provided
    if (statusMappings !== undefined) {
      // Delete existing status mappings
      await db.mondayStatusMapping.deleteMany({
        where: { boardConfigId },
      });

      // Create new status mappings
      if (Array.isArray(statusMappings) && statusMappings.length > 0) {
        await db.mondayStatusMapping.createMany({
          data: statusMappings.map(
            (m: {
              mondayLabelId?: string;
              mondayLabelName: string;
              mondayLabelColor?: string;
              indyStatus: string;
              createIfMissing?: boolean;
            }) => ({
              boardConfigId,
              mondayLabelId: m.mondayLabelId || null,
              mondayLabelName: m.mondayLabelName,
              mondayLabelColor: m.mondayLabelColor || null,
              indyStatus: m.indyStatus,
              createIfMissing: m.createIfMissing || false,
            })
          ),
        });
      }
    }

    // Fetch updated mappings
    const updatedConfig = await db.mondayBoardConfig.findUnique({
      where: { id: boardConfigId },
      include: {
        fieldMappings: true,
        statusMappings: true,
      },
    });

    return NextResponse.json({
      fieldMappings: updatedConfig?.fieldMappings || [],
      statusMappings: updatedConfig?.statusMappings || [],
    });
  } catch (error) {
    console.error("Error updating mappings:", error);
    return NextResponse.json(
      { error: "Failed to update mappings" },
      { status: 500 }
    );
  }
}

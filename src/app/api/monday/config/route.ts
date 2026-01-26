import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createMondayClient, createMondayService } from "@/lib/monday";

// GET - Get current Monday config (masked tokens)
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const integration = await db.mondayIntegration.findFirst({
      where: { isActive: true },
      include: {
        boardConfigs: {
          include: {
            fieldMappings: true,
            statusMappings: true,
            _count: { select: { itemLinks: true } },
          },
        },
      },
    });

    if (!integration) {
      return NextResponse.json({ integration: null });
    }

    return NextResponse.json({
      integration: {
        id: integration.id,
        accountId: integration.accountId,
        accountName: integration.accountName,
        apiVersion: integration.apiVersion,
        accessToken: "••••••••",
        isActive: integration.isActive,
        healthStatus: integration.healthStatus,
        lastHealthCheck: integration.lastHealthCheck,
        createdAt: integration.createdAt,
        boardConfigs: integration.boardConfigs.map((bc) => ({
          id: bc.id,
          boardId: bc.boardId,
          boardName: bc.boardName,
          entityType: bc.entityType,
          ingestMode: bc.ingestMode,
          writebackEnabled: bc.writebackEnabled,
          webhookEnabled: bc.webhookEnabled,
          webhookId: bc.webhookId,
          pollingEnabled: bc.pollingEnabled,
          pollingIntervalMins: bc.pollingIntervalMins,
          lastPolledAt: bc.lastPolledAt,
          isActive: bc.isActive,
          linkedItems: bc._count.itemLinks,
          fieldMappings: bc.fieldMappings,
          statusMappings: bc.statusMappings,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching Monday config:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
}

// POST - Create or update Monday integration
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accessToken, apiVersion, testConnection } = body;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Access token is required" },
        { status: 400 }
      );
    }

    const version = apiVersion || "2024-10";

    // Test connection if requested
    if (testConnection) {
      const client = createMondayClient({ accessToken, apiVersion: version });
      const service = createMondayService(client);
      const result = await service.testConnection();

      if (!result.success) {
        return NextResponse.json(
          { error: `Connection failed: ${result.error}` },
          { status: 400 }
        );
      }

      // Upsert integration
      const existing = await db.mondayIntegration.findFirst();

      const integration = existing
        ? await db.mondayIntegration.update({
            where: { id: existing.id },
            data: {
              accessToken,
              apiVersion: version,
              accountId: String(result.accountId),
              accountName: result.user,
              isActive: true,
              healthStatus: "healthy",
              lastHealthCheck: new Date(),
            },
          })
        : await db.mondayIntegration.create({
            data: {
              accessToken,
              apiVersion: version,
              accountId: String(result.accountId!),
              accountName: result.user,
              isActive: true,
              healthStatus: "healthy",
              lastHealthCheck: new Date(),
            },
          });

      return NextResponse.json({
        success: true,
        integration: {
          id: integration.id,
          accountId: integration.accountId,
          accountName: integration.accountName,
          apiVersion: integration.apiVersion,
        },
      });
    }

    return NextResponse.json(
      { error: "testConnection must be true" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error saving Monday config:", error);
    return NextResponse.json(
      { error: "Failed to save configuration" },
      { status: 500 }
    );
  }
}

// DELETE - Remove Monday integration
export async function DELETE() {
  const session = await auth();
  if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db.mondayIntegration.deleteMany();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting Monday config:", error);
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 }
    );
  }
}

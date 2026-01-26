import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - Get integration event logs
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");
  const direction = searchParams.get("direction"); // "INBOUND" | "OUTBOUND"
  const status = searchParams.get("status"); // "SUCCESS" | "FAILED" | "SKIPPED" | "PENDING"
  const integrationId = searchParams.get("integrationId");

  try {
    const where: Record<string, unknown> = {};

    if (direction) {
      where.direction = direction;
    }

    if (status) {
      where.status = status;
    }

    if (integrationId) {
      where.integrationId = integrationId;
    }

    const [events, total] = await Promise.all([
      db.integrationEventLog.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          integration: {
            select: { accountName: true },
          },
        },
      }),
      db.integrationEventLog.count({ where }),
    ]);

    // Get summary stats
    const stats = await db.integrationEventLog.groupBy({
      by: ["status"],
      _count: true,
      where: {
        receivedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    const lastSuccessfulInbound = await db.integrationEventLog.findFirst({
      where: {
        direction: "INBOUND",
        status: "SUCCESS",
      },
      orderBy: { processedAt: "desc" },
      select: { processedAt: true },
    });

    const lastSuccessfulOutbound = await db.integrationEventLog.findFirst({
      where: {
        direction: "OUTBOUND",
        status: "SUCCESS",
      },
      orderBy: { processedAt: "desc" },
      select: { processedAt: true },
    });

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        direction: e.direction,
        eventType: e.eventType,
        source: e.source,
        mondayItemId: e.mondayItemId,
        indyEntityType: e.indyEntityType,
        indyEntityId: e.indyEntityId,
        status: e.status,
        errorMessage: e.errorMessage,
        retryCount: e.retryCount,
        receivedAt: e.receivedAt,
        processedAt: e.processedAt,
        durationMs: e.durationMs,
        accountName: e.integration?.accountName,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + events.length < total,
      },
      stats: {
        last24Hours: stats.reduce(
          (acc, s) => {
            acc[s.status.toLowerCase()] = s._count;
            return acc;
          },
          {} as Record<string, number>
        ),
        lastSuccessfulInbound: lastSuccessfulInbound?.processedAt,
        lastSuccessfulOutbound: lastSuccessfulOutbound?.processedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}

// DELETE - Clear old events
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const olderThanDays = parseInt(searchParams.get("olderThanDays") || "30");

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await db.integrationEventLog.deleteMany({
      where: {
        receivedAt: {
          lt: cutoffDate,
        },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("Error clearing events:", error);
    return NextResponse.json(
      { error: "Failed to clear events" },
      { status: 500 }
    );
  }
}

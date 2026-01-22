import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { UnavailabilityType } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { engineerId, type, startDate, endDate, reason } = body;

    if (!engineerId || !type || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes: UnavailabilityType[] = ["PTO", "TRAVEL", "SICK", "HOLIDAY", "OTHER"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid unavailability type" },
        { status: 400 }
      );
    }

    // Verify engineer exists
    const engineer = await db.engineer.findUnique({
      where: { id: engineerId },
    });

    if (!engineer) {
      return NextResponse.json(
        { error: "Engineer not found" },
        { status: 404 }
      );
    }

    // Create the unavailability block
    const unavailabilityBlock = await db.unavailabilityBlock.create({
      data: {
        engineerId,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason || null,
      },
    });

    // Create audit log (optional - don't fail if this errors)
    try {
      await db.auditLog.create({
        data: {
          action: "CREATE",
          entityType: "UnavailabilityBlock",
          entityId: unavailabilityBlock.id,
          userId: (session.user as { id?: string })?.id || null,
          details: {
            engineerId,
            engineerName: engineer.name,
            type,
            startDate,
            endDate,
            reason,
          },
        },
      });
    } catch (auditError) {
      console.error("Failed to create audit log:", auditError);
    }

    return NextResponse.json(unavailabilityBlock);
  } catch (error) {
    console.error("Failed to create unavailability block:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create unavailability block", details: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const engineerId = searchParams.get("engineerId");

    const where = engineerId ? { engineerId } : {};

    const unavailabilityBlocks = await db.unavailabilityBlock.findMany({
      where,
      include: { engineer: true },
      orderBy: { startDate: "asc" },
    });

    return NextResponse.json(unavailabilityBlocks);
  } catch (error) {
    console.error("Failed to fetch unavailability blocks:", error);
    return NextResponse.json(
      { error: "Failed to fetch unavailability blocks" },
      { status: 500 }
    );
  }
}

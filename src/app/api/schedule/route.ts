import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateSchedule } from "@/lib/scheduler";

export async function GET() {
  try {
    const scheduledBlocks = await db.scheduledBlock.findMany({
      include: {
        initiative: true,
        engineer: true,
      },
      orderBy: { startDate: "asc" },
    });

    return NextResponse.json(scheduledBlocks);
  } catch (error) {
    console.error("Failed to fetch schedule:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule" },
      { status: 500 }
    );
  }
}

// Regenerate the entire schedule
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all required data
    const [initiatives, engineers, dependencies] = await Promise.all([
      db.initiative.findMany({
        where: {
          status: { notIn: ["DONE"] },
        },
        include: {
          tags: {
            include: { specialty: true },
          },
          scheduledBlocks: true,
        },
      }),
      db.engineer.findMany({
        where: { isActive: true },
        include: {
          specialties: {
            include: { specialty: true },
          },
          unavailability: {
            where: {
              endDate: { gte: new Date() },
            },
          },
          scheduledBlocks: true,
        },
      }),
      db.initiativeDependency.findMany(),
    ]);

    // Generate new schedule
    const result = generateSchedule(initiatives, engineers, dependencies);

    // Delete existing scheduled blocks (except for locked initiatives)
    const lockedInitiativeIds = initiatives
      .filter((i) => i.lockDates)
      .map((i) => i.id);

    await db.scheduledBlock.deleteMany({
      where: {
        initiativeId: { notIn: lockedInitiativeIds },
      },
    });

    // Create new scheduled blocks
    if (result.blocks.length > 0) {
      await db.scheduledBlock.createMany({
        data: result.blocks.map((block) => ({
          initiativeId: block.initiativeId,
          engineerId: block.engineerId,
          startDate: block.startDate,
          endDate: block.endDate,
          hoursAllocated: block.hoursAllocated,
          isAtRisk: block.isAtRisk,
          riskReason: block.riskReason,
        })),
      });
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "SCHEDULE",
        entityType: "Schedule",
        entityId: "full-regeneration",
        userId: session.user.id,
        details: {
          blocksCreated: result.blocks.length,
          risks: result.risks.length,
          unscheduled: result.unscheduled.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      blocksCreated: result.blocks.length,
      risks: result.risks,
      unscheduled: result.unscheduled,
    });
  } catch (error) {
    console.error("Failed to regenerate schedule:", error);
    return NextResponse.json(
      { error: "Failed to regenerate schedule" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

// Parse date string as local date at noon to avoid timezone issues
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

// Add business days to a date (skipping weekends)
function addBusinessDays(date: Date, numDays: number): Date {
  const result = new Date(date);
  let remaining = numDays;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      remaining--;
    }
  }
  return result;
}

// Calculate business days between two dates
function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { initiativeId, startDate, endDate, engineerId, squadId } = await request.json();

    if (!initiativeId || !startDate) {
      return NextResponse.json(
        { error: "Missing required fields: initiativeId, startDate" },
        { status: 400 }
      );
    }

    // Get the initiative
    const initiative = await db.initiative.findUnique({
      where: { id: initiativeId },
    });

    if (!initiative) {
      return NextResponse.json({ error: "Initiative not found" }, { status: 404 });
    }

    const start = parseLocalDate(startDate);

    // Calculate end date based on effort estimate if not provided or same as start
    // effortEstimate is in weeks, 1 week = 5 business days
    let end: Date;
    if (!endDate || endDate === startDate) {
      const effortWeeks = initiative.effortEstimate || 1;
      const businessDays = Math.max(1, Math.round(effortWeeks * 5)) - 1; // -1 because start day counts
      end = addBusinessDays(start, businessDays);
    } else {
      end = parseLocalDate(endDate);
    }

    // Determine the engineer or squad - use provided, fall back to assigned
    let targetEngineerId = engineerId || initiative.assignedEngineerId;
    let targetSquadId = squadId || (!targetEngineerId ? initiative.assignedSquadId : null);

    if (!targetEngineerId && !targetSquadId) {
      return NextResponse.json(
        { error: "No engineer or squad specified. Please select from an engineer's or squad's row on the roadmap, or assign one to the initiative first." },
        { status: 400 }
      );
    }

    // Verify engineer exists if specified
    if (targetEngineerId) {
      const engineer = await db.engineer.findUnique({
        where: { id: targetEngineerId },
      });

      if (!engineer) {
        return NextResponse.json({ error: "Engineer not found" }, { status: 404 });
      }
    }

    // Verify squad exists if specified
    if (targetSquadId && !targetEngineerId) {
      const squad = await db.squad.findUnique({
        where: { id: targetSquadId },
      });

      if (!squad) {
        return NextResponse.json({ error: "Squad not found" }, { status: 404 });
      }
    }

    // Calculate hours based on business days (assuming 8 hours per day)
    const businessDays = businessDaysBetween(start, end);
    const hoursAllocated = businessDays * 8;

    // Create the scheduled block
    const scheduledBlock = await db.scheduledBlock.create({
      data: {
        initiativeId,
        engineerId: targetEngineerId || null,
        squadId: !targetEngineerId ? targetSquadId : null,
        startDate: start,
        endDate: end,
        hoursAllocated,
        isAtRisk: false,
      },
    });

    // Update the initiative's assigned engineer/squad if it was unassigned
    // Also update effort estimate based on schedule duration
    const effortWeeks = Math.round((businessDays / 5) * 10) / 10; // Round to 1 decimal place
    const updateData: { assignedEngineerId?: string; assignedSquadId?: string; effortEstimate?: number } = {};

    if (!initiative.assignedEngineerId && targetEngineerId) {
      updateData.assignedEngineerId = targetEngineerId;
    }
    if (!initiative.assignedSquadId && targetSquadId && !targetEngineerId) {
      updateData.assignedSquadId = targetSquadId;
    }
    if (effortWeeks > 0) {
      updateData.effortEstimate = effortWeeks;
    }

    if (Object.keys(updateData).length > 0) {
      await db.initiative.update({
        where: { id: initiativeId },
        data: updateData,
      });
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "SCHEDULE",
        entityType: "ScheduledBlock",
        entityId: scheduledBlock.id,
        userId: session.user.id,
        details: {
          initiativeId,
          engineerId: targetEngineerId,
          startDate,
          endDate,
          hoursAllocated,
        },
      },
    });

    return NextResponse.json({
      success: true,
      scheduledBlock,
    });
  } catch (error) {
    console.error("Failed to schedule initiative:", error);
    return NextResponse.json(
      { error: "Failed to schedule initiative" },
      { status: 500 }
    );
  }
}

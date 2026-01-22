import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

// Parse date string as local date at noon to avoid timezone issues
function parseLocalDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  // For YYYY-MM-DD format, parse as local date at noon
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

// Calculate business days between two dates (excluding weekends)
function getBusinessDaysBetween(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

export async function GET() {
  try {
    const initiatives = await db.initiative.findMany({
      include: {
        tags: {
          include: { specialty: true },
        },
        assignedEngineer: true,
        assignedSquad: true,
        assignedEngineers: {
          include: { engineer: true, squad: true },
          orderBy: { isPrimary: "desc" },
        },
        scheduledBlocks: true,
        dependencies: {
          include: { dependency: true },
        },
      },
      orderBy: [{ priority: "desc" }, { deadline: "asc" }],
    });

    return NextResponse.json(initiatives);
  } catch (error) {
    console.error("Failed to fetch initiatives:", error);
    return NextResponse.json(
      { error: "Failed to fetch initiatives" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { tags, dependencies, existingClientIds, newClientNames, scheduleStart, scheduleEnd, scheduleHours, deadline, lockedStart, lockedEnd, betaTargetDate, masterTargetDate, assignedEngineerIds, assignedSquadId, ...initiativeData } = body;

    // Parse date strings to Date objects
    // Use first engineer as primary (for backwards compat with assignedEngineerId)
    const primaryEngineerId = assignedEngineerIds?.[0] || initiativeData.assignedEngineerId || null;

    // Auto-calculate master date if beta is set but master isn't (default: 1 week after beta)
    let parsedMasterTargetDate = parseLocalDate(masterTargetDate);
    const parsedBetaTargetDate = parseLocalDate(betaTargetDate);
    if (parsedBetaTargetDate && !parsedMasterTargetDate) {
      parsedMasterTargetDate = new Date(parsedBetaTargetDate);
      parsedMasterTargetDate.setDate(parsedMasterTargetDate.getDate() + 7);
    }

    const parsedData = {
      ...initiativeData,
      assignedEngineerId: primaryEngineerId,
      assignedSquadId: assignedSquadId || null,
      deadline: parseLocalDate(deadline),
      lockedStart: parseLocalDate(lockedStart),
      lockedEnd: parseLocalDate(lockedEnd),
      betaTargetDate: parsedBetaTargetDate,
      masterTargetDate: parsedMasterTargetDate,
    };

    const initiative = await db.initiative.create({
      data: parsedData,
    });

    // Add engineer assignments (multiple engineers support)
    const engineerIds = assignedEngineerIds || (initiativeData.assignedEngineerId ? [initiativeData.assignedEngineerId] : []);
    if (engineerIds.length > 0) {
      await db.initiativeAssignment.createMany({
        data: engineerIds.map((engineerId: string, index: number) => ({
          initiativeId: initiative.id,
          engineerId,
          isPrimary: index === 0,
        })),
      });
    }

    // Add squad assignment if provided
    if (assignedSquadId) {
      await db.initiativeAssignment.create({
        data: {
          initiativeId: initiative.id,
          squadId: assignedSquadId,
          isPrimary: engineerIds.length === 0, // Primary if no engineers
        },
      });
    }

    // Add tags
    if (tags && tags.length > 0) {
      await db.initiativeTag.createMany({
        data: tags.map((specialtyId: string) => ({
          initiativeId: initiative.id,
          specialtyId,
        })),
      });
    }

    // Add dependencies
    if (dependencies && dependencies.length > 0) {
      await db.initiativeDependency.createMany({
        data: dependencies.map((dependencyId: string) => ({
          dependentId: initiative.id,
          dependencyId,
        })),
      });
    }

    // Handle clients
    const clientIdsToLink: string[] = [...(existingClientIds || [])];

    // Create new clients
    if (newClientNames && newClientNames.length > 0) {
      for (const name of newClientNames) {
        const newClient = await db.client.create({
          data: { name },
        });
        clientIdsToLink.push(newClient.id);
      }
    }

    // Link clients to initiative
    if (clientIdsToLink.length > 0) {
      await db.clientInitiativeAccess.createMany({
        data: clientIdsToLink.map((clientId: string) => ({
          clientId,
          initiativeId: initiative.id,
        })),
      });
    }

    // Create scheduled block if schedule data provided and engineer or squad assigned
    const hasAssignee = initiativeData.assignedEngineerId || assignedSquadId;
    if (scheduleStart && scheduleEnd && hasAssignee) {
      const startDateParsed = parseLocalDate(scheduleStart);
      const endDateParsed = parseLocalDate(scheduleEnd);

      if (startDateParsed && endDateParsed) {
        await db.scheduledBlock.create({
          data: {
            initiativeId: initiative.id,
            engineerId: initiativeData.assignedEngineerId || null,
            squadId: !initiativeData.assignedEngineerId ? assignedSquadId : null,
            startDate: startDateParsed,
            endDate: endDateParsed,
            hoursAllocated: scheduleHours || 0,
          },
        });

        // Auto-update effort estimate based on schedule duration
        const businessDays = getBusinessDaysBetween(startDateParsed, endDateParsed);
        const effortWeeks = Math.round((businessDays / 5) * 10) / 10; // Round to 1 decimal place
        if (effortWeeks > 0) {
          await db.initiative.update({
            where: { id: initiative.id },
            data: { effortEstimate: effortWeeks },
          });
        }
      }
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Initiative",
        entityId: initiative.id,
        userId: session.user.id,
        details: { initiative: initiativeData, tags, dependencies, clients: clientIdsToLink },
      },
    });

    return NextResponse.json(initiative, { status: 201 });
  } catch (error) {
    console.error("Failed to create initiative:", error);
    return NextResponse.json(
      { error: "Failed to create initiative" },
      { status: 500 }
    );
  }
}

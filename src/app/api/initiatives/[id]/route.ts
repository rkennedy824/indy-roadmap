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

// Add business days to a date (skipping weekends)
function addBusinessDays(date: Date, numDays: number): Date {
  const result = new Date(date);
  let remaining = numDays;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      remaining--;
    }
  }
  return result;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const initiative = await db.initiative.findUnique({
      where: { id },
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
        scheduledBlocks: {
          include: { engineer: true, squad: true },
          orderBy: { startDate: "asc" },
        },
        dependencies: {
          include: { dependency: true },
        },
        dependents: {
          include: { dependent: true },
        },
        attachments: true,
        clientAccess: {
          include: { client: true },
        },
      },
    });

    if (!initiative) {
      return NextResponse.json({ error: "Initiative not found" }, { status: 404 });
    }

    return NextResponse.json(initiative);
  } catch (error) {
    console.error("Failed to fetch initiative:", error);
    return NextResponse.json(
      { error: "Failed to fetch initiative" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { tags, dependencies, existingClientIds, newClientNames, scheduleStart, scheduleEnd, scheduleHours, deadline, lockedStart, lockedEnd, betaTargetDate, masterTargetDate, assignedEngineerIds, assignedSquadId, ...initiativeData } = body;

    // Get existing data for audit
    const existing = await db.initiative.findUnique({
      where: { id },
      include: { tags: true, dependencies: true, clientAccess: true, assignedEngineers: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Initiative not found" }, { status: 404 });
    }

    // Parse date strings to Date objects
    // Use first engineer as primary (for backwards compat with assignedEngineerId)
    const primaryEngineerId = assignedEngineerIds?.[0] || initiativeData.assignedEngineerId || null;

    // Auto-calculate master date if beta is set but master isn't (default: 1 week after beta)
    let parsedMasterTargetDate = masterTargetDate !== undefined ? parseLocalDate(masterTargetDate) : undefined;
    const parsedBetaTargetDate = betaTargetDate !== undefined ? parseLocalDate(betaTargetDate) : undefined;
    if (parsedBetaTargetDate && parsedMasterTargetDate === undefined) {
      parsedMasterTargetDate = new Date(parsedBetaTargetDate);
      parsedMasterTargetDate.setDate(parsedMasterTargetDate.getDate() + 7);
    }

    const parsedData = {
      ...initiativeData,
      assignedEngineerId: primaryEngineerId,
      ...(assignedSquadId !== undefined && { assignedSquadId: assignedSquadId || null }),
      deadline: parseLocalDate(deadline),
      lockedStart: parseLocalDate(lockedStart),
      lockedEnd: parseLocalDate(lockedEnd),
      ...(betaTargetDate !== undefined && { betaTargetDate: parsedBetaTargetDate }),
      ...(masterTargetDate !== undefined && { masterTargetDate: parsedMasterTargetDate }),
    };

    // Update initiative
    const initiative = await db.initiative.update({
      where: { id },
      data: parsedData,
    });

    // Update engineer assignments if provided
    if (assignedEngineerIds !== undefined) {
      // Get existing assignments to track which engineers are new
      const existingAssignments = existing.assignedEngineers?.map(a => a.engineerId) || [];
      const newEngineerIds = assignedEngineerIds.filter((id: string) => !existingAssignments.includes(id));

      await db.initiativeAssignment.deleteMany({
        where: { initiativeId: id },
      });

      if (assignedEngineerIds.length > 0) {
        await db.initiativeAssignment.createMany({
          data: assignedEngineerIds.map((engineerId: string, index: number) => ({
            initiativeId: id,
            engineerId,
            isPrimary: index === 0,
          })),
        });

        // If there are existing scheduled blocks and new engineers, create blocks for new engineers
        if (newEngineerIds.length > 0) {
          const existingBlocks = await db.scheduledBlock.findMany({
            where: { initiativeId: id },
          });

          if (existingBlocks.length > 0) {
            // Use the first existing block as a template for timing
            const templateBlock = existingBlocks[0];

            for (const newEngineerId of newEngineerIds) {
              // Check if this engineer already has a block for this initiative
              const hasBlock = existingBlocks.some(b => b.engineerId === newEngineerId);
              if (!hasBlock) {
                await db.scheduledBlock.create({
                  data: {
                    initiativeId: id,
                    engineerId: newEngineerId,
                    startDate: templateBlock.startDate,
                    endDate: templateBlock.endDate,
                    hoursAllocated: templateBlock.hoursAllocated,
                  },
                });
              }
            }
          }
        }
      }
    }

    // If effort estimate changed, update scheduled block end dates
    if (parsedData.effortEstimate !== undefined && parsedData.effortEstimate !== existing.effortEstimate) {
      const scheduledBlocks = await db.scheduledBlock.findMany({
        where: { initiativeId: id },
      });

      for (const block of scheduledBlocks) {
        // Calculate new end date based on effort estimate (weeks -> business days)
        const effortWeeks = parsedData.effortEstimate || 1;
        const businessDays = Math.max(1, Math.round(effortWeeks * 5)) - 1; // -1 because start day counts
        const newEndDate = addBusinessDays(new Date(block.startDate), businessDays);

        await db.scheduledBlock.update({
          where: { id: block.id },
          data: { endDate: newEndDate },
        });
      }
    }

    // Update tags
    if (tags !== undefined) {
      await db.initiativeTag.deleteMany({
        where: { initiativeId: id },
      });

      if (tags.length > 0) {
        await db.initiativeTag.createMany({
          data: tags.map((specialtyId: string) => ({
            initiativeId: id,
            specialtyId,
          })),
        });
      }
    }

    // Update dependencies
    if (dependencies !== undefined) {
      await db.initiativeDependency.deleteMany({
        where: { dependentId: id },
      });

      if (dependencies.length > 0) {
        await db.initiativeDependency.createMany({
          data: dependencies.map((dependencyId: string) => ({
            dependentId: id,
            dependencyId,
          })),
        });
      }
    }

    // Update client access
    if (existingClientIds !== undefined || newClientNames !== undefined) {
      // Remove existing client access
      await db.clientInitiativeAccess.deleteMany({
        where: { initiativeId: id },
      });

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
            initiativeId: id,
          })),
        });
      }
    }

    // Update scheduled block
    if (scheduleStart !== undefined || scheduleEnd !== undefined || scheduleHours !== undefined) {
      // Delete existing scheduled blocks for this initiative
      await db.scheduledBlock.deleteMany({
        where: { initiativeId: id },
      });

      // Create new scheduled block if we have the required data
      const engineerId = initiativeData.assignedEngineerId || existing.assignedEngineerId;
      if (scheduleStart && scheduleEnd && engineerId) {
        const startDateParsed = parseLocalDate(scheduleStart);
        const endDateParsed = parseLocalDate(scheduleEnd);

        if (startDateParsed && endDateParsed) {
          await db.scheduledBlock.create({
            data: {
              initiativeId: id,
              engineerId: engineerId,
              startDate: startDateParsed,
              endDate: endDateParsed,
              hoursAllocated: scheduleHours || 0,
            },
          });
        }
      }
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Initiative",
        entityId: id,
        userId: session.user.id,
        details: {
          before: existing,
          after: { ...initiativeData, tags, dependencies, existingClientIds, newClientNames },
        },
      },
    });

    return NextResponse.json(initiative);
  } catch (error) {
    console.error("Failed to update initiative:", error);
    return NextResponse.json(
      { error: "Failed to update initiative" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.initiative.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Initiative not found" }, { status: 404 });
    }

    await db.initiative.delete({
      where: { id },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entityType: "Initiative",
        entityId: id,
        userId: session.user.id,
        details: { deleted: existing },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete initiative:", error);
    return NextResponse.json(
      { error: "Failed to delete initiative" },
      { status: 500 }
    );
  }
}

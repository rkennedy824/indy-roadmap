import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

// Parse date string as local date at noon to avoid timezone issues
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Add business days to a date (skipping weekends)
function addBusinessDays(date: Date, numDays: number): Date {
  const result = new Date(date);
  let remaining = Math.abs(numDays);
  const direction = numDays >= 0 ? 1 : -1;

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    // Skip weekends
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

// Check if two date ranges overlap
function rangesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 <= end2 && start2 <= end1;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { blockId, newStartDate, newEndDate, newEngineerId } = await request.json();

    if (!blockId || !newStartDate || !newEndDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get the block being moved
    const block = await db.scheduledBlock.findUnique({
      where: { id: blockId },
      include: { initiative: true },
    });

    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    // Check if the initiative is locked
    if (block.initiative.lockDates) {
      return NextResponse.json(
        { error: "This initiative has locked dates and cannot be moved" },
        { status: 400 }
      );
    }

    // Check if assignment is locked when trying to change engineer
    if (newEngineerId && newEngineerId !== block.engineerId && block.initiative.lockAssignment) {
      return NextResponse.json(
        { error: "This initiative has a locked assignment and cannot be reassigned" },
        { status: 400 }
      );
    }

    const newStart = parseLocalDate(newStartDate);
    const newEnd = parseLocalDate(newEndDate);

    // Determine the target engineer (either new or original)
    const targetEngineerId = newEngineerId || block.engineerId;
    const engineerChanged = targetEngineerId !== block.engineerId;

    // Get all other blocks for the TARGET engineer that might conflict
    const engineerBlocks = await db.scheduledBlock.findMany({
      where: {
        engineerId: targetEngineerId,
        id: { not: blockId },
      },
      include: { initiative: true },
      orderBy: { startDate: "asc" },
    });

    // Find blocks that would overlap with the new position
    const conflictingBlocks = engineerBlocks.filter((b) =>
      rangesOverlap(newStart, newEnd, new Date(b.startDate), new Date(b.endDate))
    );

    // Calculate how much to bump conflicting blocks
    // We'll push them forward by the overlap amount
    const updates: { id: string; startDate: Date; endDate: Date }[] = [];

    // Add the main block update
    updates.push({
      id: blockId,
      startDate: newStart,
      endDate: newEnd,
    });

    // For each conflicting block, calculate new dates
    // We'll cascade the bumps - if block A pushes block B, and block B now overlaps with block C, etc.
    let blocksToCheck = [...conflictingBlocks];
    const processedIds = new Set<string>([blockId]);

    // Current state of all blocks (including pending updates)
    const blockStates = new Map<string, { startDate: Date; endDate: Date; locked: boolean }>();

    // Initialize with current states
    for (const b of engineerBlocks) {
      blockStates.set(b.id, {
        startDate: new Date(b.startDate),
        endDate: new Date(b.endDate),
        locked: b.initiative.lockDates,
      });
    }

    // Add the moved block's new state
    blockStates.set(blockId, {
      startDate: newStart,
      endDate: newEnd,
      locked: false,
    });

    while (blocksToCheck.length > 0) {
      const currentBlock = blocksToCheck.shift()!;

      if (processedIds.has(currentBlock.id)) continue;
      processedIds.add(currentBlock.id);

      // Skip locked blocks - they can't be moved
      if (currentBlock.initiative.lockDates) {
        continue;
      }

      const currentState = blockStates.get(currentBlock.id)!;

      // Find all blocks that might push this one
      let maxPushEnd: Date | null = null;

      for (const [otherId, otherState] of blockStates.entries()) {
        if (otherId === currentBlock.id) continue;
        if (!processedIds.has(otherId) && otherId !== blockId) continue; // Only consider already processed blocks

        // Check if this block overlaps with currentBlock
        if (rangesOverlap(otherState.startDate, otherState.endDate, currentState.startDate, currentState.endDate)) {
          // This block needs to be pushed
          if (!maxPushEnd || otherState.endDate > maxPushEnd) {
            maxPushEnd = otherState.endDate;
          }
        }
      }

      if (maxPushEnd) {
        // Calculate block duration in business days
        const duration = businessDaysBetween(currentState.startDate, currentState.endDate);

        // New start is the day after maxPushEnd (next business day)
        const newBlockStart = addBusinessDays(maxPushEnd, 1);
        const newBlockEnd = addBusinessDays(newBlockStart, duration - 1);

        // Update the state
        blockStates.set(currentBlock.id, {
          startDate: newBlockStart,
          endDate: newBlockEnd,
          locked: false,
        });

        updates.push({
          id: currentBlock.id,
          startDate: newBlockStart,
          endDate: newBlockEnd,
        });

        // Now check if this new position conflicts with any other blocks
        for (const b of engineerBlocks) {
          if (!processedIds.has(b.id)) {
            const bState = blockStates.get(b.id)!;
            if (rangesOverlap(newBlockStart, newBlockEnd, bState.startDate, bState.endDate)) {
              blocksToCheck.push(b);
            }
          }
        }
      }
    }

    // Apply all updates in a transaction
    await db.$transaction(async (tx) => {
      // Update all scheduled blocks
      for (const u of updates) {
        await tx.scheduledBlock.update({
          where: { id: u.id },
          data: {
            startDate: u.startDate,
            endDate: u.endDate,
            // Only update engineerId for the main block being moved
            ...(u.id === blockId && engineerChanged ? { engineerId: targetEngineerId } : {}),
          },
        });
      }

      // If engineer changed, also update the initiative's assigned engineer
      if (engineerChanged) {
        await tx.initiative.update({
          where: { id: block.initiativeId },
          data: { assignedEngineerId: targetEngineerId },
        });
      }
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        action: engineerChanged ? "MOVE_AND_REASSIGN" : "MOVE",
        entityType: "ScheduledBlock",
        entityId: blockId,
        userId: session.user.id,
        details: {
          movedBlock: blockId,
          newStartDate,
          newEndDate,
          ...(engineerChanged ? {
            previousEngineerId: block.engineerId,
            newEngineerId: targetEngineerId,
          } : {}),
          bumpedBlocks: updates.filter((u) => u.id !== blockId).map((u) => ({
            id: u.id,
            newStart: formatDate(u.startDate),
            newEnd: formatDate(u.endDate),
          })),
        },
      },
    });

    return NextResponse.json({
      success: true,
      movedBlock: blockId,
      engineerChanged,
      bumpedBlocks: updates.filter((u) => u.id !== blockId).length,
    });
  } catch (error) {
    console.error("Failed to move block:", error);
    return NextResponse.json(
      { error: "Failed to move block" },
      { status: 500 }
    );
  }
}

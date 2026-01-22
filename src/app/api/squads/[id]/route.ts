import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const squad = await db.squad.findUnique({
      where: { id },
      include: {
        members: {
          include: { engineer: true },
          orderBy: { isLead: "desc" },
        },
        initiatives: {
          include: {
            tags: { include: { specialty: true } },
          },
        },
        scheduledBlocks: {
          include: {
            initiative: true,
          },
        },
      },
    });

    if (!squad) {
      return NextResponse.json({ error: "Squad not found" }, { status: 404 });
    }

    return NextResponse.json(squad);
  } catch (error) {
    console.error("Failed to fetch squad:", error);
    return NextResponse.json(
      { error: "Failed to fetch squad" },
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
    const { name, description, color, isActive, memberIds, leadId } = body;

    const existing = await db.squad.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Squad not found" }, { status: 404 });
    }

    // Update squad
    const squad = await db.squad.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(color !== undefined && { color }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // Update members if provided
    if (memberIds !== undefined) {
      await db.squadMember.deleteMany({
        where: { squadId: id },
      });

      if (memberIds.length > 0) {
        await db.squadMember.createMany({
          data: memberIds.map((engineerId: string) => ({
            squadId: id,
            engineerId,
            isLead: engineerId === leadId,
          })),
        });
      }
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Squad",
        entityId: id,
        userId: session.user.id,
        details: {
          before: existing,
          after: { name, description, color, isActive, memberIds, leadId },
        },
      },
    });

    return NextResponse.json(squad);
  } catch (error) {
    console.error("Failed to update squad:", error);
    return NextResponse.json(
      { error: "Failed to update squad" },
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

    const existing = await db.squad.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Squad not found" }, { status: 404 });
    }

    await db.squad.delete({
      where: { id },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entityType: "Squad",
        entityId: id,
        userId: session.user.id,
        details: { deleted: existing },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete squad:", error);
    return NextResponse.json(
      { error: "Failed to delete squad" },
      { status: 500 }
    );
  }
}

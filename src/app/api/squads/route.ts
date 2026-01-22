import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const squads = await db.squad.findMany({
      where: { isActive: true },
      include: {
        members: {
          include: { engineer: true },
          orderBy: { isLead: "desc" },
        },
        _count: {
          select: { initiatives: true, scheduledBlocks: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(squads);
  } catch (error) {
    console.error("Failed to fetch squads:", error);
    return NextResponse.json(
      { error: "Failed to fetch squads" },
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
    const { name, description, color, memberIds, leadId } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const squad = await db.squad.create({
      data: {
        name,
        description,
        color,
      },
    });

    // Add members
    if (memberIds && memberIds.length > 0) {
      await db.squadMember.createMany({
        data: memberIds.map((engineerId: string) => ({
          squadId: squad.id,
          engineerId,
          isLead: engineerId === leadId,
        })),
      });
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Squad",
        entityId: squad.id,
        userId: session.user.id,
        details: { squad: { name, description, color }, memberIds, leadId },
      },
    });

    return NextResponse.json(squad, { status: 201 });
  } catch (error) {
    console.error("Failed to create squad:", error);
    return NextResponse.json(
      { error: "Failed to create squad" },
      { status: 500 }
    );
  }
}

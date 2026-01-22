import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const engineer = await db.engineer.findUnique({
      where: { id },
      include: {
        specialties: {
          include: { specialty: true },
        },
        scheduledBlocks: {
          include: { initiative: true },
          where: {
            endDate: { gte: new Date() },
          },
          orderBy: { startDate: "asc" },
        },
        unavailability: {
          where: {
            endDate: { gte: new Date() },
          },
          orderBy: { startDate: "asc" },
        },
      },
    });

    if (!engineer) {
      return NextResponse.json({ error: "Engineer not found" }, { status: 404 });
    }

    return NextResponse.json(engineer);
  } catch (error) {
    console.error("Failed to fetch engineer:", error);
    return NextResponse.json(
      { error: "Failed to fetch engineer" },
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
    const { specialties, ...engineerData } = body;

    // Get existing data for audit
    const existing = await db.engineer.findUnique({
      where: { id },
      include: { specialties: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Engineer not found" }, { status: 404 });
    }

    // Update engineer
    const engineer = await db.engineer.update({
      where: { id },
      data: engineerData,
    });

    // Update specialties
    if (specialties) {
      await db.engineerSpecialty.deleteMany({
        where: { engineerId: id },
      });

      if (specialties.length > 0) {
        await db.engineerSpecialty.createMany({
          data: specialties.map((s: { specialtyId: string; level: string }) => ({
            engineerId: id,
            specialtyId: s.specialtyId,
            level: s.level,
          })),
        });
      }
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Engineer",
        entityId: id,
        userId: session.user.id,
        details: {
          before: existing,
          after: { ...engineerData, specialties },
        },
      },
    });

    return NextResponse.json(engineer);
  } catch (error) {
    console.error("Failed to update engineer:", error);
    return NextResponse.json(
      { error: "Failed to update engineer" },
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

    const existing = await db.engineer.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Engineer not found" }, { status: 404 });
    }

    await db.engineer.delete({
      where: { id },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entityType: "Engineer",
        entityId: id,
        userId: session.user.id,
        details: { deleted: existing },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete engineer:", error);
    return NextResponse.json(
      { error: "Failed to delete engineer" },
      { status: 500 }
    );
  }
}

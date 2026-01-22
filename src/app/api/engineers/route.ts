import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const engineers = await db.engineer.findMany({
      include: {
        specialties: {
          include: { specialty: true },
        },
        scheduledBlocks: {
          where: {
            endDate: { gte: new Date() },
          },
        },
        unavailability: {
          where: {
            endDate: { gte: new Date() },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(engineers);
  } catch (error) {
    console.error("Failed to fetch engineers:", error);
    return NextResponse.json(
      { error: "Failed to fetch engineers" },
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
    const { specialties, ...engineerData } = body;

    const engineer = await db.engineer.create({
      data: engineerData,
    });

    // Add specialties
    if (specialties && specialties.length > 0) {
      await db.engineerSpecialty.createMany({
        data: specialties.map((s: { specialtyId: string; level: string }) => ({
          engineerId: engineer.id,
          specialtyId: s.specialtyId,
          level: s.level,
        })),
      });
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Engineer",
        entityId: engineer.id,
        userId: session.user.id,
        details: { engineer: engineerData },
      },
    });

    return NextResponse.json(engineer, { status: 201 });
  } catch (error) {
    console.error("Failed to create engineer:", error);
    return NextResponse.json(
      { error: "Failed to create engineer" },
      { status: 500 }
    );
  }
}

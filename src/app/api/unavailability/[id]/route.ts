import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { UnavailabilityType } from "@prisma/client";

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
    const { type, startDate, endDate, reason } = body;

    const existing = await db.unavailabilityBlock.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Unavailability block not found" },
        { status: 404 }
      );
    }

    // Validate type if provided
    if (type) {
      const validTypes: UnavailabilityType[] = ["PTO", "TRAVEL", "SICK", "HOLIDAY", "OTHER"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: "Invalid unavailability type" },
          { status: 400 }
        );
      }
    }

    const updated = await db.unavailabilityBlock.update({
      where: { id },
      data: {
        ...(type && { type }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(reason !== undefined && { reason: reason || null }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update unavailability block:", error);
    return NextResponse.json(
      { error: "Failed to update unavailability block" },
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

    const existing = await db.unavailabilityBlock.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Unavailability block not found" },
        { status: 404 }
      );
    }

    await db.unavailabilityBlock.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete unavailability block:", error);
    return NextResponse.json(
      { error: "Failed to delete unavailability block" },
      { status: 500 }
    );
  }
}

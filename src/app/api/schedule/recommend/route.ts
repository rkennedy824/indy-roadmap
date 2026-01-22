import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recommendEngineers } from "@/lib/scheduler";

// Get assignment recommendations for an initiative
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const initiativeId = searchParams.get("initiativeId");

    if (!initiativeId) {
      return NextResponse.json(
        { error: "initiativeId is required" },
        { status: 400 }
      );
    }

    const [initiative, engineers] = await Promise.all([
      db.initiative.findUnique({
        where: { id: initiativeId },
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
    ]);

    if (!initiative) {
      return NextResponse.json(
        { error: "Initiative not found" },
        { status: 404 }
      );
    }

    const recommendations = recommendEngineers(initiative, engineers);

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Failed to get recommendations:", error);
    return NextResponse.json(
      { error: "Failed to get recommendations" },
      { status: 500 }
    );
  }
}

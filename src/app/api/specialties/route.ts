import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const specialties = await db.specialty.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json(specialties);
  } catch (error) {
    console.error("Failed to fetch specialties:", error);
    return NextResponse.json(
      { error: "Failed to fetch specialties" },
      { status: 500 }
    );
  }
}

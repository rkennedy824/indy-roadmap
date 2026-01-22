import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

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

    const existing = await db.scheduledBlock.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Scheduled block not found" },
        { status: 404 }
      );
    }

    await db.scheduledBlock.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete scheduled block:", error);
    return NextResponse.json(
      { error: "Failed to delete scheduled block" },
      { status: 500 }
    );
  }
}

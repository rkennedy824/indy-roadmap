import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateExecutiveBrief } from "@/lib/anthropic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI service not configured. Please add ANTHROPIC_API_KEY to environment." },
        { status: 503 }
      );
    }

    const { token } = await params;

    const shareLink = await db.shareLink.findUnique({
      where: { token },
    });

    if (!shareLink) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    if (shareLink.viewType !== "EXECUTIVE") {
      return NextResponse.json(
        { error: "Brief generation is only available for executive links" },
        { status: 400 }
      );
    }

    // Fetch all active initiatives for brief generation
    const initiatives = await db.initiative.findMany({
      where: {
        status: { notIn: ["DRAFT"] },
      },
      select: {
        title: true,
        description: true,
        status: true,
        priority: true,
        executiveOverview: true,
        betaTargetDate: true,
        masterTargetDate: true,
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }],
    });

    // Generate brief using anthropic
    const brief = await generateExecutiveBrief(initiatives);

    // Update the share link with the generated brief
    await db.shareLink.update({
      where: { id: shareLink.id },
      data: {
        executiveBrief: brief,
        briefGeneratedAt: new Date(),
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "GENERATE_BRIEF",
        entityType: "ShareLink",
        entityId: shareLink.id,
        userId: session.user.id,
        details: { initiativeCount: initiatives.length },
      },
    });

    return NextResponse.json({
      success: true,
      brief,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to generate executive brief:", error);
    return NextResponse.json(
      { error: "Failed to generate executive brief" },
      { status: 500 }
    );
  }
}

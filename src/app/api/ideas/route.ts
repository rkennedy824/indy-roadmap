import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const submitterId = searchParams.get("submitterId");
    const ownerId = searchParams.get("ownerId");
    const tagId = searchParams.get("tagId");

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }
    if (submitterId) {
      where.submitterId = submitterId;
    }
    if (ownerId) {
      where.ownerId = ownerId;
    }
    if (tagId) {
      where.tags = { some: { specialtyId: tagId } };
    }

    const ideas = await db.idea.findMany({
      where,
      include: {
        submitter: {
          select: { id: true, name: true, email: true },
        },
        owner: {
          select: { id: true, name: true, email: true },
        },
        tags: {
          include: { specialty: true },
        },
        promotedTo: {
          select: { id: true, title: true, status: true },
        },
        impactedClients: {
          include: { client: true },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: [{ iceScore: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(ideas);
  } catch (error) {
    console.error("Failed to fetch ideas:", error);
    return NextResponse.json(
      { error: "Failed to fetch ideas" },
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
    const { tags, impactedClientIds, ...ideaData } = body;

    // Calculate ICE score if all components are provided
    let iceScore: number | null = null;
    if (ideaData.impactScore && ideaData.confidenceScore && ideaData.easeScore) {
      iceScore = (ideaData.impactScore * ideaData.confidenceScore * ideaData.easeScore) / 10;
    }

    const idea = await db.idea.create({
      data: {
        ...ideaData,
        submitterId: session.user.id,
        iceScore,
      },
    });

    // Add tags
    if (tags && tags.length > 0) {
      await db.ideaTag.createMany({
        data: tags.map((specialtyId: string) => ({
          ideaId: idea.id,
          specialtyId,
        })),
      });
    }

    // Add impacted clients (only when clientImpactType is SPECIFIC)
    if (impactedClientIds && impactedClientIds.length > 0 && ideaData.clientImpactType === "SPECIFIC") {
      await db.ideaClientImpact.createMany({
        data: impactedClientIds.map((clientId: string) => ({
          ideaId: idea.id,
          clientId,
        })),
      });
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Idea",
        entityId: idea.id,
        userId: session.user.id,
        details: { idea: ideaData, tags },
      },
    });

    return NextResponse.json(idea, { status: 201 });
  } catch (error) {
    console.error("Failed to create idea:", error);
    return NextResponse.json(
      { error: "Failed to create idea" },
      { status: 500 }
    );
  }
}

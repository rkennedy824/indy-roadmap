import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const idea = await db.idea.findUnique({
      where: { id },
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
        comments: {
          include: {
            author: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        attachments: true,
        promotedTo: {
          select: { id: true, title: true, status: true },
        },
        impactedClients: {
          include: { client: true },
        },
      },
    });

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    return NextResponse.json(idea);
  } catch (error) {
    console.error("Failed to fetch idea:", error);
    return NextResponse.json(
      { error: "Failed to fetch idea" },
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
    const { tags, impactedClientIds, ...ideaData } = body;

    // Get existing data for audit
    const existing = await db.idea.findUnique({
      where: { id },
      include: { tags: true, impactedClients: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    // Calculate ICE score if all components are provided
    const impactScore = ideaData.impactScore ?? existing.impactScore;
    const confidenceScore = ideaData.confidenceScore ?? existing.confidenceScore;
    const easeScore = ideaData.easeScore ?? existing.easeScore;

    let iceScore: number | null = existing.iceScore;
    if (impactScore && confidenceScore && easeScore) {
      iceScore = (impactScore * confidenceScore * easeScore) / 10;
    }

    // Update idea
    const idea = await db.idea.update({
      where: { id },
      data: {
        ...ideaData,
        iceScore,
      },
    });

    // Update tags if provided
    if (tags !== undefined) {
      await db.ideaTag.deleteMany({
        where: { ideaId: id },
      });

      if (tags.length > 0) {
        await db.ideaTag.createMany({
          data: tags.map((specialtyId: string) => ({
            ideaId: id,
            specialtyId,
          })),
        });
      }
    }

    // Update impacted clients if provided
    if (impactedClientIds !== undefined) {
      await db.ideaClientImpact.deleteMany({
        where: { ideaId: id },
      });

      // Only create if clientImpactType is SPECIFIC and we have client IDs
      const clientImpactType = ideaData.clientImpactType ?? existing.clientImpactType;
      if (clientImpactType === "SPECIFIC" && impactedClientIds.length > 0) {
        await db.ideaClientImpact.createMany({
          data: impactedClientIds.map((clientId: string) => ({
            ideaId: id,
            clientId,
          })),
        });
      }
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Idea",
        entityId: id,
        userId: session.user.id,
        details: {
          before: existing,
          after: { ...ideaData, tags },
        },
      },
    });

    return NextResponse.json(idea);
  } catch (error) {
    console.error("Failed to update idea:", error);
    return NextResponse.json(
      { error: "Failed to update idea" },
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

    const existing = await db.idea.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    await db.idea.delete({
      where: { id },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entityType: "Idea",
        entityId: id,
        userId: session.user.id,
        details: { deleted: existing },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete idea:", error);
    return NextResponse.json(
      { error: "Failed to delete idea" },
      { status: 500 }
    );
  }
}

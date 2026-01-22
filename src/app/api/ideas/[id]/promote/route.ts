import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

// Parse date string as local date at noon to avoid timezone issues
function parseLocalDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export async function POST(
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
    const {
      title,
      description,
      effortEstimate,
      betaTargetDate,
      masterTargetDate,
      visibilityLevel,
      assignedEngineerId,
      assignedSquadId,
      tags,
    } = body;

    // Get the idea
    const idea = await db.idea.findUnique({
      where: { id },
      include: { tags: true },
    });

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    // Check if already promoted
    if (idea.promotedToId) {
      return NextResponse.json(
        { error: "Idea has already been promoted to an initiative" },
        { status: 400 }
      );
    }

    // Only allow promoting ideas with ACCEPTED status
    if (idea.status !== "ACCEPTED") {
      return NextResponse.json(
        { error: "Only accepted ideas can be promoted to initiatives" },
        { status: 400 }
      );
    }

    // Build initiative description from idea data
    const generatedDescription = [
      idea.problemStatement,
      idea.desiredOutcome ? `\n\n**Desired Outcome:** ${idea.desiredOutcome}` : "",
      idea.whoIsImpacted ? `\n\n**Who is Impacted:** ${idea.whoIsImpacted}` : "",
      idea.whereItHappens ? `\n\n**Where it Happens:** ${idea.whereItHappens}` : "",
    ].join("");

    // Auto-calculate master date if beta is set but master isn't
    let parsedMasterTargetDate = parseLocalDate(masterTargetDate);
    const parsedBetaTargetDate = parseLocalDate(betaTargetDate);
    if (parsedBetaTargetDate && !parsedMasterTargetDate) {
      parsedMasterTargetDate = new Date(parsedBetaTargetDate);
      parsedMasterTargetDate.setDate(parsedMasterTargetDate.getDate() + 7);
    }

    // Create the initiative
    const initiative = await db.initiative.create({
      data: {
        title: title || idea.title,
        description: description || generatedDescription,
        docInputProblem: idea.problemStatement,
        docInputGoals: idea.desiredOutcome,
        docInputTargetUsers: idea.whoIsImpacted,
        status: "PROPOSED",
        effortEstimate: effortEstimate || 1,
        betaTargetDate: parsedBetaTargetDate,
        masterTargetDate: parsedMasterTargetDate,
        visibilityLevel: visibilityLevel || "INTERNAL",
        assignedEngineerId: assignedEngineerId || null,
        assignedSquadId: assignedSquadId || null,
      },
    });

    // Copy tags from idea to initiative, or use provided tags
    const tagIds = tags || idea.tags.map(t => t.specialtyId);
    if (tagIds.length > 0) {
      await db.initiativeTag.createMany({
        data: tagIds.map((specialtyId: string) => ({
          initiativeId: initiative.id,
          specialtyId,
        })),
      });
    }

    // Update the idea with promoted status and link
    await db.idea.update({
      where: { id },
      data: {
        status: "PROMOTED",
        promotedToId: initiative.id,
      },
    });

    // Create audit log for the promotion
    await db.auditLog.create({
      data: {
        action: "PROMOTE",
        entityType: "Idea",
        entityId: id,
        userId: session.user.id,
        details: {
          ideaId: id,
          initiativeId: initiative.id,
          ideaTitle: idea.title,
          initiativeTitle: initiative.title,
        },
      },
    });

    // Create audit log for the initiative creation
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Initiative",
        entityId: initiative.id,
        userId: session.user.id,
        details: {
          fromIdea: id,
          initiative: {
            title: initiative.title,
            description: initiative.description,
          },
        },
      },
    });

    return NextResponse.json({
      idea: { id, status: "PROMOTED", promotedToId: initiative.id },
      initiative,
    });
  } catch (error) {
    console.error("Failed to promote idea:", error);
    return NextResponse.json(
      { error: "Failed to promote idea to initiative" },
      { status: 500 }
    );
  }
}

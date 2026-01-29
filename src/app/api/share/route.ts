import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { addDays } from "date-fns";

export async function GET() {
  try {
    const shareLinks = await db.shareLink.findMany({
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(shareLinks);
  } catch (error) {
    console.error("Failed to fetch share links:", error);
    return NextResponse.json(
      { error: "Failed to fetch share links" },
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
    const { clientId, expiresInDays, viewType = "CLIENT", startDate, endDate, customSlug } = body;

    // Validate: executive links shouldn't have clientId
    if (viewType === "EXECUTIVE" && clientId) {
      return NextResponse.json(
        { error: "Executive links cannot be client-specific" },
        { status: 400 }
      );
    }

    // Validate custom slug format (alphanumeric, hyphens, underscores only)
    if (customSlug) {
      if (!/^[a-zA-Z0-9_-]+$/.test(customSlug)) {
        return NextResponse.json(
          { error: "Custom slug can only contain letters, numbers, hyphens, and underscores" },
          { status: 400 }
        );
      }
      // Check if slug is already taken
      const existing = await db.shareLink.findUnique({ where: { customSlug } });
      if (existing) {
        return NextResponse.json(
          { error: "This custom slug is already in use" },
          { status: 400 }
        );
      }
    }

    const shareLink = await db.shareLink.create({
      data: {
        viewType,
        clientId: viewType === "CLIENT" ? (clientId || null) : null,
        expiresAt: expiresInDays ? addDays(new Date(), expiresInDays) : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        customSlug: customSlug || null,
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "ShareLink",
        entityId: shareLink.id,
        userId: session.user.id,
        details: { viewType, clientId, expiresInDays, startDate, endDate },
      },
    });

    return NextResponse.json(shareLink, { status: 201 });
  } catch (error) {
    console.error("Failed to create share link:", error);
    return NextResponse.json(
      { error: "Failed to create share link", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await db.shareLink.delete({
      where: { id },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entityType: "ShareLink",
        entityId: id,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete share link:", error);
    return NextResponse.json(
      { error: "Failed to delete share link" },
      { status: 500 }
    );
  }
}

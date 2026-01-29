import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ClientRoadmapView } from "@/components/roadmap/client-roadmap-view";
import { ExecutiveRoadmapView } from "@/components/roadmap/executive-roadmap-view";

export default async function SharedViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Verify share link - lookup by token or customSlug
  const shareLink = await db.shareLink.findFirst({
    where: {
      OR: [
        { token },
        { customSlug: token },
      ],
    },
    include: { client: true },
  });

  if (!shareLink) {
    notFound();
  }

  // Check expiry
  if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Link Expired</h1>
          <p className="text-muted-foreground">
            This roadmap link has expired. Please request a new one.
          </p>
        </div>
      </div>
    );
  }

  // Branch based on viewType
  if (shareLink.viewType === "EXECUTIVE") {
    // Executive view - all non-draft initiatives
    const initiatives = await db.initiative.findMany({
      where: {
        status: { notIn: ["DRAFT"] },
      },
      include: {
        tags: {
          include: { specialty: true },
        },
        scheduledBlocks: {
          orderBy: { startDate: "asc" },
        },
        clientAccess: {
          include: { client: true },
        },
        assignedEngineer: true,
        assignedSquad: true,
        assignedEngineers: {
          include: { engineer: true, squad: true },
        },
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }],
    });

    const specialties = await db.specialty.findMany({
      orderBy: { name: "asc" },
    });

    // Fetch unavailability blocks for the timeline
    const unavailability = await db.unavailabilityBlock.findMany({
      include: { engineer: true },
      orderBy: { startDate: "asc" },
    });

    return (
      <ExecutiveRoadmapView
        initiatives={initiatives}
        specialties={specialties}
        executiveBrief={shareLink.executiveBrief}
        briefGeneratedAt={shareLink.briefGeneratedAt}
        unavailability={unavailability}
        initialStartDate={shareLink.startDate}
        initialEndDate={shareLink.endDate}
      />
    );
  }

  // Client view - client-visible initiatives only
  const initiatives = await db.initiative.findMany({
    where: {
      visibilityLevel: "CLIENT_VISIBLE",
      status: { notIn: ["DRAFT"] },
      ...(shareLink.clientId
        ? {
            clientAccess: {
              some: { clientId: shareLink.clientId },
            },
          }
        : {}),
    },
    include: {
      tags: {
        include: { specialty: true },
      },
      scheduledBlocks: {
        orderBy: { startDate: "asc" },
      },
    },
    orderBy: [{ priority: "desc" }, { deadline: "asc" }],
  });

  const specialties = await db.specialty.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <ClientRoadmapView
      initiatives={initiatives}
      specialties={specialties}
      clientName={shareLink.client?.name}
      initialStartDate={shareLink.startDate}
      initialEndDate={shareLink.endDate}
    />
  );
}

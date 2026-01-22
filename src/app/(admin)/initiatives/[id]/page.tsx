import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { InitiativeDetailView } from "@/components/initiatives/initiative-detail-view";

export default async function InitiativeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch initiative with all relations and reference data in parallel
  const [initiative, specialties, engineers, allInitiatives, clients, squads] = await Promise.all([
    db.initiative.findUnique({
      where: { id },
      include: {
        tags: {
          include: { specialty: true },
        },
        assignedEngineer: true,
        scheduledBlocks: {
          include: { engineer: true, squad: true },
          orderBy: { startDate: "asc" },
        },
        dependencies: {
          include: { dependency: true },
        },
        dependents: {
          include: { dependent: true },
        },
        attachments: true,
        clientAccess: {
          include: { client: true },
        },
        assignedEngineers: {
          include: { engineer: true },
          orderBy: { isPrimary: "desc" },
        },
        sourceIdea: {
          select: {
            id: true,
            title: true,
            problemStatement: true,
            status: true,
            submitter: {
              select: { name: true, email: true },
            },
          },
        },
      },
    }),
    db.specialty.findMany({ orderBy: { name: "asc" } }),
    db.engineer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    db.initiative.findMany({
      where: {
        status: { notIn: ["DONE"] },
      },
      orderBy: { title: "asc" },
    }),
    db.client.findMany({ orderBy: { name: "asc" } }),
    db.squad.findMany({
      where: { isActive: true },
      include: {
        members: {
          include: { engineer: true },
          orderBy: { isLead: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!initiative) {
    notFound();
  }

  return (
    <InitiativeDetailView
      initiative={initiative}
      specialties={specialties}
      engineers={engineers}
      squads={squads}
      allInitiatives={allInitiatives}
      clients={clients}
    />
  );
}

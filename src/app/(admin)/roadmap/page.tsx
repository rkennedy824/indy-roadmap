import { db } from "@/lib/db";
import { RoadmapView } from "@/components/roadmap/roadmap-view";

export default async function RoadmapPage() {
  const [engineers, initiatives, scheduledBlocks, specialties, clients, squads] = await Promise.all([
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
      },
      orderBy: { name: "asc" },
    }),
    db.initiative.findMany({
      where: {
        // Include all statuses including DONE
      },
      include: {
        tags: {
          include: { specialty: true },
        },
        assignedEngineer: true,
        assignedSquad: true,
        assignedEngineers: {
          include: { engineer: true, squad: true },
          orderBy: { isPrimary: "desc" },
        },
        clientAccess: {
          include: { client: true },
        },
        scheduledBlocks: {
          select: { id: true },
        },
      },
      orderBy: [{ priority: "desc" }, { deadline: "asc" }],
    }),
    db.scheduledBlock.findMany({
      where: {
        // Include all blocks, let the view filter by visible date range
      },
      include: {
        initiative: {
          include: {
            tags: {
              include: { specialty: true },
            },
          },
        },
        engineer: true,
        squad: true,
      },
      orderBy: { startDate: "asc" },
    }),
    db.specialty.findMany({ orderBy: { name: "asc" } }),
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

  return (
    <div className="h-full flex flex-col">
      <RoadmapView
        engineers={engineers}
        initiatives={initiatives}
        scheduledBlocks={scheduledBlocks}
        specialties={specialties}
        clients={clients}
        squads={squads}
      />
    </div>
  );
}

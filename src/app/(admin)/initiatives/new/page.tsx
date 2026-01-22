import { db } from "@/lib/db";
import { InitiativeForm } from "@/components/initiatives/initiative-form";

export default async function NewInitiativePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; endDate?: string; engineer?: string }>;
}) {
  const params = await searchParams;

  const [specialties, engineers, initiatives, clients, squads] = await Promise.all([
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

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Add New Initiative</h1>
        <p className="text-muted-foreground">
          Create a new roadmap initiative with PRD and scheduling details.
        </p>
      </div>
      <InitiativeForm
        specialties={specialties}
        engineers={engineers}
        squads={squads}
        allInitiatives={initiatives}
        clients={clients}
        defaultScheduleDate={params.date}
        defaultScheduleEndDate={params.endDate}
        defaultEngineerId={params.engineer}
      />
    </div>
  );
}

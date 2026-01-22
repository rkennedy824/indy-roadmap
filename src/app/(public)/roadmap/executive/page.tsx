import { db } from "@/lib/db";
import { ExecutiveRoadmapView } from "@/components/roadmap/executive-roadmap-view";
import { PasswordGate } from "@/components/auth/password-gate";

export const metadata = {
  title: "Executive Roadmap",
};

export default async function PublicExecutiveRoadmapPage() {
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

  const unavailability = await db.unavailabilityBlock.findMany({
    include: { engineer: true },
    orderBy: { startDate: "asc" },
  });

  return (
    <PasswordGate
      storageKey="executive-access"
      title="Executive Roadmap"
      description="Enter the password to view the executive roadmap."
    >
      <ExecutiveRoadmapView
        initiatives={initiatives}
        specialties={specialties}
        unavailability={unavailability}
      />
    </PasswordGate>
  );
}

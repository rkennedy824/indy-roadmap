import { db } from "@/lib/db";
import { ClientRoadmapView } from "@/components/roadmap/client-roadmap-view";

export default async function PublicClientRoadmapPage() {
  const initiatives = await db.initiative.findMany({
    where: {
      visibilityLevel: "CLIENT_VISIBLE",
      status: { notIn: ["DRAFT"] },
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
    />
  );
}

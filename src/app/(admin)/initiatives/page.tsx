import { db } from "@/lib/db";
import { InitiativeList } from "@/components/initiatives/initiative-list";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function InitiativesPage() {
  const [initiativesUnsorted, specialties, engineers] = await Promise.all([
    db.initiative.findMany({
      include: {
        tags: {
          include: { specialty: true },
        },
        assignedEngineer: true,
        scheduledBlocks: {
          orderBy: { startDate: "asc" },
        },
        dependencies: {
          include: { dependency: true },
        },
      },
    }),
    db.specialty.findMany({ orderBy: { name: "asc" } }),
    db.engineer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Sort initiatives by earliest scheduled block start date
  const initiatives = initiativesUnsorted.sort((a, b) => {
    const aStart = a.scheduledBlocks[0]?.startDate;
    const bStart = b.scheduledBlocks[0]?.startDate;

    // Initiatives without scheduled blocks go to the end
    if (!aStart && !bStart) return 0;
    if (!aStart) return 1;
    if (!bStart) return -1;

    return new Date(aStart).getTime() - new Date(bStart).getTime();
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Initiatives</h1>
          <p className="text-muted-foreground">
            Manage roadmap initiatives, PRDs, and delivery timelines.
          </p>
        </div>
        <Link href="/initiatives/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Initiative
          </Button>
        </Link>
      </div>
      <InitiativeList
        initiatives={initiatives}
        specialties={specialties}
        engineers={engineers}
      />
    </div>
  );
}

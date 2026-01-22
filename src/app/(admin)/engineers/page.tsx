import { db } from "@/lib/db";
import { EngineerList } from "@/components/engineers/engineer-list";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function EngineersPage() {
  const engineers = await db.engineer.findMany({
    include: {
      specialties: {
        include: {
          specialty: true,
        },
      },
      scheduledBlocks: {
        where: {
          endDate: {
            gte: new Date(),
          },
        },
      },
      unavailability: {
        where: {
          endDate: {
            gte: new Date(),
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Engineers</h1>
          <p className="text-muted-foreground">
            Manage your engineering team roster, specialties, and availability.
          </p>
        </div>
        <Link href="/engineers/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Engineer
          </Button>
        </Link>
      </div>
      <EngineerList engineers={engineers} />
    </div>
  );
}

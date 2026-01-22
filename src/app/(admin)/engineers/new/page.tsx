import { db } from "@/lib/db";
import { EngineerForm } from "@/components/engineers/engineer-form";

export default async function NewEngineerPage() {
  const specialties = await db.specialty.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Add New Engineer</h1>
        <p className="text-muted-foreground">
          Add a new engineer to your team roster.
        </p>
      </div>
      <EngineerForm specialties={specialties} />
    </div>
  );
}

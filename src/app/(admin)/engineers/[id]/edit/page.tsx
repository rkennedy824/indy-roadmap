import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EngineerForm } from "@/components/engineers/engineer-form";

export default async function EditEngineerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [engineer, specialties] = await Promise.all([
    db.engineer.findUnique({
      where: { id },
      include: {
        specialties: {
          include: { specialty: true },
        },
      },
    }),
    db.specialty.findMany({
      orderBy: { name: "asc" },
    }),
  ]);

  if (!engineer) {
    notFound();
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Edit Engineer</h1>
        <p className="text-muted-foreground">
          Update {engineer.name}&apos;s information.
        </p>
      </div>
      <EngineerForm engineer={engineer} specialties={specialties} />
    </div>
  );
}

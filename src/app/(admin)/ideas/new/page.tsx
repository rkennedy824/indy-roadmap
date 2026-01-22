import { db } from "@/lib/db";
import { IdeaForm } from "@/components/ideas/idea-form";

export default async function NewIdeaPage() {
  const [specialties, clients] = await Promise.all([
    db.specialty.findMany({
      orderBy: { name: "asc" },
    }),
    db.client.findMany({
      orderBy: { name: "asc" },
    }),
  ]);

  return <IdeaForm specialties={specialties} clients={clients} />;
}

import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { IdeaForm } from "@/components/ideas/idea-form";

interface EditIdeaPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditIdeaPage({ params }: EditIdeaPageProps) {
  const { id } = await params;

  const [idea, specialties, clients] = await Promise.all([
    db.idea.findUnique({
      where: { id },
      include: {
        tags: {
          include: { specialty: true },
        },
        impactedClients: {
          include: { client: true },
        },
      },
    }),
    db.specialty.findMany({
      orderBy: { name: "asc" },
    }),
    db.client.findMany({
      orderBy: { name: "asc" },
    }),
  ]);

  if (!idea) {
    notFound();
  }

  return <IdeaForm idea={idea} specialties={specialties} clients={clients} />;
}

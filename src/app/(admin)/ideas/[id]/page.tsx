import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { IdeaDetail } from "@/components/ideas/idea-detail";

interface IdeaPageProps {
  params: Promise<{ id: string }>;
}

export default async function IdeaPage({ params }: IdeaPageProps) {
  const { id } = await params;

  const [idea, users, specialties, clients] = await Promise.all([
    db.idea.findUnique({
      where: { id },
      include: {
        submitter: {
          select: { id: true, name: true, email: true },
        },
        owner: {
          select: { id: true, name: true, email: true },
        },
        tags: {
          include: { specialty: true },
        },
        comments: {
          include: {
            author: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        attachments: true,
        promotedTo: {
          select: { id: true, title: true, status: true },
        },
        impactedClients: {
          include: { client: true },
        },
      },
    }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
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

  return <IdeaDetail idea={idea} users={users} specialties={specialties} clients={clients} />;
}

import { db } from "@/lib/db";
import { IdeaList } from "@/components/ideas/idea-list";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

export const metadata = {
  title: "Ideas",
};

export default async function IdeasPage() {
  const [ideas, specialties, users, clients] = await Promise.all([
    db.idea.findMany({
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
        promotedTo: {
          select: { id: true, title: true, status: true },
        },
        impactedClients: {
          include: { client: true },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: [{ iceScore: "desc" }, { createdAt: "desc" }],
    }),
    db.specialty.findMany({
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.client.findMany({
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ideas</h1>
          <p className="text-muted-foreground">
            Capture, discuss, and prioritize ideas before they become initiatives
          </p>
        </div>
        <Button asChild>
          <Link href="/ideas/new">
            <Plus className="mr-2 h-4 w-4" />
            Submit Idea
          </Link>
        </Button>
      </div>

      <IdeaList ideas={ideas} specialties={specialties} users={users} clients={clients} />
    </div>
  );
}

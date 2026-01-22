import { db } from "@/lib/db";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const [specialties, shareLinks, clients, squads, engineers] = await Promise.all([
    db.specialty.findMany({ orderBy: { name: "asc" } }),
    db.shareLink.findMany({
      include: { client: true },
      orderBy: { createdAt: "desc" },
    }),
    db.client.findMany({ orderBy: { name: "asc" } }),
    db.squad.findMany({
      include: {
        members: {
          include: { engineer: true },
          orderBy: { isLead: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.engineer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage specialties, squads, share links, and system settings.
        </p>
      </div>
      <SettingsView
        specialties={specialties}
        shareLinks={shareLinks}
        clients={clients}
        squads={squads}
        engineers={engineers}
      />
    </div>
  );
}

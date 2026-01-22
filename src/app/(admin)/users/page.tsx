import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserList } from "@/components/users/user-list";

export const metadata = {
  title: "Users",
};

export default async function UsersPage() {
  const session = await auth();

  if (!session || session.user.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground">
          Manage user accounts and permissions
        </p>
      </div>

      <UserList users={users} />
    </div>
  );
}

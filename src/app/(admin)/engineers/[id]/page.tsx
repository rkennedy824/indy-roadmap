import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Pencil, ArrowLeft, Clock, Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";

export default async function EngineerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const engineer = await db.engineer.findUnique({
    where: { id },
    include: {
      specialties: {
        include: { specialty: true },
      },
      scheduledBlocks: {
        include: { initiative: true },
        where: {
          endDate: { gte: new Date() },
        },
        orderBy: { startDate: "asc" },
      },
      unavailability: {
        where: {
          endDate: { gte: new Date() },
        },
        orderBy: { startDate: "asc" },
      },
    },
  });

  if (!engineer) {
    notFound();
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const primarySpecialties = engineer.specialties.filter((s) => s.level === "PRIMARY");
  const secondarySpecialties = engineer.specialties.filter((s) => s.level === "SECONDARY");

  const workingDaysMap: Record<string, string> = {
    "0": "Sun",
    "1": "Mon",
    "2": "Tue",
    "3": "Wed",
    "4": "Thu",
    "5": "Fri",
    "6": "Sat",
  };

  const workingDaysDisplay = engineer.workingDays
    .split(",")
    .map((d) => workingDaysMap[d])
    .join(", ");

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/engineers"
          className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Engineers
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg">{getInitials(engineer.name)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{engineer.name}</h1>
              <p className="text-muted-foreground">{engineer.role || "Engineer"}</p>
              {engineer.email && (
                <p className="text-sm text-muted-foreground">{engineer.email}</p>
              )}
            </div>
          </div>
          <Link href={`/engineers/${engineer.id}/edit`}>
            <Button>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{engineer.timezone}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{engineer.weeklyCapacity} hours/week</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{workingDaysDisplay}</span>
            </div>
            <div>
              <Badge variant={engineer.isActive ? "default" : "secondary"}>
                {engineer.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Specialties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {primarySpecialties.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Primary</p>
                <div className="flex flex-wrap gap-2">
                  {primarySpecialties.map((s) => (
                    <Badge
                      key={s.id}
                      style={{ backgroundColor: s.specialty.color || undefined }}
                    >
                      {s.specialty.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {secondarySpecialties.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Secondary</p>
                <div className="flex flex-wrap gap-2">
                  {secondarySpecialties.map((s) => (
                    <Badge
                      key={s.id}
                      variant="outline"
                      style={{
                        borderColor: s.specialty.color || undefined,
                        color: s.specialty.color || undefined,
                      }}
                    >
                      {s.specialty.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {engineer.specialties.length === 0 && (
              <p className="text-muted-foreground">No specialties assigned</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming Work</CardTitle>
          </CardHeader>
          <CardContent>
            {engineer.scheduledBlocks.length > 0 ? (
              <div className="space-y-3">
                {engineer.scheduledBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <Link
                        href={`/initiatives/${block.initiativeId}`}
                        className="font-medium hover:underline"
                      >
                        {block.initiative.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(block.startDate), "MMM d")} -{" "}
                        {format(new Date(block.endDate), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{block.hoursAllocated}h</p>
                      {block.isAtRisk && (
                        <Badge variant="destructive">At Risk</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No upcoming scheduled work</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming Unavailability</CardTitle>
          </CardHeader>
          <CardContent>
            {engineer.unavailability.length > 0 ? (
              <div className="space-y-3">
                {engineer.unavailability.map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {format(new Date(block.startDate), "MMM d")} -{" "}
                        {format(new Date(block.endDate), "MMM d, yyyy")}
                      </p>
                      {block.reason && (
                        <p className="text-sm text-muted-foreground">{block.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No upcoming unavailability</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

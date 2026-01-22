"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Initiative,
  InitiativeTag,
  Specialty,
  Engineer,
  ScheduledBlock,
  InitiativeDependency,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  MoreHorizontal,
  Lock,
  AlertTriangle,
  Calendar,
  Rocket,
  User,
} from "lucide-react";
import { format } from "date-fns";

type InitiativeWithRelations = Initiative & {
  tags: (InitiativeTag & { specialty: Specialty })[];
  assignedEngineer: Engineer | null;
  scheduledBlocks: ScheduledBlock[];
  dependencies: (InitiativeDependency & { dependency: Initiative })[];
};

interface InitiativeListProps {
  initiatives: InitiativeWithRelations[];
  specialties: Specialty[];
  engineers: Engineer[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  PROPOSED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  DONE: "bg-emerald-100 text-emerald-800",
  BLOCKED: "bg-red-100 text-red-800",
};

export function InitiativeList({
  initiatives,
  specialties,
  engineers,
}: InitiativeListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState<string[]>([]);
  const [engineerFilter, setEngineerFilter] = useState<string[]>([]);

  const filteredInitiatives = initiatives.filter((initiative) => {
    const matchesSearch =
      initiative.title.toLowerCase().includes(search.toLowerCase()) ||
      initiative.description?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter.length === 0 || statusFilter.includes(initiative.status);

    const matchesSpecialty =
      specialtyFilter.length === 0 ||
      initiative.tags.some((t) => specialtyFilter.includes(t.specialtyId));

    const matchesEngineer =
      engineerFilter.length === 0 ||
      (initiative.assignedEngineerId && engineerFilter.includes(initiative.assignedEngineerId));

    return matchesSearch && matchesStatus && matchesSpecialty && matchesEngineer;
  });

  const isAtRisk = (initiative: InitiativeWithRelations) => {
    return initiative.scheduledBlocks.some((block) => block.isAtRisk);
  };

  const isLocked = (initiative: Initiative) => {
    return initiative.lockAssignment || initiative.lockDates;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search initiatives..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MultiSelectFilter
          options={[
            { value: "DRAFT", label: "Draft" },
            { value: "PROPOSED", label: "Proposed" },
            { value: "APPROVED", label: "Approved" },
            { value: "IN_PROGRESS", label: "In Progress" },
            { value: "DONE", label: "Done" },
            { value: "BLOCKED", label: "Blocked" },
          ]}
          selected={statusFilter}
          onChange={setStatusFilter}
          placeholder="All Statuses"
          className="w-[150px]"
        />
        <MultiSelectFilter
          options={specialties.map((s) => ({ value: s.id, label: s.name, color: s.color || undefined }))}
          selected={specialtyFilter}
          onChange={setSpecialtyFilter}
          placeholder="All Types"
          className="w-[150px]"
        />
        <MultiSelectFilter
          options={engineers.map((e) => ({ value: e.id, label: e.name }))}
          selected={engineerFilter}
          onChange={setEngineerFilter}
          placeholder="All Engineers"
          className="w-[150px]"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Initiative</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Beta Release</TableHead>
                <TableHead>Production Release</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInitiatives.map((initiative) => (
                <TableRow key={initiative.id}>
                  <TableCell>
                    <Link
                      href={`/initiatives/${initiative.id}`}
                      className="block hover:underline"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{initiative.title}</span>
                        {isLocked(initiative) && (
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        )}
                        {isAtRisk(initiative) && (
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {initiative.tags.map((tag) => (
                          <Badge
                            key={tag.id}
                            variant="outline"
                            className="text-xs"
                            style={{
                              borderColor: tag.specialty.color || undefined,
                              color: tag.specialty.color || undefined,
                            }}
                          >
                            {tag.specialty.name}
                          </Badge>
                        ))}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={STATUS_COLORS[initiative.status]}
                      variant="secondary"
                    >
                      {initiative.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {initiative.assignedEngineer ? (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{initiative.assignedEngineer.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {initiative.betaTargetDate ? (
                      <div className="flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-blue-500" />
                        <span>
                          {format(new Date(initiative.betaTargetDate), "MMM d, yyyy")}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {initiative.masterTargetDate ? (
                      <div className="flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-green-500" />
                        <span>
                          {format(new Date(initiative.masterTargetDate), "MMM d, yyyy")}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/initiatives/${initiative.id}`}>
                            View & Edit
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredInitiatives.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No initiatives found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

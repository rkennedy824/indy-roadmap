"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Idea,
  IdeaTag,
  Specialty,
  Initiative,
  User,
  IdeaStatus,
  Client,
  IdeaClientImpact,
  ClientImpactType,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  MessageSquare,
  ArrowUpRight,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronRight,
  Layers,
  List,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

type IdeaWithRelations = Idea & {
  submitter: { id: string; name: string | null; email: string };
  owner: { id: string; name: string | null; email: string } | null;
  tags: (IdeaTag & { specialty: Specialty })[];
  promotedTo: { id: string; title: string; status: string } | null;
  impactedClients: (IdeaClientImpact & { client: Client })[];
  _count: { comments: number };
};

interface IdeaListProps {
  ideas: IdeaWithRelations[];
  specialties: Specialty[];
  users: { id: string; name: string | null; email: string }[];
  clients: Client[];
}

const CLIENT_IMPACT_LABELS: Record<ClientImpactType, string> = {
  ALL: "All Clients",
  LARGE_CHAINS: "Large Chains",
  SMALL_CHAINS: "Small Chains",
  SPECIFIC: "Specific Clients",
};

const STATUS_COLORS: Record<IdeaStatus, string> = {
  NEW: "bg-blue-100 text-blue-800",
  NEEDS_CLARIFICATION: "bg-yellow-100 text-yellow-800",
  TRIAGED: "bg-purple-100 text-purple-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  PROMOTED: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-gray-100 text-gray-800",
};

const STATUS_LABELS: Record<IdeaStatus, string> = {
  NEW: "New",
  NEEDS_CLARIFICATION: "Needs Clarification",
  TRIAGED: "Triaged",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  PROMOTED: "Promoted",
  ARCHIVED: "Archived",
};

const PRIORITY_LABELS: Record<number, string> = {
  0: "-",
  1: "P1",
  2: "P2",
  3: "P3",
};

export function IdeaList({ ideas, specialties, users, clients }: IdeaListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState<string[]>([]);
  const [submitterFilter, setSubmitterFilter] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"ice" | "created" | "priority">("ice");
  const [groupBy, setGroupBy] = useState<"none" | "type">("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const filteredIdeas = useMemo(() => {
    let filtered = ideas.filter((idea) => {
      const matchesSearch =
        idea.title.toLowerCase().includes(search.toLowerCase()) ||
        idea.problemStatement.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter.length === 0 || statusFilter.includes(idea.status);

      const matchesSpecialty =
        specialtyFilter.length === 0 ||
        idea.tags.some((t) => specialtyFilter.includes(t.specialtyId));

      const matchesSubmitter =
        submitterFilter.length === 0 ||
        submitterFilter.includes(idea.submitterId);

      const matchesOwner =
        ownerFilter.length === 0 ||
        (idea.ownerId && ownerFilter.includes(idea.ownerId));

      const matchesClient =
        clientFilter.length === 0 ||
        idea.impactedClients.some((ic) => clientFilter.includes(ic.clientId));

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSpecialty &&
        matchesSubmitter &&
        matchesOwner &&
        matchesClient
      );
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "ice":
          return (b.iceScore || 0) - (a.iceScore || 0);
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "priority":
          return (b.priority || 0) - (a.priority || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [ideas, search, statusFilter, specialtyFilter, submitterFilter, ownerFilter, clientFilter, sortBy]);

  // Group ideas by specialty/type
  const groupedIdeas = useMemo(() => {
    if (groupBy === "none") return null;

    const groups = new Map<string, { specialty: Specialty | null; ideas: IdeaWithRelations[] }>();

    // Add "Untagged" group
    groups.set("_untagged", { specialty: null, ideas: [] });

    // Initialize groups for all specialties
    specialties.forEach((s) => {
      groups.set(s.id, { specialty: s, ideas: [] });
    });

    // Assign ideas to groups
    filteredIdeas.forEach((idea) => {
      if (idea.tags.length === 0) {
        groups.get("_untagged")!.ideas.push(idea);
      } else {
        // Add to each tag's group (idea can appear in multiple groups)
        idea.tags.forEach((tag) => {
          if (groups.has(tag.specialtyId)) {
            groups.get(tag.specialtyId)!.ideas.push(idea);
          }
        });
      }
    });

    // Convert to array, filter empty groups, and sort by name
    return Array.from(groups.values())
      .filter((g) => g.ideas.length > 0)
      .sort((a, b) => {
        if (!a.specialty) return 1;
        if (!b.specialty) return -1;
        return a.specialty.name.localeCompare(b.specialty.name);
      });
  }, [filteredIdeas, specialties, groupBy]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ideas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MultiSelectFilter
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
          selected={statusFilter}
          onChange={setStatusFilter}
          placeholder="All Statuses"
          className="w-[150px]"
        />
        <MultiSelectFilter
          options={specialties.map((s) => ({
            value: s.id,
            label: s.name,
            color: s.color || undefined,
          }))}
          selected={specialtyFilter}
          onChange={setSpecialtyFilter}
          placeholder="All Types"
          className="w-[150px]"
        />
        <MultiSelectFilter
          options={users.map((u) => ({
            value: u.id,
            label: u.name || u.email,
          }))}
          selected={submitterFilter}
          onChange={setSubmitterFilter}
          placeholder="All Submitters"
          className="w-[150px]"
        />
        <MultiSelectFilter
          options={users.map((u) => ({
            value: u.id,
            label: u.name || u.email,
          }))}
          selected={ownerFilter}
          onChange={setOwnerFilter}
          placeholder="All Owners"
          className="w-[150px]"
        />
        <MultiSelectFilter
          options={clients.map((c) => ({
            value: c.id,
            label: c.name,
          }))}
          selected={clientFilter}
          onChange={setClientFilter}
          placeholder="All Clients"
          className="w-[150px]"
          searchable
        />
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
          <SelectTrigger className="w-[140px]">
            <div className="flex items-center gap-2">
              {groupBy === "none" ? <List className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Grouping</SelectItem>
            <SelectItem value="type">Group by Team</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Render idea row - shared between grouped and ungrouped views */}
      {(() => {
        const renderIdeaRow = (idea: IdeaWithRelations, showTags = true) => (
          <TableRow key={idea.id}>
            <TableCell>
              <Link
                href={`/ideas/${idea.id}`}
                className="block hover:underline"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium line-clamp-2" title={idea.title}>{idea.title}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {idea._count.comments > 0 && (
                      <span className="flex items-center text-muted-foreground text-xs">
                        <MessageSquare className="h-3 w-3 mr-0.5" />
                        {idea._count.comments}
                      </span>
                    )}
                    {idea.promotedTo && (
                      <ArrowUpRight className="h-3 w-3 text-emerald-600" />
                    )}
                  </div>
                </div>
                {showTags && idea.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {idea.tags.map((tag) => (
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
                )}
              </Link>
            </TableCell>
            <TableCell>
              <Badge
                className={STATUS_COLORS[idea.status]}
                variant="secondary"
              >
                {STATUS_LABELS[idea.status]}
              </Badge>
            </TableCell>
            <TableCell>
              {idea.clientImpactType ? (
                <div className="flex items-center gap-1 text-sm">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  {idea.clientImpactType === "SPECIFIC" ? (
                    <span className="truncate max-w-[100px]" title={idea.impactedClients.map(ic => ic.client.name).join(", ")}>
                      {idea.impactedClients.length > 0
                        ? idea.impactedClients.map(ic => ic.client.name).join(", ")
                        : "Specific"}
                    </span>
                  ) : (
                    <span>{CLIENT_IMPACT_LABELS[idea.clientImpactType]}</span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              {idea.iceScore ? (
                <div className="flex items-center gap-1">
                  <span className="font-medium">{Math.round(idea.iceScore)}</span>
                  <span className="text-xs text-muted-foreground">
                    ({idea.impactScore}×{idea.confidenceScore}×{idea.easeScore})
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              <span className="text-sm">
                {idea.submitter.name || idea.submitter.email}
              </span>
            </TableCell>
            <TableCell>
              {idea.owner ? (
                <span className="text-sm">
                  {idea.owner.name || idea.owner.email}
                </span>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground">
                {format(new Date(idea.createdAt), "MMM d, yyyy")}
              </span>
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
                    <Link href={`/ideas/${idea.id}`}>View Details</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/ideas/${idea.id}/edit`}>Edit</Link>
                  </DropdownMenuItem>
                  {idea.promotedTo && (
                    <DropdownMenuItem asChild>
                      <Link href={`/initiatives/${idea.promotedTo.id}`}>
                        View Initiative
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        );

        if (groupBy === "none" || !groupedIdeas) {
          // Ungrouped view
          return (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[35%]">Idea</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Clients</TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={sortBy === "ice" ? "font-bold" : ""}
                          onClick={() => setSortBy("ice")}
                        >
                          ICE Score
                          {sortBy === "ice" && <TrendingUp className="ml-1 h-3 w-3" />}
                        </Button>
                      </TableHead>
                      <TableHead>Submitter</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={sortBy === "created" ? "font-bold" : ""}
                          onClick={() => setSortBy("created")}
                        >
                          Created
                        </Button>
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIdeas.map((idea) => renderIdeaRow(idea))}
                    {filteredIdeas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center">
                          No ideas found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        }

        // Grouped view
        return (
          <div className="space-y-4">
            {groupedIdeas.map((group) => {
              const groupId = group.specialty?.id || "_untagged";
              const isCollapsed = collapsedGroups.has(groupId);

              return (
                <Card key={groupId}>
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 border-b"
                    onClick={() => toggleGroup(groupId)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    {group.specialty ? (
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: group.specialty.color || "#6B7280" }}
                      />
                    ) : null}
                    <span className="font-semibold">
                      {group.specialty?.name || "Untagged"}
                    </span>
                    <Badge variant="secondary" className="ml-auto">
                      {group.ideas.length} {group.ideas.length === 1 ? "idea" : "ideas"}
                    </Badge>
                  </div>
                  {!isCollapsed && (
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[35%]">Idea</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Clients</TableHead>
                            <TableHead>ICE Score</TableHead>
                            <TableHead>Submitter</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.ideas.map((idea) => renderIdeaRow(idea, false))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  )}
                </Card>
              );
            })}
            {groupedIdeas.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No ideas found.
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}
    </div>
  );
}

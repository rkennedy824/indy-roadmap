"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Specialty, ShareLink, Client, Squad, SquadMember, Engineer } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Copy, ExternalLink, UsersRound, Pencil, Sparkles, Briefcase, Users, Loader2, Calendar } from "lucide-react";
import { format, startOfQuarter, endOfQuarter, getYear } from "date-fns";
import { IntegrationsTab } from "./integrations-tab";

type ShareLinkWithClient = ShareLink & { client: Client | null };
type SquadWithMembers = Squad & { members: (SquadMember & { engineer: Engineer })[] };

interface JiraConfig {
  id: string;
  siteUrl: string;
  email: string;
  apiToken: string | null;
  projectKey: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SettingsViewProps {
  specialties: Specialty[];
  shareLinks: ShareLinkWithClient[];
  clients: Client[];
  squads: SquadWithMembers[];
  engineers: Engineer[];
  jiraConfig: JiraConfig | null;
}

export function SettingsView({
  specialties,
  shareLinks,
  clients,
  squads,
  engineers,
  jiraConfig,
}: SettingsViewProps) {
  const router = useRouter();
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [newLinkViewType, setNewLinkViewType] = useState<string>("CLIENT");
  const [newLinkClientId, setNewLinkClientId] = useState<string>("");
  const [newLinkExpiry, setNewLinkExpiry] = useState<string>("30");
  const [newLinkCustomSlug, setNewLinkCustomSlug] = useState<string>("");
  const [newLinkSelectedQuarters, setNewLinkSelectedQuarters] = useState<string[]>([]);
  const [newLinkCustomRange, setNewLinkCustomRange] = useState(false);
  const [newLinkStartDate, setNewLinkStartDate] = useState<string>(format(startOfQuarter(new Date()), "yyyy-MM-dd"));
  const [newLinkEndDate, setNewLinkEndDate] = useState<string>(format(endOfQuarter(new Date()), "yyyy-MM-dd"));
  const [generatingBrief, setGeneratingBrief] = useState<string | null>(null);

  // Generate quarter options
  const quarterOptions = (() => {
    const currentYear = getYear(new Date());
    const quarters: { value: string; label: string; start: Date; end: Date }[] = [];

    // Previous year Q4
    const prevQ4Start = startOfQuarter(new Date(currentYear - 1, 9, 1));
    quarters.push({
      value: `Q4-${currentYear - 1}`,
      label: `Q4 ${currentYear - 1}`,
      start: prevQ4Start,
      end: endOfQuarter(prevQ4Start),
    });

    // Current year
    for (let q = 1; q <= 4; q++) {
      const qStart = startOfQuarter(new Date(currentYear, (q - 1) * 3, 1));
      quarters.push({
        value: `Q${q}-${currentYear}`,
        label: `Q${q} ${currentYear}`,
        start: qStart,
        end: endOfQuarter(qStart),
      });
    }

    // Next year
    for (let q = 1; q <= 4; q++) {
      const qStart = startOfQuarter(new Date(currentYear + 1, (q - 1) * 3, 1));
      quarters.push({
        value: `Q${q}-${currentYear + 1}`,
        label: `Q${q} ${currentYear + 1}`,
        start: qStart,
        end: endOfQuarter(qStart),
      });
    }

    return quarters;
  })();

  // Calculate date range from selected quarters
  const getDateRangeFromQuarters = (selectedQuarters: string[]) => {
    if (selectedQuarters.length === 0) {
      return {
        start: format(startOfQuarter(new Date()), "yyyy-MM-dd"),
        end: format(endOfQuarter(new Date()), "yyyy-MM-dd"),
      };
    }

    const selectedQuarterData = quarterOptions.filter(q => selectedQuarters.includes(q.value));
    const startDates = selectedQuarterData.map(q => q.start);
    const endDates = selectedQuarterData.map(q => q.end);

    const earliestStart = new Date(Math.min(...startDates.map(d => d.getTime())));
    const latestEnd = new Date(Math.max(...endDates.map(d => d.getTime())));

    return {
      start: format(earliestStart, "yyyy-MM-dd"),
      end: format(latestEnd, "yyyy-MM-dd"),
    };
  };

  const toggleQuarter = (quarterValue: string) => {
    setNewLinkSelectedQuarters(prev => {
      const newSelection = prev.includes(quarterValue)
        ? prev.filter(q => q !== quarterValue)
        : [...prev, quarterValue];

      if (!newLinkCustomRange && newSelection.length > 0) {
        const { start, end } = getDateRangeFromQuarters(newSelection);
        setNewLinkStartDate(start);
        setNewLinkEndDate(end);
      }

      return newSelection;
    });
  };

  // Squad management state
  const [isCreatingSquad, setIsCreatingSquad] = useState(false);
  const [squadDialogOpen, setSquadDialogOpen] = useState(false);
  const [editingSquad, setEditingSquad] = useState<SquadWithMembers | null>(null);
  const [squadName, setSquadName] = useState("");
  const [squadDescription, setSquadDescription] = useState("");
  const [squadColor, setSquadColor] = useState("#3B82F6");
  const [squadMemberIds, setSquadMemberIds] = useState<string[]>([]);
  const [squadLeadId, setSquadLeadId] = useState<string>("");

  const createShareLink = async () => {
    setIsCreatingLink(true);
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewType: newLinkViewType,
          clientId: newLinkViewType === "CLIENT" ? (newLinkClientId || null) : null,
          expiresInDays: newLinkExpiry ? parseInt(newLinkExpiry) : null,
          startDate: newLinkStartDate,
          endDate: newLinkEndDate,
          customSlug: newLinkCustomSlug || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.details || data.error || "Failed to create link");
      }
      router.refresh();
      setNewLinkViewType("CLIENT");
      setNewLinkClientId("");
      setNewLinkExpiry("30");
      setNewLinkCustomSlug("");
      setNewLinkSelectedQuarters([]);
      setNewLinkCustomRange(false);
      setNewLinkStartDate(format(startOfQuarter(new Date()), "yyyy-MM-dd"));
      setNewLinkEndDate(format(endOfQuarter(new Date()), "yyyy-MM-dd"));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to create share link");
    } finally {
      setIsCreatingLink(false);
    }
  };

  const generateBrief = async (token: string) => {
    setGeneratingBrief(token);
    try {
      const response = await fetch(`/api/share/${token}/generate-brief`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate brief");
      }

      router.refresh();
      alert("Executive brief generated successfully!");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to generate brief");
    } finally {
      setGeneratingBrief(null);
    }
  };

  const deleteShareLink = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this share link?")) return;

    try {
      const response = await fetch(`/api/share?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete link");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to delete share link");
    }
  };

  const copyLink = (token: string, customSlug?: string | null) => {
    const slug = customSlug || token;
    const url = `${window.location.origin}/view/${slug}`;
    navigator.clipboard.writeText(url);
    alert("Link copied to clipboard!");
  };

  const isExpired = (expiresAt: Date | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // Squad functions
  const openSquadDialog = (squad?: SquadWithMembers) => {
    if (squad) {
      setEditingSquad(squad);
      setSquadName(squad.name);
      setSquadDescription(squad.description || "");
      setSquadColor(squad.color || "#3B82F6");
      setSquadMemberIds(squad.members.map(m => m.engineerId));
      setSquadLeadId(squad.members.find(m => m.isLead)?.engineerId || "");
    } else {
      setEditingSquad(null);
      setSquadName("");
      setSquadDescription("");
      setSquadColor("#3B82F6");
      setSquadMemberIds([]);
      setSquadLeadId("");
    }
    setSquadDialogOpen(true);
  };

  const saveSquad = async () => {
    if (!squadName.trim()) return;
    setIsCreatingSquad(true);

    try {
      const url = editingSquad ? `/api/squads/${editingSquad.id}` : "/api/squads";
      const method = editingSquad ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: squadName,
          description: squadDescription || null,
          color: squadColor,
          memberIds: squadMemberIds,
          leadId: squadLeadId || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to save squad");
      router.refresh();
      setSquadDialogOpen(false);
    } catch (error) {
      console.error(error);
      alert("Failed to save squad");
    } finally {
      setIsCreatingSquad(false);
    }
  };

  const deleteSquad = async (id: string) => {
    if (!confirm("Are you sure you want to delete this squad?")) return;

    try {
      const response = await fetch(`/api/squads/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete squad");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to delete squad");
    }
  };

  const toggleSquadMember = (engineerId: string) => {
    setSquadMemberIds(prev =>
      prev.includes(engineerId)
        ? prev.filter(id => id !== engineerId)
        : [...prev, engineerId]
    );
  };

  return (
    <Tabs defaultValue="specialties" className="space-y-6">
      <TabsList>
        <TabsTrigger value="specialties">Specialties</TabsTrigger>
        <TabsTrigger value="squads">Squads</TabsTrigger>
        <TabsTrigger value="sharing">Share Links</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
      </TabsList>

      <TabsContent value="specialties">
        <Card>
          <CardHeader>
            <CardTitle>Work Type Specialties</CardTitle>
            <CardDescription>
              Manage the specialties/work types used to tag initiatives and engineers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Color</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {specialties.map((specialty) => (
                  <TableRow key={specialty.id}>
                    <TableCell>
                      <Badge
                        style={{ backgroundColor: specialty.color || undefined }}
                      >
                        {specialty.name}
                      </Badge>
                    </TableCell>
                    <TableCell>{specialty.description || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border"
                          style={{ backgroundColor: specialty.color || "#6B7280" }}
                        />
                        <span className="text-sm text-muted-foreground">
                          {specialty.color || "#6B7280"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-4 text-sm text-muted-foreground">
              To add or modify specialties, update the seed file and re-run the seed command.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="squads">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Squads</CardTitle>
              <CardDescription>
                Group engineers into squads for team-based work assignment.
              </CardDescription>
            </div>
            <Dialog open={squadDialogOpen} onOpenChange={setSquadDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => openSquadDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Squad
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingSquad ? "Edit Squad" : "Create Squad"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={squadName}
                      onChange={(e) => setSquadName(e.target.value)}
                      placeholder="e.g., Mobile Team"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={squadDescription}
                      onChange={(e) => setSquadDescription(e.target.value)}
                      placeholder="Optional description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={squadColor}
                        onChange={(e) => setSquadColor(e.target.value)}
                        className="w-16 h-10 p-1"
                      />
                      <Input
                        value={squadColor}
                        onChange={(e) => setSquadColor(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Members</Label>
                    <div className="border rounded-md p-3 max-h-[200px] overflow-y-auto space-y-2">
                      {engineers.map((engineer) => (
                        <div key={engineer.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`squad-member-${engineer.id}`}
                            checked={squadMemberIds.includes(engineer.id)}
                            onCheckedChange={() => toggleSquadMember(engineer.id)}
                          />
                          <label
                            htmlFor={`squad-member-${engineer.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            {engineer.name}
                          </label>
                          {squadMemberIds.includes(engineer.id) && (
                            <Button
                              variant={squadLeadId === engineer.id ? "default" : "outline"}
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => setSquadLeadId(squadLeadId === engineer.id ? "" : engineer.id)}
                            >
                              {squadLeadId === engineer.id ? "Lead" : "Set Lead"}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={saveSquad}
                    disabled={isCreatingSquad || !squadName.trim()}
                  >
                    {isCreatingSquad ? "Saving..." : editingSquad ? "Update Squad" : "Create Squad"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Squad</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {squads.map((squad) => {
                  const lead = squad.members.find(m => m.isLead);
                  return (
                    <TableRow key={squad.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full shrink-0"
                            style={{ backgroundColor: squad.color || "#6B7280" }}
                          />
                          <div>
                            <div className="font-medium">{squad.name}</div>
                            {squad.description && (
                              <div className="text-xs text-muted-foreground">{squad.description}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {squad.members.slice(0, 3).map((member) => (
                            <Badge key={member.id} variant="outline" className="text-xs">
                              {member.engineer.name}
                            </Badge>
                          ))}
                          {squad.members.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{squad.members.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {lead ? lead.engineer.name : <span className="text-muted-foreground">None</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openSquadDialog(squad)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteSquad(squad.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {squads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No squads created yet. Create a squad to group engineers together.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sharing">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Share Links</CardTitle>
              <CardDescription>
                Create shareable links for client-facing roadmap views.
              </CardDescription>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Link
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Share Link</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Link Type</Label>
                    <Select value={newLinkViewType} onValueChange={setNewLinkViewType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLIENT">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Client Roadmap
                          </div>
                        </SelectItem>
                        <SelectItem value="EXECUTIVE">
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            Executive Roadmap
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {newLinkViewType === "CLIENT"
                        ? "Shows client-visible initiatives with client-friendly descriptions"
                        : "Shows all initiatives with executive summaries and AI-generated brief"}
                    </p>
                  </div>
                  {newLinkViewType === "CLIENT" && (
                    <div className="space-y-2">
                      <Label>Client (Optional)</Label>
                      <Select
                        value={newLinkClientId || "none"}
                        onValueChange={(v) => setNewLinkClientId(v === "none" ? "" : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All client-visible initiatives" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">All client-visible</SelectItem>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Expires In (Days)</Label>
                    <Select
                      value={newLinkExpiry || "never"}
                      onValueChange={(v) => setNewLinkExpiry(v === "never" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never</SelectItem>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="365">1 year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Custom URL Slug (optional)</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">/view/</span>
                      <Input
                        value={newLinkCustomSlug}
                        onChange={(e) => setNewLinkCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                        placeholder="e.g., cinepolis-roadmap"
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave empty for auto-generated URL. Only letters, numbers, hyphens, and underscores allowed.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Roadmap Date Range
                    </Label>
                    <div className="border rounded-md p-3 space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        {quarterOptions.map((q) => (
                          <div key={q.value} className="flex items-center gap-2">
                            <Checkbox
                              id={`quarter-${q.value}`}
                              checked={newLinkSelectedQuarters.includes(q.value)}
                              onCheckedChange={() => toggleQuarter(q.value)}
                              disabled={newLinkCustomRange}
                            />
                            <label
                              htmlFor={`quarter-${q.value}`}
                              className={`text-sm cursor-pointer ${newLinkCustomRange ? "text-muted-foreground" : ""}`}
                            >
                              {q.label}
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Checkbox
                          id="custom-range"
                          checked={newLinkCustomRange}
                          onCheckedChange={(checked) => {
                            setNewLinkCustomRange(!!checked);
                            if (!checked && newLinkSelectedQuarters.length > 0) {
                              const { start, end } = getDateRangeFromQuarters(newLinkSelectedQuarters);
                              setNewLinkStartDate(start);
                              setNewLinkEndDate(end);
                            }
                          }}
                        />
                        <label htmlFor="custom-range" className="text-sm cursor-pointer">
                          Custom Range
                        </label>
                      </div>
                      {newLinkCustomRange && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Start Date</Label>
                            <Input
                              type="date"
                              value={newLinkStartDate}
                              onChange={(e) => setNewLinkStartDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">End Date</Label>
                            <Input
                              type="date"
                              value={newLinkEndDate}
                              onChange={(e) => setNewLinkEndDate(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {newLinkSelectedQuarters.length === 0 && !newLinkCustomRange
                        ? "Select quarters or use custom range (defaults to current quarter)"
                        : `${format(new Date(newLinkStartDate), "MMM d, yyyy")} - ${format(new Date(newLinkEndDate), "MMM d, yyyy")}`}
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={createShareLink}
                    disabled={isCreatingLink}
                  >
                    {isCreatingLink ? "Creating..." : "Create Link"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shareLinks.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-mono text-sm">
                      {link.customSlug ? (
                        <span className="text-primary">{link.customSlug}</span>
                      ) : (
                        <span>{link.token.slice(0, 8)}...</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={link.viewType === "EXECUTIVE" ? "default" : "secondary"}
                        className="gap-1"
                      >
                        {link.viewType === "EXECUTIVE" ? (
                          <>
                            <Briefcase className="h-3 w-3" />
                            Executive
                          </>
                        ) : (
                          <>
                            <Users className="h-3 w-3" />
                            Client
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {link.viewType === "CLIENT" ? (
                        link.client?.name || (
                          <span className="text-muted-foreground">All</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {link.startDate && link.endDate ? (
                        <span>
                          {format(new Date(link.startDate), "MMM d")} - {format(new Date(link.endDate), "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Default</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {link.expiresAt
                        ? format(new Date(link.expiresAt), "MMM d, yyyy")
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      {isExpired(link.expiresAt) ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {link.viewType === "EXECUTIVE" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => generateBrief(link.token)}
                            disabled={generatingBrief === link.token}
                            title="Generate Executive Brief"
                          >
                            {generatingBrief === link.token ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyLink(link.token, link.customSlug)}
                          title="Copy Link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Open Link"
                        >
                          <a
                            href={`/view/${link.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteShareLink(link.id)}
                          title="Delete Link"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {shareLinks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      No share links created yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="integrations">
        <IntegrationsTab initialConfig={jiraConfig} />
      </TabsContent>
    </Tabs>
  );
}

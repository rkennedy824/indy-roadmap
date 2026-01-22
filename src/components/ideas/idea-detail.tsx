"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Idea,
  IdeaTag,
  IdeaComment,
  IdeaAttachment,
  Specialty,
  Initiative,
  IdeaStatus,
  Client,
  IdeaClientImpact,
  ClientImpactType,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft,
  Edit,
  Trash2,
  ArrowUpRight,
  Send,
  User,
  Users,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { format } from "date-fns";
import { PromoteIdeaDialog } from "./promote-idea-dialog";

type IdeaWithRelations = Idea & {
  submitter: { id: string; name: string | null; email: string };
  owner: { id: string; name: string | null; email: string } | null;
  tags: (IdeaTag & { specialty: Specialty })[];
  comments: (IdeaComment & {
    author: { id: string; name: string | null; email: string };
  })[];
  attachments: IdeaAttachment[];
  promotedTo: { id: string; title: string; status: string } | null;
  impactedClients: (IdeaClientImpact & { client: Client })[];
};

interface IdeaDetailProps {
  idea: IdeaWithRelations;
  users: { id: string; name: string | null; email: string }[];
  specialties: Specialty[];
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

export function IdeaDetail({ idea, users, specialties, clients }: IdeaDetailProps) {
  const router = useRouter();
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  const [ownerId, setOwnerId] = useState<string>(idea.ownerId || "");
  const [impactScore, setImpactScore] = useState<number>(idea.impactScore || 5);
  const [confidenceScore, setConfidenceScore] = useState<number>(idea.confidenceScore || 5);
  const [easeScore, setEaseScore] = useState<number>(idea.easeScore || 5);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);

  const calculatedIceScore = (impactScore * confidenceScore * easeScore) / 10;

  const handleUpdateField = async (field: string, value: unknown) => {
    try {
      const response = await fetch(`/api/ideas/${idea.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });

      if (!response.ok) {
        throw new Error("Failed to update idea");
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to update idea:", error);
    }
  };

  const handleStatusChange = async (newStatus: IdeaStatus) => {
    setStatus(newStatus);
    await handleUpdateField("status", newStatus);
  };

  const handleOwnerChange = async (newOwnerId: string) => {
    setOwnerId(newOwnerId);
    await handleUpdateField("ownerId", newOwnerId || null);
  };

  const handleScoreChange = async (
    scoreType: "impactScore" | "confidenceScore" | "easeScore",
    value: number
  ) => {
    if (scoreType === "impactScore") setImpactScore(value);
    if (scoreType === "confidenceScore") setConfidenceScore(value);
    if (scoreType === "easeScore") setEaseScore(value);
    await handleUpdateField(scoreType, value);
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/ideas/${idea.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment }),
      });

      if (!response.ok) {
        throw new Error("Failed to add comment");
      }

      setComment("");
      router.refresh();
    } catch (error) {
      console.error("Failed to add comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this idea?")) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/ideas/${idea.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete idea");
      }

      router.push("/ideas");
    } catch (error) {
      console.error("Failed to delete idea:", error);
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/ideas">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{idea.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={STATUS_COLORS[status]} variant="secondary">
                {STATUS_LABELS[status]}
              </Badge>
              {idea.promotedTo && (
                <Link
                  href={`/initiatives/${idea.promotedTo.id}`}
                  className="flex items-center gap-1 text-sm text-emerald-600 hover:underline"
                >
                  <ArrowUpRight className="h-3 w-3" />
                  View Initiative
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/ideas/${idea.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          {status === "ACCEPTED" && !idea.promotedTo && (
            <Button onClick={() => setShowPromoteDialog(true)}>
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Promote to Initiative
            </Button>
          )}
          <Button
            variant="destructive"
            size="icon"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Problem Statement */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Problem Statement</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{idea.problemStatement}</p>
            </CardContent>
          </Card>

          {/* Context */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {idea.whoIsImpacted && (
                <div>
                  <Label className="text-sm text-muted-foreground">
                    Who is impacted?
                  </Label>
                  <p>{idea.whoIsImpacted}</p>
                </div>
              )}
              {idea.whereItHappens && (
                <div>
                  <Label className="text-sm text-muted-foreground">
                    Where does it happen?
                  </Label>
                  <p>{idea.whereItHappens}</p>
                </div>
              )}
              {idea.frequency && (
                <div>
                  <Label className="text-sm text-muted-foreground">
                    How often?
                  </Label>
                  <p>{idea.frequency}</p>
                </div>
              )}
              {idea.severity && (
                <div>
                  <Label className="text-sm text-muted-foreground">
                    Severity
                  </Label>
                  <p>{idea.severity}</p>
                </div>
              )}
              {!idea.whoIsImpacted &&
                !idea.whereItHappens &&
                !idea.frequency &&
                !idea.severity && (
                  <p className="text-muted-foreground">No context provided.</p>
                )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {idea.currentWorkaround && (
                <div>
                  <Label className="text-sm text-muted-foreground">
                    Current Workaround
                  </Label>
                  <p className="whitespace-pre-wrap">{idea.currentWorkaround}</p>
                </div>
              )}
              {idea.desiredOutcome && (
                <div>
                  <Label className="text-sm text-muted-foreground">
                    Desired Outcome
                  </Label>
                  <p className="whitespace-pre-wrap">{idea.desiredOutcome}</p>
                </div>
              )}
              {idea.evidence && (
                <div>
                  <Label className="text-sm text-muted-foreground">
                    Evidence / Links
                  </Label>
                  <p className="whitespace-pre-wrap">{idea.evidence}</p>
                </div>
              )}
              {!idea.currentWorkaround && !idea.desiredOutcome && !idea.evidence && (
                <p className="text-muted-foreground">No additional details provided.</p>
              )}
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Discussion ({idea.comments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {idea.comments.map((c) => (
                <div key={c.id} className="border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">
                      {c.author.name || c.author.email}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(c.createdAt), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
              {idea.comments.length === 0 && (
                <p className="text-muted-foreground">No comments yet.</p>
              )}
              <div className="pt-4 border-t">
                <Textarea
                  placeholder="Add a comment..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
                <div className="flex justify-end mt-2">
                  <Button
                    onClick={handleAddComment}
                    disabled={isSubmitting || !comment.trim()}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Post Comment
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* ICE Scoring */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                ICE Score: {Math.round(calculatedIceScore)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Impact</Label>
                  <span className="text-sm font-medium">{impactScore}</span>
                </div>
                <Slider
                  value={[impactScore]}
                  onValueChange={([v]) => setImpactScore(v)}
                  onValueCommit={([v]) => handleScoreChange("impactScore", v)}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Confidence</Label>
                  <span className="text-sm font-medium">{confidenceScore}</span>
                </div>
                <Slider
                  value={[confidenceScore]}
                  onValueChange={([v]) => setConfidenceScore(v)}
                  onValueCommit={([v]) => handleScoreChange("confidenceScore", v)}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Ease</Label>
                  <span className="text-sm font-medium">{easeScore}</span>
                </div>
                <Slider
                  value={[easeScore]}
                  onValueChange={([v]) => setEaseScore(v)}
                  onValueCommit={([v]) => handleScoreChange("easeScore", v)}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>
              <div className="text-xs text-muted-foreground pt-2 border-t">
                ICE = (Impact × Confidence × Ease) / 10
              </div>
            </CardContent>
          </Card>

          {/* Status & Assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => handleStatusChange(v as IdeaStatus)}
                  disabled={status === "PROMOTED"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Owner</Label>
                <Select value={ownerId} onValueChange={handleOwnerChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Tags</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {idea.tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      style={{
                        backgroundColor: tag.specialty.color || undefined,
                      }}
                    >
                      {tag.specialty.name}
                    </Badge>
                  ))}
                  {idea.tags.length === 0 && (
                    <span className="text-muted-foreground text-sm">No tags</span>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Client Impact</Label>
                <div className="mt-1">
                  {idea.clientImpactType ? (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {idea.clientImpactType === "SPECIFIC" ? (
                          idea.impactedClients.length > 0 ? (
                            idea.impactedClients.map(ic => ic.client.name).join(", ")
                          ) : (
                            "Specific (none selected)"
                          )
                        ) : (
                          CLIENT_IMPACT_LABELS[idea.clientImpactType]
                        )}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not specified</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Submitted by</span>
                <span>{idea.submitter.name || idea.submitter.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Created</span>
                <span>{format(new Date(idea.createdAt), "MMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Updated</span>
                <span>{format(new Date(idea.updatedAt), "MMM d, yyyy")}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Promote Dialog */}
      <PromoteIdeaDialog
        idea={idea}
        specialties={specialties}
        open={showPromoteDialog}
        onOpenChange={setShowPromoteDialog}
      />
    </div>
  );
}

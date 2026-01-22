"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Idea, IdeaTag, Specialty } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpRight, Loader2 } from "lucide-react";

type IdeaWithTags = Idea & {
  tags: (IdeaTag & { specialty: Specialty })[];
};

interface PromoteIdeaDialogProps {
  idea: IdeaWithTags;
  specialties: Specialty[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromoteIdeaDialog({
  idea,
  specialties,
  open,
  onOpenChange,
}: PromoteIdeaDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState(idea.title);
  const [effortEstimate, setEffortEstimate] = useState("1");
  const [betaTargetDate, setBetaTargetDate] = useState("");
  const [masterTargetDate, setMasterTargetDate] = useState("");
  const [visibilityLevel, setVisibilityLevel] = useState("INTERNAL");

  const handlePromote = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/ideas/${idea.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          effortEstimate: parseFloat(effortEstimate),
          betaTargetDate: betaTargetDate || null,
          masterTargetDate: masterTargetDate || null,
          visibilityLevel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to promote idea");
      }

      const result = await response.json();
      onOpenChange(false);
      router.push(`/initiatives/${result.initiative.id}`);
    } catch (error) {
      console.error("Failed to promote idea:", error);
      alert(error instanceof Error ? error.message : "Failed to promote idea");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5" />
            Promote to Initiative
          </DialogTitle>
          <DialogDescription>
            Create a new initiative from this idea. The idea will be marked as
            promoted and linked to the new initiative.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Initiative Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="effort">Effort Estimate (weeks)</Label>
            <Input
              id="effort"
              type="number"
              min="0.5"
              step="0.5"
              value={effortEstimate}
              onChange={(e) => setEffortEstimate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="beta">Beta Target Date</Label>
              <Input
                id="beta"
                type="date"
                value={betaTargetDate}
                onChange={(e) => setBetaTargetDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="master">Production Target Date</Label>
              <Input
                id="master"
                type="date"
                value={masterTargetDate}
                onChange={(e) => setMasterTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility</Label>
            <Select value={visibilityLevel} onValueChange={setVisibilityLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERNAL">Internal Only</SelectItem>
                <SelectItem value="CLIENT_VISIBLE">Client Visible</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border p-3 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              The following will be copied from the idea:
            </p>
            <ul className="text-sm mt-2 space-y-1">
              <li>• Problem statement → Documentation inputs</li>
              <li>• Desired outcome → Goals</li>
              <li>• Who is impacted → Target users</li>
              <li>
                • Tags: {idea.tags.map((t) => t.specialty.name).join(", ") || "None"}
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePromote} disabled={isSubmitting || !title.trim()}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Initiative
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

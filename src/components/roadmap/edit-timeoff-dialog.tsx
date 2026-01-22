"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UnavailabilityBlock, UnavailabilityType, Engineer } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PalmtreeIcon, Plane, HeartPulse, PartyPopper, Clock, Trash2 } from "lucide-react";
import { format } from "date-fns";

type UnavailabilityWithEngineer = UnavailabilityBlock & {
  engineer: Engineer;
};

const UNAVAILABILITY_OPTIONS: { type: UnavailabilityType; label: string; icon: typeof PalmtreeIcon }[] = [
  { type: "PTO", label: "PTO / Vacation", icon: PalmtreeIcon },
  { type: "TRAVEL", label: "Travel", icon: Plane },
  { type: "SICK", label: "Sick Leave", icon: HeartPulse },
  { type: "HOLIDAY", label: "Holiday", icon: PartyPopper },
  { type: "OTHER", label: "Other", icon: Clock },
];

interface EditTimeOffDialogProps {
  block: UnavailabilityWithEngineer;
  open: boolean;
  onClose: () => void;
}

export function EditTimeOffDialog({ block, open, onClose }: EditTimeOffDialogProps) {
  const router = useRouter();
  const [type, setType] = useState<UnavailabilityType>(block.type);
  const [startDate, setStartDate] = useState(format(new Date(block.startDate), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(block.endDate), "yyyy-MM-dd"));
  const [reason, setReason] = useState(block.reason || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/unavailability/${block.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          startDate,
          endDate,
          reason: reason || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update time off");
      }

      router.refresh();
      onClose();
    } catch (error) {
      console.error("Failed to update time off:", error);
      alert(error instanceof Error ? error.message : "Failed to update time off");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/unavailability/${block.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete time off");
      }

      router.refresh();
      onClose();
    } catch (error) {
      console.error("Failed to delete time off:", error);
      alert(error instanceof Error ? error.message : "Failed to delete time off");
      setIsDeleting(false);
    }
  };

  const selectedOption = UNAVAILABILITY_OPTIONS.find(o => o.type === type);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Time Off</DialogTitle>
          <DialogDescription>
            {block.engineer.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as UnavailabilityType)}>
              <SelectTrigger>
                <SelectValue>
                  {selectedOption && (
                    <div className="flex items-center gap-2">
                      <selectedOption.icon className="h-4 w-4" />
                      {selectedOption.label}
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {UNAVAILABILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.type} value={opt.type}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="h-4 w-4" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input
              placeholder="e.g., Conference, Doctor appointment..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isDeleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Time Off</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this time off entry? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

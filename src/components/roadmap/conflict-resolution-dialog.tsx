"use client";

import { ScheduledBlock, Initiative, Engineer } from "@prisma/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Layers, ArrowRight, X } from "lucide-react";
import { format } from "date-fns";

interface ConflictingBlock {
  id: string;
  initiative: { title: string };
  startDate: Date | string;
  endDate: Date | string;
}

interface ConflictResolutionDialogProps {
  open: boolean;
  onClose: () => void;
  onResolve: (resolution: "stack" | "push") => void;
  movingInitiativeTitle: string;
  conflictingBlocks: ConflictingBlock[];
  newStartDate: Date;
  newEndDate: Date;
  isLoading?: boolean;
}

export function ConflictResolutionDialog({
  open,
  onClose,
  onResolve,
  movingInitiativeTitle,
  conflictingBlocks,
  newStartDate,
  newEndDate,
  isLoading,
}: ConflictResolutionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Schedule Conflict Detected</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Moving <strong>{movingInitiativeTitle}</strong> to{" "}
                {format(newStartDate, "MMM d")} - {format(newEndDate, "MMM d")}{" "}
                conflicts with:
              </p>
              <ul className="space-y-1">
                {conflictingBlocks.map((block) => (
                  <li key={block.id} className="text-sm bg-muted p-2 rounded">
                    <strong>{block.initiative.title}</strong>
                    <span className="text-muted-foreground ml-2">
                      ({format(new Date(block.startDate), "MMM d")} -{" "}
                      {format(new Date(block.endDate), "MMM d")})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm">How would you like to resolve this?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => onResolve("stack")}
            disabled={isLoading}
            variant="outline"
            className="w-full justify-start gap-2"
          >
            <Layers className="h-4 w-4" />
            <div className="text-left">
              <div className="font-medium">Stack them</div>
              <div className="text-xs text-muted-foreground">
                Allow both to run at the same time
              </div>
            </div>
          </Button>
          <Button
            onClick={() => onResolve("push")}
            disabled={isLoading}
            variant="outline"
            className="w-full justify-start gap-2"
          >
            <ArrowRight className="h-4 w-4" />
            <div className="text-left">
              <div className="font-medium">Push existing back</div>
              <div className="text-xs text-muted-foreground">
                Move conflicting initiatives to later dates
              </div>
            </div>
          </Button>
          <Button
            onClick={onClose}
            disabled={isLoading}
            variant="ghost"
            className="w-full"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

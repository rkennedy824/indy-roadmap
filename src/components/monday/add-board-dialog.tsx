"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, AlertCircle } from "lucide-react";

interface Board {
  id: string;
  name: string;
  board_kind: string;
}

interface AddBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  existingBoardIds: string[];
}

export function AddBoardDialog({
  open,
  onOpenChange,
  integrationId,
  existingBoardIds,
}: AddBoardDialogProps) {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [entityType, setEntityType] = useState<"IDEA" | "INITIATIVE">("IDEA");
  const [ingestMode, setIngestMode] = useState<"ONCE" | "CONTINUOUS">("CONTINUOUS");
  const [writebackEnabled, setWritebackEnabled] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(true);

  useEffect(() => {
    if (open) {
      fetchBoards();
    }
  }, [open]);

  const fetchBoards = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/monday/boards");
      if (!response.ok) {
        throw new Error("Failed to fetch boards");
      }

      const data = await response.json();
      // Filter out boards that are already configured
      const availableBoards = data.boards.filter(
        (b: Board) => !existingBoardIds.includes(b.id)
      );
      setBoards(availableBoards);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load boards");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedBoardId) {
      setError("Please select a board");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const selectedBoard = boards.find((b) => b.id === selectedBoardId);

      const response = await fetch(`/api/monday/boards/${selectedBoardId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId,
          boardName: selectedBoard?.name,
          entityType,
          ingestMode,
          writebackEnabled,
          pollingEnabled,
          pollingIntervalMins: 5,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add board");
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add board");
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedBoardId("");
    setEntityType("IDEA");
    setIngestMode("CONTINUOUS");
    setWritebackEnabled(false);
    setPollingEnabled(true);
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) resetForm();
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Monday Board</DialogTitle>
          <DialogDescription>
            Select a board to sync with your roadmap
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label>Board</Label>
              <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a board" />
                </SelectTrigger>
                <SelectContent>
                  {boards.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No available boards found
                    </div>
                  ) : (
                    boards.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sync To</Label>
              <Select
                value={entityType}
                onValueChange={(v) => setEntityType(v as "IDEA" | "INITIATIVE")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IDEA">Ideas</SelectItem>
                  <SelectItem value="INITIATIVE">Initiatives</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Items from this board will be created as {entityType === "IDEA" ? "Ideas" : "Initiatives"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Ingest Mode</Label>
              <Select
                value={ingestMode}
                onValueChange={(v) => setIngestMode(v as "ONCE" | "CONTINUOUS")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTINUOUS">Continuous Sync</SelectItem>
                  <SelectItem value="ONCE">One-time Import</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ingestMode === "CONTINUOUS"
                  ? "Updates to Monday items will sync to INDY"
                  : "Items are imported once and not updated"}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Writeback</Label>
                <p className="text-xs text-muted-foreground">
                  Push status changes back to Monday
                </p>
              </div>
              <Switch
                checked={writebackEnabled}
                onCheckedChange={setWritebackEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Polling</Label>
                <p className="text-xs text-muted-foreground">
                  Check for updates every 5 minutes
                </p>
              </div>
              <Switch
                checked={pollingEnabled}
                onCheckedChange={setPollingEnabled}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !selectedBoardId}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Board"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

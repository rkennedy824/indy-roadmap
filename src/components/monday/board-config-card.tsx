"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  Settings2,
  Webhook,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";

interface BoardConfig {
  id: string;
  boardId: string;
  boardName: string | null;
  entityType: string;
  ingestMode: string;
  writebackEnabled: boolean;
  webhookEnabled: boolean;
  webhookId: string | null;
  pollingEnabled: boolean;
  pollingIntervalMins: number;
  lastPolledAt: Date | null;
  isActive: boolean;
  linkedItems: number;
  fieldMappings: unknown[];
  statusMappings: unknown[];
}

interface BoardConfigCardProps {
  board: BoardConfig;
}

export function BoardConfigCard({ board }: BoardConfigCardProps) {
  const router = useRouter();
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleBackfill = async () => {
    if (
      !confirm(
        "This will import all items from the Monday board. Continue?"
      )
    ) {
      return;
    }

    setIsBackfilling(true);
    try {
      const response = await fetch("/api/monday/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "backfill",
          boardConfigId: board.id,
        }),
      });

      const data = await response.json();

      if (data.errors?.length > 0) {
        alert(
          `Backfill completed with errors:\n${data.errors.map((e: { itemId: string; error: string }) => `${e.itemId}: ${e.error}`).join("\n")}`
        );
      } else {
        alert(
          `Backfill completed!\nCreated: ${data.created}\nUpdated: ${data.updated}\nSkipped: ${data.skipped}`
        );
      }

      router.refresh();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Backfill failed"
      );
    } finally {
      setIsBackfilling(false);
    }
  };

  const handlePoll = async () => {
    setIsPolling(true);
    try {
      const response = await fetch("/api/monday/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "poll",
          boardConfigId: board.id,
        }),
      });

      const data = await response.json();
      alert(
        `Poll completed!\nProcessed: ${data.processed}\nErrors: ${data.errors}`
      );
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Poll failed");
    } finally {
      setIsPolling(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to remove this board configuration? Linked items will be unlinked."
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/monday/boards/${board.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h5 className="font-medium">
              {board.boardName || `Board ${board.boardId}`}
            </h5>
            <Badge variant="outline" className="text-xs">
              {board.entityType === "IDEA" ? "Ideas" : "Initiatives"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {board.linkedItems} linked items
          </p>
        </div>
        <div className="flex items-center gap-2">
          {board.webhookEnabled && board.webhookId && (
            <Badge
              variant="outline"
              className="bg-green-500/10 text-green-600 border-green-500/20"
            >
              <Webhook className="mr-1 h-3 w-3" />
              Webhook
            </Badge>
          )}
          {board.pollingEnabled && (
            <Badge variant="outline">
              <Clock className="mr-1 h-3 w-3" />
              {board.pollingIntervalMins}m
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <ArrowDownToLine className="h-3 w-3" />
          {board.ingestMode === "ONCE" ? "One-time import" : "Continuous sync"}
        </span>
        {board.writebackEnabled && (
          <span className="flex items-center gap-1">
            <ArrowUpFromLine className="h-3 w-3" />
            Writeback enabled
          </span>
        )}
        {board.lastPolledAt && (
          <span>
            Last polled:{" "}
            {format(new Date(board.lastPolledAt), "MMM d, h:mm a")}
          </span>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleBackfill}
          disabled={isBackfilling}
        >
          {isBackfilling ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <ArrowDownToLine className="mr-2 h-3 w-3" />
          )}
          Backfill
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePoll}
          disabled={isPolling}
        >
          {isPolling ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3 w-3" />
          )}
          Poll Now
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            router.push(`/integrations/monday/boards/${board.id}`)
          }
        >
          <Settings2 className="mr-2 h-3 w-3" />
          Configure
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-destructive hover:text-destructive"
        >
          {isDeleting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

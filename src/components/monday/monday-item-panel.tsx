"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  Unlink,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

interface MondayItemLink {
  id: string;
  mondayItemId: string;
  mondayItemName: string | null;
  lastSyncedAt: Date;
  syncStatus: string;
  lastError: string | null;
  boardConfig: {
    boardId: string;
    boardName: string | null;
  };
}

interface MondayItemPanelProps {
  link: MondayItemLink | null;
  entityType: "IDEA" | "INITIATIVE";
  entityId: string;
}

export function MondayItemPanel({
  link,
  entityType,
  entityId,
}: MondayItemPanelProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/monday/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push",
          entityType,
          entityId,
        }),
      });

      const data = await response.json();
      setSyncResult({
        success: data.success,
        message: data.success
          ? "Synced successfully"
          : data.error || "Sync failed",
      });

      if (data.success) {
        router.refresh();
      }
    } catch (error) {
      setSyncResult({
        success: false,
        message: error instanceof Error ? error.message : "Sync failed",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUnlink = async () => {
    if (!link) return;

    if (
      !confirm(
        "Are you sure you want to unlink this item from Monday? The item will remain in Monday but won't sync."
      )
    ) {
      return;
    }

    setIsUnlinking(true);
    try {
      // Delete the link via direct API call
      const response = await fetch(`/api/monday/links/${link.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to unlink");
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to unlink");
    } finally {
      setIsUnlinking(false);
    }
  };

  const getSyncStatusBadge = (status: string) => {
    switch (status) {
      case "SYNCED":
        return (
          <Badge
            variant="outline"
            className="bg-green-500/10 text-green-600 border-green-500/20"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Synced
          </Badge>
        );
      case "PENDING_PUSH":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
          >
            <Clock className="mr-1 h-3 w-3" />
            Pending Push
          </Badge>
        );
      case "PENDING_PULL":
        return (
          <Badge
            variant="outline"
            className="bg-blue-500/10 text-blue-600 border-blue-500/20"
          >
            <Clock className="mr-1 h-3 w-3" />
            Pending Pull
          </Badge>
        );
      case "ERROR":
        return (
          <Badge
            variant="outline"
            className="bg-red-500/10 text-red-600 border-red-500/20"
          >
            <XCircle className="mr-1 h-3 w-3" />
            Error
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!link) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-purple-500/10">
              <svg viewBox="0 0 64 64" className="h-4 w-4" fill="none">
                <rect width="64" height="64" rx="8" fill="#6161FF" />
                <circle cx="20" cy="20" r="6" fill="#FF158A" />
                <circle cx="20" cy="44" r="6" fill="#FFCB00" />
                <circle cx="44" cy="20" r="6" fill="#00D647" />
                <circle cx="44" cy="44" r="6" fill="#FF158A" />
                <rect
                  x="17"
                  y="17"
                  width="6"
                  height="30"
                  rx="3"
                  fill="white"
                />
                <rect
                  x="41"
                  y="17"
                  width="6"
                  height="30"
                  rx="3"
                  fill="white"
                />
              </svg>
            </div>
            <CardTitle className="text-sm">Monday.com</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Not linked to a Monday item
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/integrations")}
          >
            Go to Integrations
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-purple-500/10">
              <svg viewBox="0 0 64 64" className="h-4 w-4" fill="none">
                <rect width="64" height="64" rx="8" fill="#6161FF" />
                <circle cx="20" cy="20" r="6" fill="#FF158A" />
                <circle cx="20" cy="44" r="6" fill="#FFCB00" />
                <circle cx="44" cy="20" r="6" fill="#00D647" />
                <circle cx="44" cy="44" r="6" fill="#FF158A" />
                <rect
                  x="17"
                  y="17"
                  width="6"
                  height="30"
                  rx="3"
                  fill="white"
                />
                <rect
                  x="41"
                  y="17"
                  width="6"
                  height="30"
                  rx="3"
                  fill="white"
                />
              </svg>
            </div>
            <CardTitle className="text-sm">Monday.com</CardTitle>
          </div>
          {getSyncStatusBadge(link.syncStatus)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <a
            href={`https://monday.com/board/${link.boardConfig.boardId}/pulses/${link.mondayItemId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
          >
            {link.mondayItemName || `Item #${link.mondayItemId}`}
            <ExternalLink className="h-3 w-3" />
          </a>
          <p className="text-xs text-muted-foreground">
            {link.boardConfig.boardName || `Board ${link.boardConfig.boardId}`}
          </p>
        </div>

        <div className="text-xs text-muted-foreground">
          Last synced:{" "}
          {format(new Date(link.lastSyncedAt), "MMM d, yyyy h:mm a")}
        </div>

        {link.lastError && (
          <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded">
            {link.lastError}
          </div>
        )}

        {syncResult && (
          <div
            className={`text-xs p-2 rounded flex items-center gap-1 ${
              syncResult.success
                ? "text-green-600 bg-green-500/10"
                : "text-red-500 bg-red-500/10"
            }`}
          >
            {syncResult.success ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            {syncResult.message}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Sync Now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnlink}
            disabled={isUnlinking}
            className="text-muted-foreground hover:text-destructive"
          >
            {isUnlinking ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Unlink className="mr-1 h-3 w-3" />
            )}
            Unlink
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

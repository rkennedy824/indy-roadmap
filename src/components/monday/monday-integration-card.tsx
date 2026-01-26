"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Settings2,
  Plus,
  Trash2,
  Database,
  Webhook,
} from "lucide-react";
import { format } from "date-fns";
import { BoardConfigCard } from "./board-config-card";

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

interface MondayConfig {
  id: string;
  accountId: string;
  accountName: string | null;
  apiVersion: string;
  isActive: boolean;
  healthStatus: string | null;
  lastHealthCheck: Date | null;
  createdAt: Date;
  boardConfigs: BoardConfig[];
}

interface MondayIntegrationCardProps {
  config: MondayConfig | null;
}

export function MondayIntegrationCard({ config }: MondayIntegrationCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(!config);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Form state
  const [accessToken, setAccessToken] = useState("");
  const [apiVersion, setApiVersion] = useState("2024-10");

  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/monday/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });

      const data = await response.json();
      setTestResult({
        success: data.success,
        message: data.success
          ? `Connected as ${data.user}`
          : data.error || "Connection failed",
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const saveConfig = async () => {
    if (!accessToken) {
      alert("Access token is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/monday/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          apiVersion,
          testConnection: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save configuration");
      }

      setIsEditing(false);
      setAccessToken("");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteConfig = async () => {
    if (
      !confirm(
        "Are you sure you want to remove the Monday.com integration? This will unlink all items."
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/monday/config", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete configuration");
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <svg
                viewBox="0 0 64 64"
                className="h-6 w-6"
                fill="none"
              >
                <rect width="64" height="64" rx="8" fill="#6161FF" />
                <circle cx="20" cy="20" r="6" fill="#FF158A" />
                <circle cx="20" cy="44" r="6" fill="#FFCB00" />
                <circle cx="44" cy="20" r="6" fill="#00D647" />
                <circle cx="44" cy="44" r="6" fill="#FF158A" />
                <rect x="17" y="17" width="6" height="30" rx="3" fill="white" />
                <rect x="41" y="17" width="6" height="30" rx="3" fill="white" />
              </svg>
            </div>
            <div>
              <CardTitle>Monday.com Integration</CardTitle>
              <CardDescription>
                Sync items from Monday boards to Ideas or Initiatives
              </CardDescription>
            </div>
          </div>
          {config && !isEditing && (
            <Badge
              variant={config.isActive ? "default" : "secondary"}
              className={
                config.healthStatus === "healthy"
                  ? "bg-green-500/10 text-green-600 border-green-500/20"
                  : config.healthStatus === "degraded"
                    ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                    : ""
              }
            >
              {config.healthStatus === "healthy"
                ? "Connected"
                : config.healthStatus === "degraded"
                  ? "Degraded"
                  : "Disconnected"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isEditing ? (
          // Edit/Setup Form
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessToken">
                Access Token{" "}
                {config && (
                  <span className="text-muted-foreground font-normal">
                    (leave blank to keep existing)
                  </span>
                )}
              </Label>
              <Input
                id="accessToken"
                type="password"
                placeholder={config ? "••••••••" : "Enter your API token"}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Get your token from Monday.com {">"} Profile {">"} Admin {">"}{" "}
                API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiVersion">API Version</Label>
              <Input
                id="apiVersion"
                placeholder="2024-10"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Pin a specific API version for stability
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={saveConfig} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save & Connect"
                )}
              </Button>
              {config && (
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : config ? (
          // Connected View
          <div className="space-y-6">
            {/* Connection Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Account:</span>{" "}
                {config.accountName || config.accountId}
              </div>
              <div>
                <span className="text-muted-foreground">API Version:</span>{" "}
                {config.apiVersion}
              </div>
              <div>
                <span className="text-muted-foreground">Connected:</span>{" "}
                {format(new Date(config.createdAt), "MMM d, yyyy")}
              </div>
              <div>
                <span className="text-muted-foreground">Health Check:</span>{" "}
                {config.lastHealthCheck
                  ? format(
                      new Date(config.lastHealthCheck),
                      "MMM d, yyyy h:mm a"
                    )
                  : "Never"}
              </div>
            </div>

            {/* Test Connection */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={testConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
              {testResult && (
                <span
                  className={`text-sm flex items-center gap-1 ${testResult.success ? "text-green-600" : "text-destructive"}`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {testResult.message}
                </span>
              )}
            </div>

            {/* Board Configurations */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-medium">Configured Boards</h4>
                  <p className="text-sm text-muted-foreground">
                    Boards syncing with your roadmap
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/integrations/monday/boards")}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Board
                </Button>
              </div>

              {config.boardConfigs.length > 0 ? (
                <div className="space-y-3">
                  {config.boardConfigs.map((board) => (
                    <BoardConfigCard key={board.id} board={board} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 border rounded-lg border-dashed">
                  <Database className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No boards configured yet
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => router.push("/integrations/monday/boards")}
                  >
                    Add your first board
                  </Button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="border-t pt-4 flex gap-2">
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Settings2 className="mr-2 h-4 w-4" />
                Edit Settings
              </Button>
              <Button variant="destructive" onClick={deleteConfig}>
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          // Not configured
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">
              Connect your Monday.com account to sync boards with your roadmap
            </p>
            <Button onClick={() => setIsEditing(true)}>
              Set Up Monday.com Integration
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

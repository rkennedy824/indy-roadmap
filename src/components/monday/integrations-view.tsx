"use client";

import { MondayIntegrationCard } from "./monday-integration-card";
import { EventLogTable } from "./event-log-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface MondayConfig {
  id: string;
  accountId: string;
  accountName: string | null;
  apiVersion: string;
  isActive: boolean;
  healthStatus: string | null;
  lastHealthCheck: Date | null;
  createdAt: Date;
  boardConfigs: Array<{
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
  }>;
}

interface JiraConfig {
  id: string;
  siteUrl: string;
  email: string;
  isActive: boolean;
  lastSyncAt: Date | null;
}

interface EventLog {
  id: string;
  direction: string;
  eventType: string;
  source: string;
  status: string;
  errorMessage: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  accountName: string | null;
}

interface Stats {
  last24Hours: Record<string, number>;
  lastSuccessfulInbound: Date | null;
  lastSuccessfulOutbound: Date | null;
}

interface IntegrationsViewProps {
  mondayConfig: MondayConfig | null;
  jiraConfig: JiraConfig | null;
  recentEvents: EventLog[];
  stats: Stats;
}

export function IntegrationsView({
  mondayConfig,
  jiraConfig,
  recentEvents,
  stats,
}: IntegrationsViewProps) {
  const successCount = stats.last24Hours.success || 0;
  const failedCount = stats.last24Hours.failed || 0;
  const skippedCount = stats.last24Hours.skipped || 0;

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{successCount}</p>
                <p className="text-sm text-muted-foreground">
                  Successful (24h)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{failedCount}</p>
                <p className="text-sm text-muted-foreground">Failed (24h)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {stats.lastSuccessfulInbound
                    ? format(
                        new Date(stats.lastSuccessfulInbound),
                        "MMM d, h:mm a"
                      )
                    : "Never"}
                </p>
                <p className="text-sm text-muted-foreground">Last Inbound</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {stats.lastSuccessfulOutbound
                    ? format(
                        new Date(stats.lastSuccessfulOutbound),
                        "MMM d, h:mm a"
                      )
                    : "Never"}
                </p>
                <p className="text-sm text-muted-foreground">Last Outbound</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monday.com Integration */}
        <MondayIntegrationCard config={mondayConfig} />

        {/* Jira Integration (existing) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6 text-blue-500"
                    fill="currentColor"
                  >
                    <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z" />
                  </svg>
                </div>
                <div>
                  <CardTitle>Jira Integration</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Sync initiatives with Jira epics
                  </p>
                </div>
              </div>
              {jiraConfig && (
                <Badge
                  variant={jiraConfig.isActive ? "default" : "secondary"}
                  className={
                    jiraConfig.isActive
                      ? "bg-green-500/10 text-green-600 border-green-500/20"
                      : ""
                  }
                >
                  {jiraConfig.isActive ? "Connected" : "Disconnected"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {jiraConfig ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Site:</span>{" "}
                    <a
                      href={`https://${jiraConfig.siteUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {jiraConfig.siteUrl}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>{" "}
                    {jiraConfig.email}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Synced:</span>{" "}
                    {jiraConfig.lastSyncAt
                      ? format(
                          new Date(jiraConfig.lastSyncAt),
                          "MMM d, yyyy h:mm a"
                        )
                      : "Never"}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Manage Jira settings in{" "}
                  <a href="/settings" className="text-primary hover:underline">
                    Settings
                  </a>
                </p>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">
                  Jira integration not configured
                </p>
                <a href="/settings" className="text-primary hover:underline">
                  Configure in Settings
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Event Log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Integration Events</CardTitle>
        </CardHeader>
        <CardContent>
          <EventLogTable events={recentEvents} />
        </CardContent>
      </Card>
    </div>
  );
}

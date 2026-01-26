import { db } from "@/lib/db";
import { IntegrationsView } from "@/components/monday/integrations-view";

export default async function IntegrationsPage() {
  // Fetch Monday integration config
  const mondayIntegration = await db.mondayIntegration.findFirst({
    where: { isActive: true },
    include: {
      boardConfigs: {
        include: {
          fieldMappings: true,
          statusMappings: true,
          _count: { select: { itemLinks: true } },
        },
      },
    },
  });

  // Fetch Jira config for display alongside Monday
  const jiraConfig = await db.jiraConfig.findFirst();

  // Fetch recent events for the dashboard
  const recentEvents = await db.integrationEventLog.findMany({
    take: 10,
    orderBy: { receivedAt: "desc" },
    include: {
      integration: {
        select: { accountName: true },
      },
    },
  });

  // Get stats
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const eventStats = await db.integrationEventLog.groupBy({
    by: ["status"],
    _count: true,
    where: {
      receivedAt: { gte: last24Hours },
    },
  });

  const lastSuccessfulInbound = await db.integrationEventLog.findFirst({
    where: { direction: "INBOUND", status: "SUCCESS" },
    orderBy: { processedAt: "desc" },
    select: { processedAt: true },
  });

  const lastSuccessfulOutbound = await db.integrationEventLog.findFirst({
    where: { direction: "OUTBOUND", status: "SUCCESS" },
    orderBy: { processedAt: "desc" },
    select: { processedAt: true },
  });

  const mondayConfig = mondayIntegration
    ? {
        id: mondayIntegration.id,
        accountId: mondayIntegration.accountId,
        accountName: mondayIntegration.accountName,
        apiVersion: mondayIntegration.apiVersion,
        isActive: mondayIntegration.isActive,
        healthStatus: mondayIntegration.healthStatus,
        lastHealthCheck: mondayIntegration.lastHealthCheck,
        createdAt: mondayIntegration.createdAt,
        boardConfigs: mondayIntegration.boardConfigs.map((bc) => ({
          id: bc.id,
          boardId: bc.boardId,
          boardName: bc.boardName,
          entityType: bc.entityType,
          ingestMode: bc.ingestMode,
          writebackEnabled: bc.writebackEnabled,
          webhookEnabled: bc.webhookEnabled,
          webhookId: bc.webhookId,
          pollingEnabled: bc.pollingEnabled,
          pollingIntervalMins: bc.pollingIntervalMins,
          lastPolledAt: bc.lastPolledAt,
          isActive: bc.isActive,
          linkedItems: bc._count.itemLinks,
          fieldMappings: bc.fieldMappings,
          statusMappings: bc.statusMappings,
        })),
      }
    : null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Connect external services to sync data with your roadmap
        </p>
      </div>

      <IntegrationsView
        mondayConfig={mondayConfig}
        jiraConfig={
          jiraConfig
            ? {
                id: jiraConfig.id,
                siteUrl: jiraConfig.siteUrl,
                email: jiraConfig.email,
                isActive: jiraConfig.isActive,
                lastSyncAt: jiraConfig.lastSyncAt,
              }
            : null
        }
        recentEvents={recentEvents.map((e) => ({
          id: e.id,
          direction: e.direction,
          eventType: e.eventType,
          source: e.source,
          status: e.status,
          errorMessage: e.errorMessage,
          receivedAt: e.receivedAt,
          processedAt: e.processedAt,
          accountName: e.integration?.accountName ?? null,
        }))}
        stats={{
          last24Hours: eventStats.reduce(
            (acc, s) => {
              acc[s.status.toLowerCase()] = s._count;
              return acc;
            },
            {} as Record<string, number>
          ),
          lastSuccessfulInbound: lastSuccessfulInbound?.processedAt || null,
          lastSuccessfulOutbound: lastSuccessfulOutbound?.processedAt || null,
        }}
      />
    </div>
  );
}

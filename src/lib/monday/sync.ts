import { db } from "@/lib/db";
import type {
  MondayBoardConfig,
  MondayItemLink,
  MondayFieldMapping,
  MondayStatusMapping,
  Idea,
  Initiative,
} from "@prisma/client";
import { MondayClient, createMondayClient } from "./client";
import { MondayService, createMondayService } from "./service";
import {
  extractMappedFields,
  buildMondayColumnValues,
  FieldMapping,
} from "./field-mapper";
import {
  mapMondayStatusToIdea,
  mapMondayStatusToInitiative,
  mapIdeaStatusToMonday,
  mapInitiativeStatusToMonday,
  buildStatusMappings,
} from "./status-mapper";
import type { MondayItem, SyncResult, BackfillResult } from "./types";

interface SyncContext {
  client: MondayClient;
  service: MondayService;
  integration: { id: string; accessToken: string; apiVersion: string };
}

const OUTBOUND_LOCK_DURATION_MS = 5000; // 5 seconds

type BoardConfigWithRelations = MondayBoardConfig & {
  fieldMappings: MondayFieldMapping[];
  statusMappings: MondayStatusMapping[];
};

type ItemLinkWithRelations = MondayItemLink & {
  idea?: Idea | null;
  initiative?: Initiative | null;
};

/**
 * Get or create Monday context from database config
 */
export async function getMondayContext(): Promise<SyncContext | null> {
  const integration = await db.mondayIntegration.findFirst({
    where: { isActive: true },
  });

  if (!integration) return null;

  const client = createMondayClient({
    accessToken: integration.accessToken,
    apiVersion: integration.apiVersion,
  });

  const service = createMondayService(client);

  return {
    client,
    service,
    integration: {
      id: integration.id,
      accessToken: integration.accessToken,
      apiVersion: integration.apiVersion,
    },
  };
}

/**
 * Process an inbound item (from Monday to INDY)
 */
export async function processInboundItem(
  boardConfig: BoardConfigWithRelations,
  mondayItem: MondayItem
): Promise<SyncResult> {
  const existingLink = await db.mondayItemLink.findUnique({
    where: {
      boardConfigId_mondayItemId: {
        boardConfigId: boardConfig.id,
        mondayItemId: mondayItem.id,
      },
    },
    include: { idea: true, initiative: true },
  });

  // Build field mappings
  const mappings: FieldMapping[] = boardConfig.fieldMappings.map((m) => ({
    mondayColumnId: m.mondayColumnId,
    mondayColumnType: m.mondayColumnType as FieldMapping["mondayColumnType"],
    indyFieldName: m.indyFieldName,
    indyFieldType: m.indyFieldType,
    syncDirection: m.syncDirection as FieldMapping["syncDirection"],
  }));

  // Transform column values
  const transformedData = extractMappedFields(
    mondayItem.column_values,
    mappings
  );
  transformedData.title = mondayItem.name;

  // Handle status mapping
  const statusMappings = buildStatusMappings(
    boardConfig.statusMappings,
    boardConfig.entityType
  );
  const statusColumn = mondayItem.column_values.find(
    (c) => c.type === "status"
  );
  if (statusColumn?.text) {
    if (boardConfig.entityType === "IDEA") {
      transformedData.status = mapMondayStatusToIdea(
        statusColumn.text,
        statusMappings as Record<string, Idea["status"]>
      );
    } else {
      transformedData.status = mapMondayStatusToInitiative(
        statusColumn.text,
        statusMappings as Record<string, Initiative["status"]>
      );
    }
  }

  if (boardConfig.entityType === "IDEA") {
    return processInboundIdea(
      boardConfig,
      mondayItem,
      existingLink,
      transformedData
    );
  } else {
    return processInboundInitiative(
      boardConfig,
      mondayItem,
      existingLink,
      transformedData
    );
  }
}

async function processInboundIdea(
  boardConfig: BoardConfigWithRelations,
  mondayItem: MondayItem,
  existingLink: ItemLinkWithRelations | null,
  data: Record<string, unknown>
): Promise<SyncResult> {
  // Get a default user for submitter
  const defaultUser = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!defaultUser) {
    return {
      success: false,
      direction: "none",
      error: "No admin user found for idea creation",
    };
  }

  if (existingLink?.idea) {
    // Update existing idea (if continuous mode)
    if (boardConfig.ingestMode === "ONCE") {
      return { success: true, direction: "none" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title as string;
    if (data.problemStatement)
      updateData.problemStatement = data.problemStatement as string;
    if (data.status) updateData.status = data.status;
    if (data.whoIsImpacted) updateData.whoIsImpacted = data.whoIsImpacted;
    if (data.whereItHappens) updateData.whereItHappens = data.whereItHappens;
    if (data.frequency) updateData.frequency = data.frequency;
    if (data.severity) updateData.severity = data.severity;
    if (data.currentWorkaround)
      updateData.currentWorkaround = data.currentWorkaround;
    if (data.desiredOutcome) updateData.desiredOutcome = data.desiredOutcome;
    if (data.evidence) updateData.evidence = data.evidence;

    await db.idea.update({
      where: { id: existingLink.ideaId! },
      data: updateData,
    });

    await db.mondayItemLink.update({
      where: { id: existingLink.id },
      data: { lastSyncedAt: new Date(), syncStatus: "SYNCED" },
    });

    return { success: true, direction: "pull" };
  }

  // Create new idea
  const idea = await db.idea.create({
    data: {
      title: (data.title as string) || mondayItem.name,
      problemStatement: (data.problemStatement as string) || "",
      status: (data.status as Idea["status"]) || "NEW",
      submitterId: defaultUser.id,
      whoIsImpacted: data.whoIsImpacted as string | undefined,
      whereItHappens: data.whereItHappens as string | undefined,
      frequency: data.frequency as string | undefined,
      severity: data.severity as string | undefined,
      currentWorkaround: data.currentWorkaround as string | undefined,
      desiredOutcome: data.desiredOutcome as string | undefined,
      evidence: data.evidence as string | undefined,
    },
  });

  await db.mondayItemLink.create({
    data: {
      boardConfigId: boardConfig.id,
      mondayItemId: mondayItem.id,
      mondayItemName: mondayItem.name,
      ideaId: idea.id,
      lastSyncedAt: new Date(),
      syncStatus: "SYNCED",
    },
  });

  return { success: true, direction: "pull" };
}

async function processInboundInitiative(
  boardConfig: BoardConfigWithRelations,
  mondayItem: MondayItem,
  existingLink: ItemLinkWithRelations | null,
  data: Record<string, unknown>
): Promise<SyncResult> {
  if (existingLink?.initiative) {
    if (boardConfig.ingestMode === "ONCE") {
      return { success: true, direction: "none" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title as string;
    if (data.description) updateData.description = data.description as string;
    if (data.status) updateData.status = data.status;
    if (data.deadline) updateData.deadline = data.deadline as Date;
    if (data.priority !== undefined)
      updateData.priority = data.priority as number;
    if (data.effortEstimate !== undefined)
      updateData.effortEstimate = data.effortEstimate as number;
    if (data.betaTargetDate)
      updateData.betaTargetDate = data.betaTargetDate as Date;
    if (data.masterTargetDate)
      updateData.masterTargetDate = data.masterTargetDate as Date;

    await db.initiative.update({
      where: { id: existingLink.initiativeId! },
      data: updateData,
    });

    await db.mondayItemLink.update({
      where: { id: existingLink.id },
      data: { lastSyncedAt: new Date(), syncStatus: "SYNCED" },
    });

    return { success: true, direction: "pull" };
  }

  // Create new initiative
  const initiative = await db.initiative.create({
    data: {
      title: (data.title as string) || mondayItem.name,
      description: (data.description as string) || null,
      status: (data.status as Initiative["status"]) || "DRAFT",
      priority: (data.priority as number) || 0,
      effortEstimate: (data.effortEstimate as number) || 1,
      deadline: data.deadline as Date | undefined,
      betaTargetDate: data.betaTargetDate as Date | undefined,
      masterTargetDate: data.masterTargetDate as Date | undefined,
    },
  });

  await db.mondayItemLink.create({
    data: {
      boardConfigId: boardConfig.id,
      mondayItemId: mondayItem.id,
      mondayItemName: mondayItem.name,
      initiativeId: initiative.id,
      lastSyncedAt: new Date(),
      syncStatus: "SYNCED",
    },
  });

  return { success: true, direction: "pull" };
}

/**
 * Push changes from INDY to Monday (writeback)
 */
export async function pushToMonday(
  itemLink: MondayItemLink & {
    boardConfig: BoardConfigWithRelations;
  },
  entity: Idea | Initiative,
  entityType: "IDEA" | "INITIATIVE"
): Promise<SyncResult> {
  const context = await getMondayContext();
  if (!context) {
    return {
      success: false,
      direction: "none",
      error: "Monday integration not configured",
    };
  }

  const { service } = context;
  const { boardConfig } = itemLink;

  // Build column values from entity
  const mappings: FieldMapping[] = boardConfig.fieldMappings
    .filter((m) => m.syncDirection !== "INBOUND")
    .map((m) => ({
      mondayColumnId: m.mondayColumnId,
      mondayColumnType: m.mondayColumnType as FieldMapping["mondayColumnType"],
      indyFieldName: m.indyFieldName,
      indyFieldType: m.indyFieldType,
      syncDirection: m.syncDirection as FieldMapping["syncDirection"],
    }));

  const columnValues = buildMondayColumnValues(
    entity as unknown as Record<string, unknown>,
    mappings
  );

  // Add status if mapped
  const statusColumnMapping = boardConfig.fieldMappings.find(
    (m) => m.indyFieldName === "status"
  );
  if (statusColumnMapping && statusColumnMapping.syncDirection !== "INBOUND") {
    const mondayStatus =
      entityType === "IDEA"
        ? mapIdeaStatusToMonday((entity as Idea).status)
        : mapInitiativeStatusToMonday((entity as Initiative).status);

    columnValues[statusColumnMapping.mondayColumnId] = { label: mondayStatus };
  }

  try {
    // Set outbound lock before update
    await db.mondayItemLink.update({
      where: { id: itemLink.id },
      data: {
        lastOutboundAt: new Date(),
        outboundLockUntil: new Date(Date.now() + OUTBOUND_LOCK_DURATION_MS),
      },
    });

    // Update Monday item
    if (Object.keys(columnValues).length > 0) {
      await service.updateItem(
        boardConfig.boardId,
        itemLink.mondayItemId,
        columnValues
      );
    }

    // Update item name if title changed
    if (entity.title !== itemLink.mondayItemName) {
      await service.updateItemName(itemLink.mondayItemId, entity.title);
    }

    await db.mondayItemLink.update({
      where: { id: itemLink.id },
      data: {
        mondayItemName: entity.title,
        lastSyncedAt: new Date(),
        syncStatus: "SYNCED",
      },
    });

    return { success: true, direction: "push" };
  } catch (error) {
    await db.mondayItemLink.update({
      where: { id: itemLink.id },
      data: {
        syncStatus: "ERROR",
        lastError: error instanceof Error ? error.message : "Push failed",
      },
    });

    return {
      success: false,
      direction: "push",
      error: error instanceof Error ? error.message : "Push failed",
    };
  }
}

/**
 * Backfill items from a Monday board
 */
export async function backfillFromBoard(
  boardConfigId: string
): Promise<BackfillResult> {
  const context = await getMondayContext();
  if (!context) {
    return {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ itemId: "", error: "Not configured" }],
    };
  }

  const boardConfig = await db.mondayBoardConfig.findUnique({
    where: { id: boardConfigId },
    include: { fieldMappings: true, statusMappings: true },
  });

  if (!boardConfig) {
    return {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ itemId: "", error: "Board config not found" }],
    };
  }

  const result: BackfillResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  let cursor: string | undefined;

  do {
    const { items, cursor: nextCursor } = await context.service.getItems(
      boardConfig.boardId,
      50,
      cursor
    );

    for (const item of items) {
      result.total++;

      // Check if already linked
      const existing = await db.mondayItemLink.findUnique({
        where: {
          boardConfigId_mondayItemId: {
            boardConfigId: boardConfig.id,
            mondayItemId: item.id,
          },
        },
      });

      try {
        const syncResult = await processInboundItem(boardConfig, item);
        if (existing) {
          if (syncResult.direction === "pull") {
            result.updated++;
          } else {
            result.skipped++;
          }
        } else {
          result.created++;
        }
      } catch (error) {
        result.errors.push({
          itemId: item.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    cursor = nextCursor;
  } while (cursor);

  return result;
}

/**
 * Poll for updates from a specific board
 */
export async function pollBoard(boardConfigId: string): Promise<{
  processed: number;
  errors: number;
}> {
  const context = await getMondayContext();
  if (!context) {
    return { processed: 0, errors: 0 };
  }

  const boardConfig = await db.mondayBoardConfig.findUnique({
    where: { id: boardConfigId },
    include: { fieldMappings: true, statusMappings: true },
  });

  if (!boardConfig || !boardConfig.pollingEnabled) {
    return { processed: 0, errors: 0 };
  }

  let processed = 0;
  let errors = 0;
  let cursor: string | undefined;

  do {
    const { items, cursor: nextCursor } = await context.service.getItems(
      boardConfig.boardId,
      100,
      cursor
    );

    for (const item of items) {
      try {
        await processInboundItem(boardConfig, item);
        processed++;
      } catch {
        errors++;
      }
    }

    cursor = nextCursor;
  } while (cursor);

  await db.mondayBoardConfig.update({
    where: { id: boardConfigId },
    data: { lastPolledAt: new Date() },
  });

  return { processed, errors };
}

/**
 * Trigger writeback for an entity if it has a Monday link
 */
export async function triggerWriteback(
  entityType: "IDEA" | "INITIATIVE",
  entityId: string
): Promise<SyncResult | null> {
  const link =
    entityType === "IDEA"
      ? await db.mondayItemLink.findUnique({
          where: { ideaId: entityId },
          include: {
            boardConfig: {
              include: { fieldMappings: true, statusMappings: true },
            },
            idea: true,
          },
        })
      : await db.mondayItemLink.findUnique({
          where: { initiativeId: entityId },
          include: {
            boardConfig: {
              include: { fieldMappings: true, statusMappings: true },
            },
            initiative: true,
          },
        });

  if (!link || !link.boardConfig.writebackEnabled) {
    return null;
  }

  const entity = entityType === "IDEA"
    ? (link as { idea: Idea | null }).idea
    : (link as { initiative: Initiative | null }).initiative;
  if (!entity) {
    return null;
  }

  return pushToMonday(
    link as MondayItemLink & { boardConfig: BoardConfigWithRelations },
    entity,
    entityType
  );
}

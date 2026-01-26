import { MondayClient } from "./client";
import { MondayRateLimiter } from "./rate-limiter";
import type {
  MondayBoard,
  MondayItem,
  MondayColumn,
  MondayStatusLabel,
  MondayColumnValue,
} from "./types";

const BOARD_FIELDS = `
  id
  name
  description
  state
  board_kind
  columns {
    id
    title
    type
    settings_str
  }
  groups {
    id
    title
    color
    position
  }
`;

const ITEM_FIELDS = `
  id
  name
  state
  created_at
  updated_at
  board { id name }
  group { id title }
  column_values {
    id
    type
    text
    value
    additional_info
  }
  creator { id name email }
`;

export class MondayService {
  private rateLimiter = new MondayRateLimiter();

  constructor(private client: MondayClient) {}

  // ============================================
  // Account & Connection
  // ============================================

  async testConnection(): Promise<{
    success: boolean;
    user?: string;
    accountId?: number;
    error?: string;
  }> {
    try {
      const result = await this.rateLimiter.enqueue(() =>
        this.client.query<{
          me: { name: string; email: string; account: { id: number } };
        }>(`
          query {
            me {
              name
              email
              account { id }
            }
          }
        `)
      );
      return {
        success: true,
        user: result.me.name || result.me.email,
        accountId: result.me.account.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ============================================
  // Boards
  // ============================================

  async getBoards(): Promise<MondayBoard[]> {
    const result = await this.rateLimiter.enqueue(() =>
      this.client.query<{ boards: MondayBoard[] }>(`
        query {
          boards(limit: 100, state: active) {
            ${BOARD_FIELDS}
          }
        }
      `)
    );
    return result.boards;
  }

  async getBoard(boardId: string): Promise<MondayBoard | null> {
    const result = await this.rateLimiter.enqueue(() =>
      this.client.query<{ boards: MondayBoard[] }>(
        `
        query ($ids: [ID!]) {
          boards(ids: $ids) {
            ${BOARD_FIELDS}
          }
        }
      `,
        { ids: [boardId] }
      )
    );
    return result.boards[0] ?? null;
  }

  async getBoardColumns(boardId: string): Promise<MondayColumn[]> {
    const board = await this.getBoard(boardId);
    return board?.columns ?? [];
  }

  async getStatusLabels(
    boardId: string,
    columnId: string
  ): Promise<MondayStatusLabel[]> {
    const columns = await this.getBoardColumns(boardId);
    const statusColumn = columns.find(
      (c) => c.id === columnId && c.type === "status"
    );

    if (!statusColumn) return [];

    try {
      const settings = JSON.parse(statusColumn.settings_str);
      return Object.entries(settings.labels || {}).map(
        ([id, label]: [string, unknown]) => ({
          id: parseInt(id),
          label: label as string,
          color: settings.labels_colors?.[id]?.color || "#808080",
        })
      );
    } catch {
      return [];
    }
  }

  // ============================================
  // Items
  // ============================================

  async getItems(
    boardId: string,
    limit = 100,
    cursor?: string
  ): Promise<{ items: MondayItem[]; cursor?: string }> {
    const result = await this.rateLimiter.enqueue(() =>
      this.client.query<{
        boards: Array<{
          items_page: { cursor: string; items: MondayItem[] };
        }>;
      }>(
        `
        query ($boardId: ID!, $limit: Int!, $cursor: String) {
          boards(ids: [$boardId]) {
            items_page(limit: $limit, cursor: $cursor) {
              cursor
              items {
                ${ITEM_FIELDS}
              }
            }
          }
        }
      `,
        { boardId, limit, cursor }
      )
    );

    const page = result.boards[0]?.items_page;
    return {
      items: page?.items ?? [],
      cursor: page?.cursor,
    };
  }

  async getItem(itemId: string): Promise<MondayItem | null> {
    const result = await this.rateLimiter.enqueue(() =>
      this.client.query<{ items: MondayItem[] }>(
        `
        query ($ids: [ID!]) {
          items(ids: $ids) {
            ${ITEM_FIELDS}
          }
        }
      `,
        { ids: [itemId] }
      )
    );
    return result.items[0] ?? null;
  }

  async createItem(
    boardId: string,
    groupId: string,
    name: string,
    columnValues?: Record<string, unknown>
  ): Promise<MondayItem> {
    const result = await this.rateLimiter.enqueue(() =>
      this.client.mutate<{ create_item: MondayItem }>(
        `
        mutation ($boardId: ID!, $groupId: String!, $name: String!, $columnValues: JSON) {
          create_item(
            board_id: $boardId,
            group_id: $groupId,
            item_name: $name,
            column_values: $columnValues,
            create_labels_if_missing: true
          ) {
            ${ITEM_FIELDS}
          }
        }
      `,
        {
          boardId,
          groupId,
          name,
          columnValues: columnValues ? JSON.stringify(columnValues) : undefined,
        }
      )
    );
    return result.create_item;
  }

  async updateItem(
    boardId: string,
    itemId: string,
    columnValues: Record<string, unknown>
  ): Promise<MondayItem> {
    const result = await this.rateLimiter.enqueue(() =>
      this.client.mutate<{ change_multiple_column_values: MondayItem }>(
        `
        mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(
            board_id: $boardId,
            item_id: $itemId,
            column_values: $columnValues,
            create_labels_if_missing: true
          ) {
            ${ITEM_FIELDS}
          }
        }
      `,
        {
          boardId,
          itemId,
          columnValues: JSON.stringify(columnValues),
        }
      )
    );
    return result.change_multiple_column_values;
  }

  async updateItemName(itemId: string, name: string): Promise<void> {
    await this.rateLimiter.enqueue(() =>
      this.client.mutate(
        `
        mutation ($itemId: ID!, $name: String!) {
          change_simple_column_value(
            item_id: $itemId,
            column_id: "name",
            value: $name
          ) {
            id
          }
        }
      `,
        { itemId, name }
      )
    );
  }

  // ============================================
  // Webhooks
  // ============================================

  async createWebhook(
    boardId: string,
    url: string,
    event: string
  ): Promise<{ id: string }> {
    const result = await this.rateLimiter.enqueue(() =>
      this.client.mutate<{ create_webhook: { id: string } }>(
        `
        mutation ($boardId: ID!, $url: String!, $event: WebhookEventType!) {
          create_webhook(board_id: $boardId, url: $url, event: $event) {
            id
          }
        }
      `,
        { boardId, url, event }
      )
    );
    return result.create_webhook;
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.rateLimiter.enqueue(() =>
      this.client.mutate(
        `
        mutation ($id: ID!) {
          delete_webhook(id: $id) {
            id
          }
        }
      `,
        { id: webhookId }
      )
    );
  }

  async listWebhooks(boardId: string): Promise<Array<{ id: string; event: string }>> {
    const result = await this.rateLimiter.enqueue(() =>
      this.client.query<{
        boards: Array<{ webhooks: Array<{ id: string; event: string }> }>;
      }>(
        `
        query ($boardId: ID!) {
          boards(ids: [$boardId]) {
            webhooks {
              id
              event
            }
          }
        }
      `,
        { boardId }
      )
    );
    return result.boards[0]?.webhooks ?? [];
  }

  // ============================================
  // Helpers
  // ============================================

  extractColumnValue(
    columnValues: MondayColumnValue[],
    columnId: string
  ): { text: string | null; parsed: unknown } {
    const col = columnValues.find((c) => c.id === columnId);
    if (!col) return { text: null, parsed: null };

    let parsed: unknown = null;
    if (col.value) {
      try {
        parsed = JSON.parse(col.value);
      } catch {
        parsed = col.value;
      }
    }

    return { text: col.text, parsed };
  }
}

export function createMondayService(client: MondayClient): MondayService {
  return new MondayService(client);
}

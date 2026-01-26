import type {
  MondayConfig,
  MondayGraphQLResponse,
  MondayRateLimitInfo,
} from "./types";

export class MondayApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors?: Array<{ message: string; code?: string }>,
    public rateLimitInfo?: MondayRateLimitInfo
  ) {
    super(message);
    this.name = "MondayApiError";
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  get retryAfterSeconds(): number | null {
    return this.rateLimitInfo?.reset_in_x_seconds ?? null;
  }
}

export class MondayClient {
  private baseUrl = "https://api.monday.com/v2";
  private config: MondayConfig;
  private lastComplexity: MondayRateLimitInfo | null = null;

  constructor(config: MondayConfig) {
    this.config = config;
  }

  get complexityInfo(): MondayRateLimitInfo | null {
    return this.lastComplexity;
  }

  async query<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: this.config.accessToken,
        "Content-Type": "application/json",
        "API-Version": this.config.apiVersion,
      },
      body: JSON.stringify({ query, variables }),
    });

    // Parse rate limit headers
    const complexityBudget = response.headers.get("x-complexity-budget");
    const complexityUsed = response.headers.get("x-complexity-used");
    const resetIn = response.headers.get("x-complexity-reset-in");

    if (complexityBudget) {
      this.lastComplexity = {
        complexity_budget: parseInt(complexityBudget),
        complexity_used: parseInt(complexityUsed || "0"),
        reset_in_x_seconds: parseInt(resetIn || "60"),
      };
    }

    if (response.status === 429) {
      const retryAfter =
        response.headers.get("Retry-After") ||
        this.lastComplexity?.reset_in_x_seconds;
      throw new MondayApiError(
        "Rate limited",
        429,
        [{ message: "Complexity limit exceeded" }],
        {
          complexity_budget: this.lastComplexity?.complexity_budget ?? 0,
          complexity_used: this.lastComplexity?.complexity_used ?? 0,
          reset_in_x_seconds: retryAfter ? parseInt(String(retryAfter)) : 60,
        }
      );
    }

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new MondayApiError(
        `Monday API error: ${response.status} ${response.statusText}`,
        response.status,
        typeof errorBody === "object" && errorBody !== null
          ? [{ message: JSON.stringify(errorBody) }]
          : [{ message: String(errorBody) }]
      );
    }

    const result = (await response.json()) as MondayGraphQLResponse<T>;

    if (result.errors?.length) {
      throw new MondayApiError(
        result.errors[0].message,
        400,
        result.errors.map((e) => ({
          message: e.message,
          code: e.extensions?.code,
        }))
      );
    }

    return result.data!;
  }

  async mutate<T>(
    mutation: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    return this.query<T>(mutation, variables);
  }
}

export function createMondayClient(config: MondayConfig): MondayClient {
  return new MondayClient(config);
}

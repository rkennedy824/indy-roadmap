interface QueuedRequest {
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class MondayRateLimiter {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private retryAfterMs = 0;
  private lastRequestTime = 0;
  private minRequestInterval = 100; // 100ms between requests

  async enqueue<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: request,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  setRetryAfter(seconds: number): void {
    this.retryAfterMs = Date.now() + seconds * 1000;
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      // Wait if rate limited
      const now = Date.now();
      if (now < this.retryAfterMs) {
        await this.sleep(this.retryAfterMs - now);
      }

      // Enforce minimum interval
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.minRequestInterval) {
        await this.sleep(this.minRequestInterval - timeSinceLastRequest);
      }

      const item = this.queue.shift()!;
      this.lastRequestTime = Date.now();

      try {
        const result = await item.execute();
        item.resolve(result);
      } catch (error) {
        // Check if rate limited and should retry
        if (this.isRateLimitError(error)) {
          const retryAfter = this.getRetryAfterSeconds(error);
          if (retryAfter) {
            this.setRetryAfter(retryAfter);
            // Re-queue the request at the front
            this.queue.unshift(item);
            continue;
          }
        }
        item.reject(error as Error);
      }
    }

    this.processing = false;
  }

  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === "object" && "statusCode" in error) {
      return (error as { statusCode: number }).statusCode === 429;
    }
    return false;
  }

  private getRetryAfterSeconds(error: unknown): number | null {
    if (
      error &&
      typeof error === "object" &&
      "rateLimitInfo" in error &&
      error.rateLimitInfo &&
      typeof error.rateLimitInfo === "object"
    ) {
      const info = error.rateLimitInfo as { reset_in_x_seconds?: number };
      return info.reset_in_x_seconds ?? null;
    }
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

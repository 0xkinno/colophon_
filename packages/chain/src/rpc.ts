/**
 * COLOPHON: Read-Only Solana Chain Adapter
 *
 * Implements resilient RPC access with exponential backoff, rate limit handling,
 * and error classification into PARTIAL / UNKNOWN states.
 * Strictly read-only (Invariant I9).
 */

export type RpcErrorType = "RATE_LIMIT" | "NETWORK_TIMEOUT" | "NOT_FOUND" | "RPC_ERROR" | "UNKNOWN";

export class RpcClientError extends Error {
  constructor(
    message: string,
    public readonly errorType: RpcErrorType,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "RpcClientError";
  }
}

export type RpcClientConfig = {
  endpoint: string;
  maxRetries?: number;
  timeoutMs?: number;
  initialBackoffMs?: number;
};

export class SolanaReadOnlyClient {
  private readonly endpoint: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly initialBackoffMs: number;
  private requestId = 0;

  constructor(config: RpcClientConfig) {
    this.endpoint = config.endpoint;
    this.maxRetries = config.maxRetries ?? 3;
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.initialBackoffMs = config.initialBackoffMs ?? 500;
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    let attempt = 0;
    let delay = this.initialBackoffMs;

    while (attempt <= this.maxRetries) {
      attempt++;
      this.requestId++;
      const id = this.requestId;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.status === 429) {
          if (attempt <= this.maxRetries) {
            await new Promise((r) => setTimeout(r, delay));
            delay *= 2;
            continue;
          }
          throw new RpcClientError(`HTTP 429 Too Many Requests from RPC (${method})`, "RATE_LIMIT", 429);
        }

        if (!res.ok) {
          throw new RpcClientError(`HTTP ${res.status} from RPC (${method})`, "RPC_ERROR", res.status);
        }

        const body = (await res.json()) as { error?: { message: string; code?: number }; result: T };

        if (body.error) {
          throw new RpcClientError(`RPC ${method} error: ${body.error.message}`, "RPC_ERROR");
        }

        return body.result;
      } catch (err: unknown) {
        clearTimeout(timer);
        if (err instanceof RpcClientError) {
          throw err;
        }
        const isAbort = (err as Error)?.name === "AbortError";
        if (attempt <= this.maxRetries) {
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
          continue;
        }
        throw new RpcClientError(
          isAbort ? `Timeout (${this.timeoutMs}ms) for ${method}` : (err as Error)?.message ?? "Unknown error",
          isAbort ? "NETWORK_TIMEOUT" : "UNKNOWN"
        );
      }
    }

    throw new RpcClientError(`Failed after ${this.maxRetries} retries`, "UNKNOWN");
  }

  async getAccountInfoParsed(pubkey: string): Promise<any> {
    return this.call("getAccountInfo", [pubkey, { encoding: "jsonParsed" }]);
  }

  async getSignaturesForAddress(
    pubkey: string,
    options: { limit?: number; before?: string; until?: string } = {}
  ): Promise<any[]> {
    return this.call("getSignaturesForAddress", [pubkey, { limit: options.limit ?? 50, ...options }]);
  }

  async getTransaction(signature: string): Promise<any> {
    return this.call("getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
  }

  async getEpochInfo(): Promise<{
    epoch: number;
    slotIndex: number;
    slotsInEpoch: number;
    absoluteSlot: number;
    blockHeight: number;
    transactionCount?: number;
  }> {
    return this.call("getEpochInfo", []);
  }
}

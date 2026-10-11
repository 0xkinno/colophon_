

type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
let lastCall = 0;
const MIN_GAP_MS = Number(process.env.RPC_MIN_GAP_MS ?? 90);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mainnetEndpoint(): string {
  return process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
}

export class RpcFailure extends Error {
  constructor(message: string, readonly kind: "RATE_LIMIT" | "RPC_ERROR" | "NETWORK") {
    super(message);
  }
}

async function raw<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  let delay = 500;
  for (let attempt = 0; attempt < 7; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
      });
    } catch {
      await sleep(delay + Math.random() * 250);
      delay *= 2;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(delay + Math.random() * 300);
      delay = Math.min(delay * 2, 8000);
      continue;
    }
    const j = (await res.json()) as { result?: T; error?: { message: string } };
    if (j.error) {
      if (/rate|limit|too many/i.test(j.error.message)) {
        await sleep(delay + Math.random() * 300);
        delay = Math.min(delay * 2, 8000);
        continue;
      }
      throw new RpcFailure(`${method}: ${j.error.message}`, "RPC_ERROR");
    }
    return j.result as T;
  }
  throw new RpcFailure(`${method}: rate limited or unreachable`, "RATE_LIMIT");
}

export async function rpcCall<T>(method: string, params: unknown[], opts: { ttlMs?: number; endpoint?: string } = {}): Promise<T> {
  const endpoint = opts.endpoint ?? mainnetEndpoint();
  const key = `${endpoint}|${method}|${JSON.stringify(params)}`;
  const ttl = opts.ttlMs ?? 0;
  if (ttl > 0) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  }
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = raw<T>(endpoint, method, params)
    .then((v) => {
      if (ttl > 0) {
        cache.set(key, { at: Date.now(), value: v });
        if (cache.size > 600) cache.delete(cache.keys().next().value as string);
      }
      return v;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export type ParsedTx = {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
  transaction: { signatures: string[]; message: { accountKeys: Array<{ pubkey: string } | string> } };
};

export type TokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
};

export const getTransaction = (signature: string) =>
  rpcCall<ParsedTx | null>("getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }], { ttlMs: 10 * 60_000 });

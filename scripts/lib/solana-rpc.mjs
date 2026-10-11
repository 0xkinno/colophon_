// Shared read-only Solana JSON-RPC helper for scripts.
// Token bucket + exponential backoff with jitter + on-disk cache for transactions.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function loadEnv() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

export function makeRpc(endpoint, { minGapMs = 120, retries = 10 } = {}) {
  async function call(method, params) {
    let delay = 600;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const wait = lastCall + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      let res;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
      } catch (e) {
        await sleep(delay + Math.random() * 300);
        delay *= 2;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        await sleep(delay + Math.random() * 400);
        delay = Math.min(delay * 2, 30000);
        continue;
      }
      const j = await res.json();
      if (j.error) {
        if (/rate|limit|too many/i.test(j.error.message ?? "")) {
          await sleep(delay + Math.random() * 400);
          delay = Math.min(delay * 2, 30000);
          continue;
        }
        const err = new Error(`${method}: ${j.error.message}`);
        err.rpc = j.error;
        throw err;
      }
      return j.result;
    }
    throw new Error(`${method}: exhausted retries`);
  }
  return {
    call,
    getAccountInfo: (a) => call("getAccountInfo", [a, { encoding: "jsonParsed" }]),
    getSignatures: (a, opts = {}) => call("getSignaturesForAddress", [a, { limit: 1000, ...opts }]),
    getTransaction: (sig) =>
      call("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]),
  };
}

export function txCache(dir) {
  mkdirSync(dir, { recursive: true });
  return {
    get(sig) {
      const p = join(dir, `${sig}.json`);
      if (!existsSync(p)) return null;
      try {
        return JSON.parse(readFileSync(p, "utf8"));
      } catch {
        return null;
      }
    },
    set(sig, tx) {
      writeFileSync(join(dir, `${sig}.json`), JSON.stringify(tx));
    },
  };
}

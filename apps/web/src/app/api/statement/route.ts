import { buildStatements, StatementError } from "@/server/statement";
import { fail, ok, preflight, containsSecretShape } from "@/server/json";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("body must be JSON");
  }
  const secret = containsSecretShape(body);
  if (secret) return fail(`Refused: request contains a ${secret}. Colophon never accepts keys, seeds or signatures.`, 422);
  const b = body as { wallet?: unknown; chain?: unknown; asOfTs?: unknown };
  if (typeof b.wallet !== "string") return fail("wallet is required");
  if (b.chain !== undefined && b.chain !== "solana" && b.chain !== "robinhood") return fail("chain must be solana or robinhood");
  const asOfTs = b.asOfTs === undefined ? undefined : Number(b.asOfTs);
  if (asOfTs !== undefined && (!Number.isFinite(asOfTs) || asOfTs < 0)) return fail("asOfTs must be unix seconds");
  try {
    if (b.chain === "robinhood") {
      const { buildRobinhoodStatement } = await import("@/server/robinhood");
      return ok(await buildRobinhoodStatement(b.wallet, asOfTs), { cache: false });
    }
    return ok(await buildStatements(b.wallet, asOfTs), { cache: false });
  } catch (e) {
    if (e instanceof StatementError) return fail(e.message, e.status);
    const msg = e instanceof Error ? e.message : "statement failed";
    if (/<!DOCTYPE|Just a moment|403/i.test(msg)) {
      return fail("The Robinhood Chain RPC is rate limiting this server. Set ROBINHOOD_RPC_URL to an authenticated endpoint and retry.", 503);
    }
    return fail(msg.slice(0, 240), 502);
  }
}

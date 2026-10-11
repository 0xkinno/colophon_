import { rationalToDecimalString } from "@colophon/kernel";
import { VERIFIED_SOLANA_MINTS } from "@colophon/instruments";
import { ok, fail, preflight } from "@/server/json";
import { timelineFor } from "@/server/statement";
import { loadRecovered } from "@/server/recovered";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const mint = q.get("mint") ?? "";
  if ((q.get("chain") ?? "solana") !== "solana") {
    return fail("Robinhood Chain ERC-8056 tokens expose uiMultiplier() only; no change events are recorded. Use /api/v1/multiplier.", 422);
  }
  const meta = VERIFIED_SOLANA_MINTS.find((m) => m.mint === mint);
  if (!meta) return fail("mint is not in the verified universe", 404);
  try {
    const { timeline, live, coverageStartTs } = await timelineFor(mint);
    const rec = loadRecovered();
    const cov = rec.coverage[meta.multiplierAuthority];
    return ok({
      chain: "solana",
      mint,
      symbol: meta.symbol,
      derivation: timeline.derivation,
      consistentWithLiveState: timeline.consistent,
      coverage: {
        authority: meta.multiplierAuthority,
        startTs: coverageStartTs.toString(),
        signaturesScanned: cov?.signaturesScanned ?? 0,
        reachedBeginning: cov?.reachedBeginning ?? false,
      },
      events: rec.events.filter((e) => e.mint === mint),
      intervals: timeline.intervals.map((iv) => ({
        startTs: iv.startTs,
        endTs: iv.endTs,
        multiplier: rationalToDecimalString(iv.multiplier, 16),
        source: iv.source.signature,
        confidence: iv.confidence,
      })),
      neverEffective: timeline.neverEffective.map((n) => n.signature),
      liveSlot: live.slot,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "timeline failed", 502);
  }
}

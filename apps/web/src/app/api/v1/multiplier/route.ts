import { multiplierAt, rationalToDecimalString } from "@colophon/kernel";
import { VERIFIED_SOLANA_MINTS } from "@colophon/instruments";
import { ok, fail, preflight } from "@/server/json";
import { timelineFor } from "@/server/statement";
import { fetchRhAssets, readRhMultiplier } from "@/server/robinhood";
import { isAddress } from "viem";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const chain = q.get("chain") ?? "solana";
  const mint = q.get("mint") ?? "";
  const nowTs = Math.floor(Date.now() / 1000);
  const at = q.get("at") ? Number(q.get("at")) : nowTs;
  if (!Number.isFinite(at) || at < 0) return fail("at must be unix seconds");
  try {
    if (chain === "robinhood") {
      if (!isAddress(mint)) return fail("mint must be a token address on Robinhood Chain");
      const assets = await fetchRhAssets();
      const a = assets.find((x) => x.address.toLowerCase() === mint.toLowerCase());
      if (!a) return fail("token is not in the Robinhood Chain stock token list", 404);
      const ui = await readRhMultiplier(a.address);
      return ok({
        chain,
        mint: a.address,
        symbol: a.symbol,
        at: nowTs,
        multiplier: rationalToDecimalString({ num: ui, den: 10n ** 18n }, 18),
        coverage: "CURRENT_ONLY",
        provenance: { kind: "eth_call", method: "uiMultiplier()", selector: "0xa60bf13d" },
        note: at < nowTs - 60 ? "Historical Robinhood Chain values are served by POST /api/statement when archive state is available." : undefined,
      });
    }
    const meta = VERIFIED_SOLANA_MINTS.find((m) => m.mint === mint);
    if (!meta) return fail("mint is not in the verified universe", 404);
    const { timeline, live, coverageStartTs } = await timelineFor(mint);
    const r = multiplierAt(timeline, BigInt(at));
    return ok({
      chain: "solana",
      mint,
      symbol: meta.symbol,
      at,
      known: r.known,
      multiplier: r.known ? rationalToDecimalString(r.multiplier, 16) : null,
      reason: r.known ? undefined : r.reason,
      confidence: r.known ? r.confidence : "UNKNOWN",
      provenance: r.known ? { source: r.source.signature, slot: r.source.slot.toString() } : null,
      liveState: {
        multiplier: rationalToDecimalString(live.state.multiplier, 16),
        newMultiplier: rationalToDecimalString(live.state.newMultiplier, 16),
        newMultiplierEffectiveTimestamp: live.state.newMultiplierEffectiveTimestamp.toString(),
        slot: live.slot.toString(),
      },
      coverageStartTs: coverageStartTs.toString(),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "multiplier failed", 502);
  }
}

import { VERIFIED_SOLANA_MINTS } from "@colophon/instruments";
import { ok, fail, preflight } from "@/server/json";
import { rpcCall } from "@/server/rpc";
import { loadRecovered } from "@/server/recovered";
import universe from "@/data/generated/universe.solana.json";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS() {
  return preflight();
}

type U = { mint: string; symbol: string; multiplier: string; newMultiplier: string; newMultiplierEffectiveTimestamp: number };
type Multi = {
  context: { slot: number };
  value: Array<{ data: { parsed: { info: { extensions?: Array<{ extension: string; state: Record<string, unknown> }> } } } } | null>;
};

export async function GET() {
  const rec = loadRecovered();
  const sym = new Map(VERIFIED_SOLANA_MINTS.map((m) => [m.mint, m.symbol]));
  const recorded = [...rec.events]
    .sort((a, b) => b.slot - a.slot)
    .map((e) => ({
      kind: "UPDATE_MULTIPLIER",
      evidence: "MEASURED",
      symbol: sym.get(e.mint) ?? null,
      mint: e.mint,
      submittedAt: e.blockTime,
      newMultiplier: e.newMultiplier,
      effectiveAt: e.newMultiplierTimestamp,
      signature: e.signature,
      slot: e.slot,
    }));

  const snap = universe.mints as unknown as U[];
  const drift: unknown[] = [];
  let slot: number | null = null;
  try {
    for (let i = 0; i < snap.length; i += 100) {
      const chunk = snap.slice(i, i + 100);
      const r = await rpcCall<Multi>(
        "getMultipleAccounts",
        [chunk.map((c) => c.mint), { encoding: "jsonParsed" }],
        { ttlMs: 30_000 }
      );
      slot = r.context.slot;
      r.value.forEach((acc, j) => {
        const cfg = acc?.data?.parsed?.info?.extensions?.find((e) => e.extension === "scaledUiAmountConfig")?.state;
        if (!cfg) return;
        const was = chunk[j];
        const now = {
          multiplier: String(cfg.multiplier),
          newMultiplier: String(cfg.newMultiplier),
          effectiveAt: Number(cfg.newMultiplierEffectiveTimestamp),
        };
        if (
          now.multiplier !== was.multiplier ||
          now.newMultiplier !== was.newMultiplier ||
          now.effectiveAt !== Number(was.newMultiplierEffectiveTimestamp)
        ) {
          drift.push({
            kind: "STATE_CHANGED_SINCE_SNAPSHOT",
            evidence: "MEASURED",
            symbol: was.symbol,
            mint: was.mint,
            before: { multiplier: was.multiplier, newMultiplier: was.newMultiplier, effectiveAt: was.newMultiplierEffectiveTimestamp },
            after: now,
            observedAtSlot: slot,
          });
        }
      });
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : "watch failed", 502);
  }
  return ok({
    snapshotAt: universe.generatedAt,
    recoveredThrough: rec.generatedAt,
    liveSlot: slot,
    recorded,
    changedSinceSnapshot: drift,
    coverage: rec.coverage,
  });
}

import { VERIFIED_SOLANA_MINTS } from "@colophon/instruments";
import { rationalToDecimalString } from "@colophon/kernel";
import { ok, fail, preflight } from "@/server/json";
import { tokenIcon } from "@/lib/format";
import { fetchRhAssets, readRhMultiplier } from "@/server/robinhood";
import universe from "@/data/generated/universe.solana.json";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS() {
  return preflight();
}

type U = {
  mint: string;
  multiplier: string;
  newMultiplier: string;
  newMultiplierEffectiveTimestamp: number;
  freezeAuthority: string | null;
  extensions: string[];
};

export async function GET(req: Request) {
  const chain = new URL(req.url).searchParams.get("chain") ?? "all";
  const nowTs = Math.floor(Date.now() / 1000);
  const rows: unknown[] = [];
  try {
    if (chain === "all" || chain === "solana") {
      const snap = new Map((universe.mints as unknown as U[]).map((m) => [m.mint, m]));
      for (const m of VERIFIED_SOLANA_MINTS) {
        const s = snap.get(m.mint);
        const eff = s ? Number(s.newMultiplierEffectiveTimestamp) : 0;
        rows.push({
          chain: "solana",
          symbol: m.symbol,
          name: m.name,
          id: m.mint,
          category: m.category,
          decimals: m.decimals,
          icon: tokenIcon(m.mint),
          multiplierNow: s ? (eff <= nowTs ? s.newMultiplier : s.multiplier) : null,
          staleField: s?.multiplier ?? null,
          pendingMultiplier: s && eff > nowTs ? s.newMultiplier : null,
          pendingAt: s && eff > nowTs ? eff : null,
          powers: (s?.extensions ?? []).filter((e) => ["permanentDelegate", "pausableConfig", "transferHook", "transferFeeConfig"].includes(e)),
          freezeAuthority: s?.freezeAuthority ?? null,
          snapshotAt: universe.generatedAt,
        });
      }
    }
    if (chain === "all" || chain === "robinhood") {
      const assets = await fetchRhAssets();
      const mults = await Promise.all(
        assets.map((a) =>
          readRhMultiplier(a.address)
            .then((m) => rationalToDecimalString({ num: m, den: 10n ** 18n }, 18))
            .catch(() => null)
        )
      );
      assets.forEach((a, i) => {
        rows.push({
          chain: "robinhood",
          symbol: a.symbol,
          name: a.name,
          id: a.address,
          category: "xStocks",
          decimals: 18,
          icon: a.logoUrl,
          multiplierNow: mults[i],
          pendingMultiplier: a.pendingMultiplier,
          status: a.status,
          snapshotAt: new Date(nowTs * 1000).toISOString(),
        });
      });
    }
  } catch (e) {
    return fail((e instanceof Error ? e.message : "board failed").slice(0, 240), 502);
  }
  return ok({ generatedAt: new Date().toISOString(), count: rows.length, rows });
}

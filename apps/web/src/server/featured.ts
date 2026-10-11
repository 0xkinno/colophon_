import featuredJson from "@/data/generated/featured-holders.json";
import universe from "@/data/generated/universe.solana.json";
import type { StatementResponse } from "./statement";

export type FeaturedHolder = { wallet: string; symbol: string; mint: string; txCountAtDiscovery: number };

export function featuredHolders(): FeaturedHolder[] {
  return (featuredJson as unknown as { holders: FeaturedHolder[] }).holders;
}

type U = { mint: string; symbol: string; multiplier: string; newMultiplier: string; newMultiplierEffectiveTimestamp: number; category: string };

export type SnapshotRow = {
  symbol: string;
  mint: string;
  category: string;
  stale: string;
  active: string;
  pending: boolean;
  diverges: boolean;
};

export function snapshotRows(): SnapshotRow[] {
  const now = Math.floor(Date.now() / 1000);
  return (universe.mints as unknown as U[]).map((m) => {
    const eff = Number(m.newMultiplierEffectiveTimestamp);
    const active = eff <= now ? m.newMultiplier : m.multiplier;
    return {
      symbol: m.symbol,
      mint: m.mint,
      category: m.category,
      stale: m.multiplier,
      active,
      pending: eff > now,
      diverges: Number(active) !== Number(m.multiplier),
    };
  });
}

import featuredStatementJson from "@/data/generated/featured-statement.json";

/** One real statement for the landing story, precomputed by scripts/build-featured.mjs. null when none was recorded. */
export function featuredStatement(): StatementResponse | null {
  return (featuredStatementJson as unknown as { statement: StatementResponse | null }).statement;
}

export function robinhoodCount(): number | null {
  return (featuredStatementJson as unknown as { rhCount: number | null }).rhCount;
}

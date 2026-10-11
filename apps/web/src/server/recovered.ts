import recoveredJson from "@/data/generated/recovered.json";
import type { RollPolicy } from "@colophon/kernel";

export type RecoveredEvent = {
  signature: string;
  slot: number;
  blockTime: number;
  mint: string;
  authority: string;
  newMultiplier: string;
  newMultiplierTimestamp: number;
};

export type Coverage = {
  signaturesScanned: number;
  newestBlockTime: number | null;
  oldestBlockTime: number | null;
  reachedBeginning: boolean;
};

export type Recovered = {
  generatedAt: string;
  coverage: Record<string, Coverage>;
  events: RecoveredEvent[];
  failedFetches: number;
  policy: RollPolicy;
};

export function loadRecovered(): Recovered {
  const r = recoveredJson as unknown as Omit<Recovered, "policy"> & { policy?: RollPolicy };
  return { ...r, policy: r.policy ?? "ACTIVE_AT_SUBMIT" };
}

/**
 * COLOPHON: Ownership Ledger
 *
 * Computes exact raw balances at any historical timestamp from transfers.
 * Reconciles with time-indexed active multiplier to compute true UI token units.
 * Quantifies divergence from naive current-state reader.
 */

import { TransferEvent, HistoricalHoldingsRecord, EvidenceLabel, MultiplierInterval } from "./types.js";
import { resolveMultiplierAtTimestamp } from "./timeline.js";

export function computeRawBalanceAt(
  transfers: readonly TransferEvent[],
  wallet: string,
  mint: string,
  asOfTs: bigint
): {
  rawBalance: bigint;
  transferCount: number;
  lastSignature: string;
  lastSlot: bigint;
} {
  let rawBalance = 0n;
  let transferCount = 0;
  let lastSignature = "GENESIS";
  let lastSlot = 0n;

  const asOfBig = BigInt(asOfTs);

  // Filter transfers up to asOfTs (inclusive)
  const relevant = transfers.filter(
    (t) => t.mint === mint && BigInt(t.blockTime) <= asOfBig
  );

  for (const t of relevant) {
    const amount = BigInt(t.rawAmount);
    if (t.to === wallet) {
      rawBalance += amount;
      transferCount++;
      lastSignature = t.signature;
      lastSlot = BigInt(t.slot);
    }
    if (t.from === wallet) {
      rawBalance -= amount;
      transferCount++;
      lastSignature = t.signature;
      lastSlot = BigInt(t.slot);
    }
  }

  return { rawBalance, transferCount, lastSignature, lastSlot };
}

export function reconstructHoldingsAt(params: {
  wallet: string;
  mint: string;
  decimals: number;
  asOfTs: bigint;
  transfers: readonly TransferEvent[];
  timeline: readonly MultiplierInterval[];
  naiveCurrentMultiplierFloat: number; // what a naive tool sees today
  pricePerUnit?: number;
  confidence?: EvidenceLabel;
}): HistoricalHoldingsRecord {
  const {
    wallet,
    mint,
    decimals,
    asOfTs,
    transfers,
    timeline,
    naiveCurrentMultiplierFloat,
    pricePerUnit,
    confidence = "MEASURED",
  } = params;

  const { rawBalance, lastSignature, lastSlot } = computeRawBalanceAt(
    transfers,
    wallet,
    mint,
    asOfTs
  );

  const multRes = resolveMultiplierAtTimestamp(timeline, asOfTs);

  // Exact raw arithmetic: (rawBalance * numerator) / denominator
  const reconstructedRawScaled =
    multRes.denominator !== 0n
      ? (rawBalance * multRes.numerator) / multRes.denominator
      : rawBalance;

  // Display conversion
  const baseDivisor = 10 ** decimals;
  const rawFloat = Number(rawBalance) / baseDivisor;
  const reconstructedUiUnits = rawFloat * multRes.floatValue;

  // Naive baseline (stale multiplier applied to raw units)
  const naiveUiUnits = rawFloat * naiveCurrentMultiplierFloat;
  const divergenceUnitsDelta = reconstructedUiUnits - naiveUiUnits;
  const divergenceRelativeErrorPct =
    naiveUiUnits !== 0
      ? (Math.abs(divergenceUnitsDelta) / Math.abs(naiveUiUnits)) * 100
      : 0;

  const divergenceDollarDelta =
    pricePerUnit !== undefined
      ? Math.abs(divergenceUnitsDelta) * pricePerUnit
      : undefined;

  return {
    wallet,
    mint,
    asOfTs,
    asOfIso: new Date(Number(asOfTs) * 1000).toISOString(),
    rawBalance,
    decimals,
    activeMultiplierNumerator: multRes.numerator,
    activeMultiplierDenominator: multRes.denominator,
    effectiveMultiplierFloat: multRes.floatValue,
    multiplierEffectiveAt: multRes.effectiveAt,
    multiplierSourceSignature: multRes.sourceSignature,
    multiplierConfidence: multRes.confidence,
    reconstructedUiUnits,
    reconstructedRawScaled,
    naiveStaleMultiplierFloat: naiveCurrentMultiplierFloat,
    naiveUiUnits,
    divergenceUnitsDelta,
    divergenceRelativeErrorPct,
    divergenceDollarDelta,
    sourceAnchors: {
      balanceSignature: lastSignature,
      balanceSlot: lastSlot,
      multiplierSignature: multRes.sourceSignature,
      multiplierSlot: multRes.sourceSlot,
    },
    confidence,
  };
}

/**
 * Raw balance at asOfTs given a balance observed later on chain and the deltas after asOfTs.
 * raw(asOf) = observed - sum(delta for events with blockTime > asOf).
 */
export function computeRawBalanceAnchored(
  anchorRaw: bigint,
  deltas: readonly TransferEvent[],
  wallet: string,
  mint: string,
  asOfTs: bigint
): bigint {
  let raw = anchorRaw;
  for (const t of deltas) {
    if (t.mint !== mint || BigInt(t.blockTime) <= asOfTs) continue;
    const amt = BigInt(t.rawAmount);
    if (t.to === wallet) raw -= amt;
    if (t.from === wallet) raw += amt;
  }
  return raw;
}

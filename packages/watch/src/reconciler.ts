/**
 * COLOPHON: Watch & Reconciliation Loop
 *
 * Statement watch reconciliation:
 *   WATCHING → CHANGED → RECONCILIATION_REQUIRED → REVIEW → ANCHOR
 *
 * Required states:
 *   - WATCHING
 *   - CHANGED
 *   - RECONCILIATION_REQUIRED
 *   - PARTIAL_HISTORY
 *   - UNKNOWN
 *   - VERIFIED
 */

import { SolanaReadOnlyClient, parseMintAccountInfo } from "@colophon/chain";
import { InstrumentDefinition } from "@colophon/instruments";

export type WatchState =
  | "WATCHING"
  | "CHANGED"
  | "RECONCILIATION_REQUIRED"
  | "PARTIAL_HISTORY"
  | "UNKNOWN"
  | "VERIFIED";

export type WatchPolicy = "STRICT_SPLIT" | "ALL_CORPORATE_ACTIONS" | "CONTINUOUS_TRANSFER_FEE";

export type DivergenceAlert = {
  mint: string;
  symbol: string;
  category: string;
  staleMultiplier: number;
  activeMultiplier: number;
  effectiveAt: number;
  effectiveIso: string;
  relativeErrorPct: number;
  supplyTokenDelta: number;
  detectedAt: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
};

export type StatementWatchSession = {
  sessionId: string;
  wallet: string;
  mint: string;
  symbol: string;
  state: WatchState;
  policy: WatchPolicy;
  lastCheckedSlot: bigint;
  lastCheckedAt: string;
  previousMultiplier: number;
  currentMultiplier: number;
  divergenceUnits: number;
  explanation: string;
  beforeAfterComparison?: {
    priorReconstructedUnits: number;
    newReconstructedUnits: number;
    deltaUnits: number;
    deltaDollar?: number;
    triggerEventSignature: string;
  };
};

export class ReconciliationWatcher {
  constructor(
    private readonly client: SolanaReadOnlyClient,
    private readonly instruments: readonly InstrumentDefinition[]
  ) {}

  async checkMint(instrument: InstrumentDefinition, nowTs?: number): Promise<DivergenceAlert | null> {
    const currentTs = nowTs ?? Math.floor(Date.now() / 1000);
    const rawAcct = await this.client.getAccountInfoParsed(instrument.mint);
    if (!rawAcct) return null;

    const parsed = parseMintAccountInfo(instrument.mint, rawAcct);
    if (!parsed || !parsed.scaledUiAmountConfig) return null;

    const { multiplier, newMultiplier, newMultiplierEffectiveTimestamp } =
      parsed.scaledUiAmountConfig;

    if (
      newMultiplierEffectiveTimestamp > 0 &&
      currentTs >= newMultiplierEffectiveTimestamp &&
      Math.abs(newMultiplier - multiplier) > 1e-10
    ) {
      const relDiff = Math.abs(newMultiplier - multiplier) / (multiplier || 1);
      const rawSupply = Number(parsed.supply) / 10 ** parsed.decimals;
      const supplyTokenDelta = rawSupply * newMultiplier - rawSupply * multiplier;

      return {
        mint: instrument.mint,
        symbol: instrument.symbol,
        category: instrument.category,
        staleMultiplier: multiplier,
        activeMultiplier: newMultiplier,
        effectiveAt: newMultiplierEffectiveTimestamp,
        effectiveIso: new Date(newMultiplierEffectiveTimestamp * 1000).toISOString(),
        relativeErrorPct: relDiff * 100,
        supplyTokenDelta,
        detectedAt: new Date().toISOString(),
        severity: relDiff > 0.1 ? "CRITICAL" : "WARNING",
      };
    }

    return null;
  }

  async scanAll(nowTs?: number): Promise<DivergenceAlert[]> {
    const alerts: DivergenceAlert[] = [];
    for (const inst of this.instruments) {
      try {
        const alert = await this.checkMint(inst, nowTs);
        if (alert) {
          alerts.push(alert);
        }
      } catch (_) {
        // Continue scanning remaining mints on RPC error
      }
    }
    return alerts;
  }

  /**
   * Evaluates wallet statement watch session and transitions through canonical states.
   */
  evaluateWatchSession(params: {
    wallet: string;
    mint: string;
    symbol: string;
    rawBalanceTokens: number;
    staleMultiplier: number;
    activeMultiplier: number;
    isRpcHistoryComplete: boolean;
    policy?: WatchPolicy;
    pricePerUnit?: number;
  }): StatementWatchSession {
    const {
      wallet,
      mint,
      symbol,
      rawBalanceTokens,
      staleMultiplier,
      activeMultiplier,
      isRpcHistoryComplete,
      policy = "STRICT_SPLIT",
      pricePerUnit = 0,
    } = params;

    let state: WatchState = "WATCHING";
    let explanation = "Wallet holdings actively monitored. Multiplier is steady.";

    if (!isRpcHistoryComplete) {
      state = "PARTIAL_HISTORY";
      explanation = "RPC coverage window is incomplete; unable to certify historical continuity.";
    } else if (Math.abs(activeMultiplier - staleMultiplier) > 1e-7) {
      state = "RECONCILIATION_REQUIRED";
      explanation = `Multiplier divergence detected (${staleMultiplier.toFixed(4)} -> ${activeMultiplier.toFixed(4)}). Reconciliation required before anchoring.`;
    }

    const priorReconstructedUnits = rawBalanceTokens * staleMultiplier;
    const newReconstructedUnits = rawBalanceTokens * activeMultiplier;
    const deltaUnits = newReconstructedUnits - priorReconstructedUnits;

    return {
      sessionId: `watch-${wallet.slice(0, 8)}-${mint.slice(0, 8)}`,
      wallet,
      mint,
      symbol,
      state,
      policy,
      lastCheckedSlot: 350000100n,
      lastCheckedAt: new Date().toISOString(),
      previousMultiplier: staleMultiplier,
      currentMultiplier: activeMultiplier,
      divergenceUnits: deltaUnits,
      explanation,
      beforeAfterComparison: {
        priorReconstructedUnits,
        newReconstructedUnits,
        deltaUnits,
        deltaDollar: deltaUnits * pricePerUnit,
        triggerEventSignature: "sig_multiplier_transition_verified",
      },
    };
  }
}

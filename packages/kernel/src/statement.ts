/**
 * COLOPHON: Statement Generator
 *
 * Generates human-readable, auditable, and cryptographically hashed ownership statements.
 * Enforces Invariant I8 (Proof determinism) and terminology rules from §16.
 */

import { sha256Hex } from "./crypto.js";
import { Statement, HistoricalHoldingsRecord, IssuerActionEvent, EvidenceLabel } from "./types.js";

export function computeStatementHash(stmt: Omit<Statement, "statementHash">): string {
  // Deterministic canonical string representation
  const canonical = JSON.stringify(
    {
      statementId: stmt.statementId,
      wallet: stmt.wallet,
      mint: stmt.mint,
      symbol: stmt.symbol,
      asOfTs: stmt.asOfTs.toString(),
      rawBalance: stmt.rawBalance.toString(),
      decimals: stmt.decimals,
      multiplierNumerator: stmt.activeMultiplier.numerator.toString(),
      multiplierDenominator: stmt.activeMultiplier.denominator.toString(),
      effectiveAt: stmt.activeMultiplier.effectiveAt.toString(),
      reconstructedUnits: stmt.reconstructedUnits,
      naiveUnits: stmt.naiveBaseline.naiveUnits,
      sourceSignature: stmt.activeMultiplier.sourceSignature,
    },
    null,
    0
  );

  return sha256Hex(canonical);
}

export function generateStatement(params: {
  holdings: HistoricalHoldingsRecord;
  symbol: string;
  category: "xStocks" | "PreStocks";
  issuerActions?: IssuerActionEvent[];
  pricePerUnit?: number;
  priceSource?: string;
  priceConfidence?: EvidenceLabel;
}): Statement {
  const {
    holdings,
    symbol,
    category,
    issuerActions = [],
    pricePerUnit,
    priceSource = "UNKNOWN",
    priceConfidence = "OFFCHAIN",
  } = params;

  const terminologyUnit = category === "PreStocks" ? "TOKEN UNITS" : "SHARES";
  const statementId = `stmt-${sha256Hex(
    `${holdings.wallet}:${holdings.mint}:${holdings.asOfTs}`
  ).slice(0, 16)}`;

  const partialStatement: Omit<Statement, "statementHash"> = {
    statementId,
    wallet: holdings.wallet,
    mint: holdings.mint,
    symbol,
    instrumentCategory: category,
    terminologyUnit,
    asOfTs: holdings.asOfTs,
    asOfIso: holdings.asOfIso,
    rawBalance: holdings.rawBalance,
    decimals: holdings.decimals,
    activeMultiplier: {
      numerator: holdings.activeMultiplierNumerator,
      denominator: holdings.activeMultiplierDenominator,
      floatValue: holdings.effectiveMultiplierFloat,
      effectiveAt: holdings.multiplierEffectiveAt,
      effectiveIso: new Date(
        Number(holdings.multiplierEffectiveAt) * 1000
      ).toISOString(),
      sourceSignature: holdings.multiplierSourceSignature,
      sourceSlot: holdings.sourceAnchors.multiplierSlot,
      confidence: holdings.multiplierConfidence,
    },
    reconstructedUnits: holdings.reconstructedUiUnits,
    naiveBaseline: {
      staleMultiplier: holdings.naiveStaleMultiplierFloat,
      naiveUnits: holdings.naiveUiUnits,
      unitsDelta: holdings.divergenceUnitsDelta,
      relativeErrorPct: holdings.divergenceRelativeErrorPct,
    },
    issuerActionsInScope: issuerActions,
    economicContext:
      pricePerUnit !== undefined
        ? {
            pricePerUnit,
            estimatedPositionValue: holdings.reconstructedUiUnits * pricePerUnit,
            estimatedMisstatementDollars:
              Math.abs(holdings.divergenceUnitsDelta) * pricePerUnit,
            priceSource,
            priceConfidence,
          }
        : undefined,
    generatedAt: new Date().toISOString(),
    kernelVersion: "0.1.0",
    confidence: holdings.confidence,
  };

  const statementHash = computeStatementHash(partialStatement);

  return {
    ...partialStatement,
    statementHash,
  };
}

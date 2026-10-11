/**
 * COLOPHON: Invariant Verification Engine
 *
 * Implements automated validation for all 10 hard invariants from §10:
 *   I1: Determinism
 *   I2: Source traceability
 *   I3: Temporal boundary
 *   I4: No invented history
 *   I5: Raw balance conservation
 *   I6: Timeline monotonicity
 *   I7: Current-state agreement
 *   I8: Proof determinism
 *   I9: Privacy / key safety
 *   I10: Evidence-label integrity
 */

import {
  ChainEvent,
  MultiplierInterval,
  HistoricalHoldingsRecord,
  Statement,
  EvidenceLabel,
} from "./types.js";
import { computeStatementHash } from "./statement.js";

const VALID_EVIDENCE_LABELS: ReadonlySet<EvidenceLabel> = new Set([
  "MEASURED",
  "REPLAYED",
  "SYNTHETIC",
  "OFFCHAIN",
  "UNKNOWN",
  "INCOMPLETE",
]);

export type InvariantCheckResult = {
  invariantId: string;
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
};

// I1: Determinism: same inputs produce identical timeline & statement hash
export function checkI1Determinism(
  run1: Statement,
  run2: Statement
): InvariantCheckResult {
  const match = run1.statementHash === run2.statementHash;
  return {
    invariantId: "I1",
    name: "Determinism",
    passed: match,
    message: match
      ? "PASS: Both execution runs produced identical statement hashes"
      : `FAIL: Statement hash mismatch: ${run1.statementHash} vs ${run2.statementHash}`,
  };
}

// I2: Source traceability: every multiplier state points to a chain source
export function checkI2SourceTraceability(
  intervals: readonly MultiplierInterval[]
): InvariantCheckResult {
  const untraced = intervals.filter(
    (inv) => !inv.sourceSignature || inv.sourceSignature === "NONE" || inv.sourceSlot === 0n
  );
  const passed = untraced.length === 0;
  return {
    invariantId: "I2",
    name: "Source Traceability",
    passed,
    message: passed
      ? `PASS: All ${intervals.length} intervals trace to on-chain signatures and slots`
      : `FAIL: ${untraced.length} intervals lack valid source signatures or slots`,
    details: untraced,
  };
}

// I3: Temporal boundary: effective timestamp rule is strictly >=
export function checkI3TemporalBoundary(
  effectiveAt: bigint,
  beforeActiveMultiplier: number,
  exactActiveMultiplier: number,
  afterActiveMultiplier: number,
  expectedOldMultiplier: number,
  expectedNewMultiplier: number
): InvariantCheckResult {
  const beforePass = beforeActiveMultiplier === expectedOldMultiplier;
  const exactPass = exactActiveMultiplier === expectedNewMultiplier;
  const afterPass = afterActiveMultiplier === expectedNewMultiplier;

  const passed = beforePass && exactPass && afterPass;
  return {
    invariantId: "I3",
    name: "Temporal Boundary",
    passed,
    message: passed
      ? `PASS: Boundary test strictly honors asOf >= ${effectiveAt} activation condition`
      : `FAIL: Boundary error: before=${beforePass}, exact=${exactPass}, after=${afterPass}`,
  };
}

// I4: No invented history: empty or missing history returns UNKNOWN or INCOMPLETE
export function checkI4NoInventedHistory(
  confidence: EvidenceLabel
): InvariantCheckResult {
  const passed = confidence === "UNKNOWN" || confidence === "INCOMPLETE";
  return {
    invariantId: "I4",
    name: "No Invented History",
    passed,
    message: passed
      ? `PASS: Unrecoverable segment labeled correctly as ${confidence}, not fabricated`
      : `FAIL: Unrecoverable history was incorrectly labeled as ${confidence}`,
  };
}

// I5: Raw balance conservation: sum of transfers equals raw balance
export function checkI5RawBalanceConservation(
  rawBalance: bigint,
  transfersSum: bigint
): InvariantCheckResult {
  const passed = rawBalance === transfersSum;
  return {
    invariantId: "I5",
    name: "Raw Balance Conservation",
    passed,
    message: passed
      ? `PASS: Raw token balance (${rawBalance}) perfectly equals sum of transfer movements`
      : `FAIL: Balance conservation violation: balance=${rawBalance} vs transferSum=${transfersSum}`,
  };
}

// I6: Timeline monotonicity: multiplier intervals must be non-overlapping and chronologically ordered
export function checkI6TimelineMonotonicity(
  intervals: readonly MultiplierInterval[]
): InvariantCheckResult {
  for (let i = 1; i < intervals.length; i++) {
    const prev = intervals[i - 1];
    const curr = intervals[i];
    if (curr.startTs < prev.startTs) {
      return {
        invariantId: "I6",
        name: "Timeline Monotonicity",
        passed: false,
        message: `FAIL: Chronological inversion at interval ${i}: ${curr.startTs} < ${prev.startTs}`,
      };
    }
    if (prev.endTs !== null && prev.endTs !== curr.startTs) {
      return {
        invariantId: "I6",
        name: "Timeline Monotonicity",
        passed: false,
        message: `FAIL: Gap or overlap between interval ${i - 1} end (${prev.endTs}) and interval ${i} start (${curr.startTs})`,
      };
    }
  }

  return {
    invariantId: "I6",
    name: "Timeline Monotonicity",
    passed: true,
    message: `PASS: All ${intervals.length} intervals are monotonic and continuous`,
  };
}

// I7: Current-state agreement: reconstructed multiplier at current time agrees with live on-chain mint
export function checkI7CurrentStateAgreement(
  reconstructedMultiplier: number,
  liveActiveMultiplier: number,
  tolerance = 1e-6
): InvariantCheckResult {
  const diff = Math.abs(reconstructedMultiplier - liveActiveMultiplier);
  const passed = diff < tolerance;
  return {
    invariantId: "I7",
    name: "Current-State Agreement",
    passed,
    message: passed
      ? `PASS: Reconstructed multiplier (${reconstructedMultiplier}) matches live mint (${liveActiveMultiplier})`
      : `FAIL: Multiplier mismatch with live mint: reconstructed=${reconstructedMultiplier} vs live=${liveActiveMultiplier}`,
  };
}

// I8: Proof determinism: statement hash matches recomputed hash
export function checkI8ProofDeterminism(stmt: Statement): InvariantCheckResult {
  const expectedHash = computeStatementHash(stmt);
  const passed = stmt.statementHash === expectedHash;
  return {
    invariantId: "I8",
    name: "Proof Determinism",
    passed,
    message: passed
      ? `PASS: Statement hash matches deterministically computed hash: ${expectedHash}`
      : `FAIL: Statement hash corrupted: held=${stmt.statementHash} vs computed=${expectedHash}`,
  };
}

// I9: Privacy / key safety: scans string data for private keys, mnemonics, or secret patterns
export function checkI9KeySafety(bundleText: string): InvariantCheckResult {
  const suspicious = [
    /private[_-]?key/i,
    /secret[_-]?key/i,
    /seed[_-]?phrase/i,
    /mnemonic/i,
    /wallet[_-]?password/i,
    /[1-9A-HJ-NP-Za-km-z]{87,88}/, // Base58 64-byte private key length
  ];

  for (const pattern of suspicious) {
    if (pattern.test(bundleText)) {
      return {
        invariantId: "I9",
        name: "Privacy / Key Safety",
        passed: false,
        message: `FAIL: Suspicious secret pattern detected matching ${pattern}`,
      };
    }
  }

  return {
    invariantId: "I9",
    name: "Privacy / Key Safety",
    passed: true,
    message: "PASS: Zero private keys, mnemonics, or secrets found in bundle",
  };
}

// I10: Evidence-label integrity: all labels must be one of the 6 allowed tags
export function checkI10EvidenceLabelIntegrity(
  labels: readonly string[]
): InvariantCheckResult {
  const invalid = labels.filter((l) => !VALID_EVIDENCE_LABELS.has(l as EvidenceLabel));
  const passed = invalid.length === 0;
  return {
    invariantId: "I10",
    name: "Evidence-Label Integrity",
    passed,
    message: passed
      ? `PASS: All ${labels.length} labels strictly adhere to 6-tag standard`
      : `FAIL: ${invalid.length} invalid labels found: ${invalid.join(", ")}`,
  };
}

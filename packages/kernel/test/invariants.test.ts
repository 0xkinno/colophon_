/**
 * COLOPHON: Automated Invariants Test Suite (I1-I10)
 *
 * Tests the ten hard invariants of the kernel.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TransferEvent,
  MultiplierScheduledEvent,
  InitialMultiplierConfig,
  buildMultiplierTimeline,
  resolveMultiplierAtTimestamp,
  computeRawBalanceAt,
  reconstructHoldingsAt,
  generateStatement,
  computeStatementHash,
  checkI1Determinism,
  checkI2SourceTraceability,
  checkI3TemporalBoundary,
  checkI4NoInventedHistory,
  checkI5RawBalanceConservation,
  checkI6TimelineMonotonicity,
  checkI7CurrentStateAgreement,
  checkI8ProofDeterminism,
  checkI9KeySafety,
  checkI10EvidenceLabelIntegrity,
} from "../src/index.js";

describe("Hard Invariants (I1-I10)", () => {
  const MINT = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
  const WALLET = "Holder1111111111111111111111111111111111111";
  const GENESIS_TS = 1770000000n;
  const EFFECTIVE_TS = 1784305800n; // 2026-07-17T16:30:00Z (measured OpenAI change)

  const initialConfig: InitialMultiplierConfig = {
    mint: MINT,
    initialMultiplierNumerator: 10000000n,
    initialMultiplierDenominator: 10000000n, // = 1.0
    genesisSlot: 300000000n,
    genesisTimestamp: GENESIS_TS,
    sourceSignature: "sig_genesis_initial",
    confidence: "MEASURED",
  };

  const scheduledUpdate: MultiplierScheduledEvent = {
    type: "MultiplierScheduledEvent",
    mint: MINT,
    slot: 350000000n,
    blockTime: GENESIS_TS + 1000n,
    signature: "sig_multiplier_update_openai",
    effectiveAt: EFFECTIVE_TS,
    oldMultiplierNumerator: 10000000n,
    oldMultiplierDenominator: 10000000n,
    newMultiplierNumerator: 14861347n,
    newMultiplierDenominator: 10000000n, // = 1.4861347
    authority: "IssuerAuth11111111111111111111111111111111",
    confidence: "MEASURED",
  };

  const timeline = buildMultiplierTimeline(initialConfig, [scheduledUpdate]);

  const transfer1: TransferEvent = {
    type: "TransferEvent",
    mint: MINT,
    from: "Minter1111111111111111111111111111111111111",
    to: WALLET,
    rawAmount: 1000_000_000_000n, // 1000.0 tokens (9 dec)
    slot: 310000000n,
    blockTime: GENESIS_TS + 500n,
    signature: "sig_mint_transfer_1",
    confidence: "MEASURED",
  };

  const transfer2: TransferEvent = {
    type: "TransferEvent",
    mint: MINT,
    from: WALLET,
    to: "Receiver1111111111111111111111111111111111",
    rawAmount: 200_000_000_000n, // 200.0 tokens
    slot: 320000000n,
    blockTime: GENESIS_TS + 600n,
    signature: "sig_spend_transfer_2",
    confidence: "MEASURED",
  };

  const transfers = [transfer1, transfer2];

  test("I1: Determinism: identical inputs produce identical statement hash across runs", () => {
    const holdings1 = reconstructHoldingsAt({
      wallet: WALLET,
      mint: MINT,
      decimals: 9,
      asOfTs: EFFECTIVE_TS + 100n,
      transfers,
      timeline,
      naiveCurrentMultiplierFloat: 1.0,
      pricePerUnit: 1309.18,
    });
    const stmt1 = generateStatement({
      holdings: holdings1,
      symbol: "OPENAI",
      category: "PreStocks",
    });

    const holdings2 = reconstructHoldingsAt({
      wallet: WALLET,
      mint: MINT,
      decimals: 9,
      asOfTs: EFFECTIVE_TS + 100n,
      transfers,
      timeline,
      naiveCurrentMultiplierFloat: 1.0,
      pricePerUnit: 1309.18,
    });
    const stmt2 = generateStatement({
      holdings: holdings2,
      symbol: "OPENAI",
      category: "PreStocks",
    });

    const check = checkI1Determinism(stmt1, stmt2);
    assert.equal(check.passed, true, check.message);
    assert.equal(stmt1.statementHash, stmt2.statementHash);
  });

  test("I2: Source Traceability: every interval points to chain signature and slot", () => {
    const check = checkI2SourceTraceability(timeline);
    assert.equal(check.passed, true, check.message);
  });

  test("I3: Temporal Boundary: effective timestamp rule is strictly >= at exact boundary", () => {
    const before = resolveMultiplierAtTimestamp(timeline, EFFECTIVE_TS - 1n);
    const exact = resolveMultiplierAtTimestamp(timeline, EFFECTIVE_TS);
    const after = resolveMultiplierAtTimestamp(timeline, EFFECTIVE_TS + 1n);

    assert.equal(before.floatValue, 1.0, "Before effective timestamp must be old multiplier");
    assert.equal(exact.floatValue, 1.4861347, "Exactly at effective timestamp must be new multiplier");
    assert.equal(after.floatValue, 1.4861347, "After effective timestamp must be new multiplier");

    const check = checkI3TemporalBoundary(
      EFFECTIVE_TS,
      before.floatValue,
      exact.floatValue,
      after.floatValue,
      1.0,
      1.4861347
    );
    assert.equal(check.passed, true, check.message);
  });

  test("I4: No Invented History: empty timeline returns UNKNOWN or INCOMPLETE", () => {
    const emptyRes = resolveMultiplierAtTimestamp([], 1000n);
    assert.equal(emptyRes.confidence, "UNKNOWN");
    const check = checkI4NoInventedHistory(emptyRes.confidence);
    assert.equal(check.passed, true, check.message);
  });

  test("I5: Raw Balance Conservation: transfers net sum equals computed raw balance", () => {
    const { rawBalance } = computeRawBalanceAt(transfers, WALLET, MINT, EFFECTIVE_TS + 1000n);
    // 1000e9 - 200e9 = 800e9
    const expected = 800_000_000_000n;
    assert.equal(rawBalance, expected);

    const check = checkI5RawBalanceConservation(rawBalance, expected);
    assert.equal(check.passed, true, check.message);
  });

  test("I6: Timeline Monotonicity: intervals are strictly sequential and contiguous", () => {
    const check = checkI6TimelineMonotonicity(timeline);
    assert.equal(check.passed, true, check.message);
  });

  test("I7: Current-State Agreement: reconstructed active multiplier matches live on-chain multiplier", () => {
    const nowTs = BigInt(Math.floor(Date.now() / 1000));
    const res = resolveMultiplierAtTimestamp(timeline, nowTs);
    // Since nowTs > EFFECTIVE_TS, active multiplier should be 1.4861347
    assert.equal(res.floatValue, 1.4861347);

    const check = checkI7CurrentStateAgreement(res.floatValue, 1.4861347);
    assert.equal(check.passed, true, check.message);
  });

  test("I8: Proof Determinism: statement hash matches newly computed hash of same data", () => {
    const holdings = reconstructHoldingsAt({
      wallet: WALLET,
      mint: MINT,
      decimals: 9,
      asOfTs: EFFECTIVE_TS + 500n,
      transfers,
      timeline,
      naiveCurrentMultiplierFloat: 1.0,
    });
    const stmt = generateStatement({
      holdings,
      symbol: "OPENAI",
      category: "PreStocks",
    });

    const check = checkI8ProofDeterminism(stmt);
    assert.equal(check.passed, true, check.message);
  });

  test("I9: Privacy / Key Safety: ensures statements and bundles contain no secrets", () => {
    const holdings = reconstructHoldingsAt({
      wallet: WALLET,
      mint: MINT,
      decimals: 9,
      asOfTs: EFFECTIVE_TS + 500n,
      transfers,
      timeline,
      naiveCurrentMultiplierFloat: 1.0,
    });
    const stmt = generateStatement({
      holdings,
      symbol: "OPENAI",
      category: "PreStocks",
    });

    const serialized = JSON.stringify(stmt, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    );
    const check = checkI9KeySafety(serialized);
    assert.equal(check.passed, true, check.message);
  });

  test("I10: Evidence-Label Integrity: every label is strictly one of the 6 allowed tags", () => {
    const labels = ["MEASURED", "REPLAYED", "SYNTHETIC", "OFFCHAIN", "UNKNOWN", "INCOMPLETE"];
    const check = checkI10EvidenceLabelIntegrity(labels);
    assert.equal(check.passed, true, check.message);

    // Ensure non-standard label fails
    const invalidCheck = checkI10EvidenceLabelIntegrity(["MEASURED", "VERIFIED_ON_CHAIN"]);
    assert.equal(invalidCheck.passed, false, "Non-standard label must fail");
  });
});

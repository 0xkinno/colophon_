/**
 * COLOPHON: Tamper Campaign Test Suite (B1-B15)
 *
 * Verifies that verifyProofBundleOffline detects all attacks from §21:
 *   B1: Edit multiplier
 *   B2: Edit effective timestamp
 *   B3: Delete source transaction
 *   B4: Change statement output
 *   B5: Reorder events
 *   B6: Duplicate an event
 *   B7: Change wallet
 *   B8: Corrupt slot
 *   B9: Remove source anchor
 *   B10: Fabricate unknown event
 *   B11: Invalid evidence label
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TransferEvent,
  MultiplierScheduledEvent,
  InitialMultiplierConfig,
  buildMultiplierTimeline,
  reconstructHoldingsAt,
  generateStatement,
} from "@colophon/kernel";
import { buildProofBundle, ProofBundle } from "@colophon/proof";
import { verifyProofBundleOffline } from "../src/offline.js";

describe("Verifier Tamper Campaign (B1-B15)", () => {
  const MINT = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
  const WALLET = "Holder1111111111111111111111111111111111111";
  const GENESIS_TS = 1770000000n;
  const EFFECTIVE_TS = 1784305800n;

  const initialConfig: InitialMultiplierConfig = {
    mint: MINT,
    initialMultiplierNumerator: 10000000n,
    initialMultiplierDenominator: 10000000n,
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
    newMultiplierDenominator: 10000000n,
    authority: "IssuerAuth11111111111111111111111111111111",
    confidence: "MEASURED",
  };

  const timeline = buildMultiplierTimeline(initialConfig, [scheduledUpdate]);

  const transfer1: TransferEvent = {
    type: "TransferEvent",
    mint: MINT,
    from: "Minter1111111111111111111111111111111111111",
    to: WALLET,
    rawAmount: 1000_000_000_000n,
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
    rawAmount: 200_000_000_000n,
    slot: 320000000n,
    blockTime: GENESIS_TS + 600n,
    signature: "sig_spend_transfer_2",
    confidence: "MEASURED",
  };

  const events = [transfer1, transfer2];

  function createValidBundle(): ProofBundle {
    const holdings = reconstructHoldingsAt({
      wallet: WALLET,
      mint: MINT,
      decimals: 9,
      asOfTs: EFFECTIVE_TS + 100n,
      transfers: events,
      timeline,
      naiveCurrentMultiplierFloat: 1.0,
      pricePerUnit: 1309.18,
    });
    const statement = generateStatement({
      holdings,
      symbol: "OPENAI",
      category: "PreStocks",
    });
    return buildProofBundle({
      statement,
      events,
      gitCommit: "test-commit-sha",
      rpcSource: "mainnet-beta",
    });
  }

  test("Baseline: Valid bundle passes all offline verification checks", () => {
    const bundle = createValidBundle();
    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, true, "Valid bundle must pass all verification checks");
    assert.equal(report.tamperDetected, false);
  });

  test("B1: Tamper Attack: Edit multiplier inside statement", () => {
    const bundle = createValidBundle();
    // Tamper: alter multiplier
    bundle.statement.activeMultiplier.floatValue = 2.0;
    bundle.statement.activeMultiplier.numerator = 20000000n;

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on altered multiplier");
    assert.equal(report.tamperDetected, true);
    assert.match(report.tamperReason ?? "", /Statement Hash Integrity/);
  });

  test("B2: Tamper Attack: Edit effective timestamp", () => {
    const bundle = createValidBundle();
    bundle.statement.activeMultiplier.effectiveAt = 9999999999n;

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on altered effective timestamp");
    assert.equal(report.tamperDetected, true);
  });

  test("B3: Tamper Attack: Delete source transaction", () => {
    const bundle = createValidBundle();
    // Tamper: remove transfer2 from sourceEvents
    bundle.sourceEvents = [bundle.sourceEvents[0]];

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on deleted source transaction");
    assert.equal(report.tamperDetected, true);
  });

  test("B4: Tamper Attack: Inflate statement reconstructed units", () => {
    const bundle = createValidBundle();
    // Tamper: change reconstructed units
    bundle.statement.reconstructedUnits = 999999.0;

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on altered reconstructed units");
    assert.equal(report.tamperDetected, true);
  });

  test("B5: Tamper Attack: Reorder events out of chronological slot order", () => {
    const bundle = createValidBundle();
    // Tamper: reverse events so slot is descending
    bundle.sourceEvents = [...bundle.sourceEvents].reverse();

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on non-monotonic event order");
    assert.equal(report.tamperDetected, true);
  });

  test("B7: Tamper Attack: Change wallet address", () => {
    const bundle = createValidBundle();
    bundle.statement.wallet = "AttackerWallet11111111111111111111111111111";

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on altered wallet address");
    assert.equal(report.tamperDetected, true);
  });

  test("B8: Tamper Attack: Corrupt slot number", () => {
    const bundle = createValidBundle();
    bundle.sourceEvents[0].slot = 99999999999n; // greater than event[1]

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on corrupted slot");
    assert.equal(report.tamperDetected, true);
  });

  test("B9: Tamper Attack: Remove source anchor", () => {
    const bundle = createValidBundle();
    bundle.sourceAnchors[0].signature = "";

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on empty source anchor");
    assert.equal(report.tamperDetected, true);
  });

  test("B10: Tamper Attack: Fabricate injected transaction", () => {
    const bundle = createValidBundle();
    const fakeTx: TransferEvent = {
      type: "TransferEvent",
      mint: MINT,
      from: "Attacker1111111111111111111111111111111111",
      to: WALLET,
      rawAmount: 500_000_000_000n,
      slot: 315000000n,
      blockTime: GENESIS_TS + 550n,
      signature: "sig_fake_attacker_mint",
      confidence: "SYNTHETIC",
    };
    bundle.sourceEvents.push(fakeTx);

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on injected transaction");
    assert.equal(report.tamperDetected, true);
  });

  test("B11: Tamper Attack: Corrupt evidence label with unauthorized tag", () => {
    const bundle = createValidBundle();
    (bundle.statement as any).confidence = "UNVERIFIED_ESTIMATE";

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must fail verification on non-standard label");
    assert.equal(report.tamperDetected, true);
  });

  test("B12: Adversarial: Partial history falsely presented as COMPLETE", () => {
    const bundle = createValidBundle();
    bundle.statement.completenessReport = {
      state: "COMPLETE",
      coverageWindow: {
        startTs: GENESIS_TS,
        endTs: EFFECTIVE_TS + 100n,
        startSlot: 300000000n,
        endSlot: 350000100n,
      },
      missingRanges: [
        {
          startTs: GENESIS_TS + 100n,
          endTs: GENESIS_TS + 200n,
          reason: "RPC rate limit page drop",
        },
      ],
      unresolvedEventsCount: 2,
      explanation: "Dropped 2 transfer pages during ingestion",
    };

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must reject incomplete history falsely tagged as COMPLETE");
    assert.equal(report.tamperDetected, true);
  });

  test("B13: Adversarial: Duplicated transaction in event stream", () => {
    const bundle = createValidBundle();
    // Tamper: duplicate event[0]
    bundle.sourceEvents.push(bundle.sourceEvents[0]);

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must reject duplicated transaction in event stream");
    assert.equal(report.tamperDetected, true);
  });

  test("B14: Adversarial: Wrong mint address with identical symbol", () => {
    const bundle = createValidBundle();
    bundle.statement.mint = "FakeMint111111111111111111111111111111111111";

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must reject statement binding with mismatched mint");
    assert.equal(report.tamperDetected, true);
  });

  test("B15: Adversarial: Wrong wallet with identical token balance", () => {
    const bundle = createValidBundle();
    bundle.statement.wallet = "WrongWallet999999999999999999999999999999999";

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must reject statement binding with mismatched wallet");
    assert.equal(report.tamperDetected, true);
  });

  test("B16: Adversarial: Evidence Merkle root substitution attack", () => {
    const bundle = createValidBundle();
    bundle.hashes.evidenceRoot = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must reject substituted Merkle root");
    assert.equal(report.tamperDetected, true);
  });

  test("B17: Adversarial: Merkle proof sibling branch substitution", () => {
    const bundle = createValidBundle();
    if (bundle.merkleProof && bundle.merkleProof.siblings.length > 0) {
      bundle.merkleProof.siblings[0].hash = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
      const report = verifyProofBundleOffline(bundle);
      assert.equal(report.passed, false, "Must reject corrupted Merkle proof sibling branch");
      assert.equal(report.tamperDetected, true);
    }
  });

  test("B18: Adversarial: Anchor commitment mismatch on altered engine version", () => {
    const bundle = createValidBundle();
    bundle.statement.kernelVersion = "2.0.0-tampered";

    const report = verifyProofBundleOffline(bundle);
    assert.equal(report.passed, false, "Must reject bundle when engine version alters commitment");
    assert.equal(report.tamperDetected, true);
  });

  test("B19: Temporal Boundary: Multiplier effective exactly at T vs T+1", () => {
    // Exact boundary test: at exactly EFFECTIVE_TS, newMultiplier is ACTIVE (>= rule)
    const holdingsExact = reconstructHoldingsAt({
      wallet: WALLET,
      mint: MINT,
      decimals: 9,
      asOfTs: EFFECTIVE_TS, // exactly at activation
      transfers: events,
      timeline,
      naiveCurrentMultiplierFloat: 1.0,
    });
    assert.equal(holdingsExact.activeMultiplierNumerator, 14861347n, "At exact effective timestamp T, new multiplier MUST activate");

    // One second prior: old multiplier MUST remain active
    const holdingsBefore = reconstructHoldingsAt({
      wallet: WALLET,
      mint: MINT,
      decimals: 9,
      asOfTs: EFFECTIVE_TS - 1n,
      transfers: events,
      timeline,
      naiveCurrentMultiplierFloat: 1.0,
    });
    assert.equal(holdingsBefore.activeMultiplierNumerator, 10000000n, "At T - 1s, old multiplier MUST remain active");
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseDecimal,
  rationalToNumber,
  rationalEquals,
  rationalToDecimalString,
  scaleRaw,
  formatUiAmount,
  replayScaledUiAmount,
  resolveReplayAt,
  activeMultiplier,
  stateEquals,
  UpdateObservation,
  ScaledState,
} from "../src/index.js";

const one = parseDecimal("1");
const ob = (sig: string, slot: number, blockTime: number, m: string, eff: number): UpdateObservation => ({
  signature: sig,
  slot: BigInt(slot),
  blockTime: BigInt(blockTime),
  mint: "M",
  newMultiplier: parseDecimal(m),
  newMultiplierTimestamp: BigInt(eff),
});
const genesis: ScaledState = { multiplier: one, newMultiplier: one, newMultiplierEffectiveTimestamp: 0n };

describe("decimal rationals", () => {
  test("parses plain and long decimals exactly", () => {
    const r = parseDecimal("1.4861347");
    assert.equal(r.num, 14861347n);
    assert.equal(r.den, 10000000n);
  });
  test("parses exponent forms", () => {
    assert.ok(rationalEquals(parseDecimal("1e-3"), parseDecimal("0.001")));
    assert.ok(rationalEquals(parseDecimal("2.5E2"), parseDecimal("250")));
  });
  test("rejects garbage", () => {
    assert.throws(() => parseDecimal("abc"));
  });
  test("scaleRaw floors exactly", () => {
    assert.equal(scaleRaw(1_000_000_000n, parseDecimal("1.4861347")), 1_486_134_700n);
    assert.equal(scaleRaw(3n, parseDecimal("0.5")), 1n);
  });
  test("formatUiAmount avoids float drift on very large raw", () => {
    const raw = 9_007_199_254_740_993n; // 2^53 + 1
    assert.equal(formatUiAmount(raw, 9, parseDecimal("1"), 9), "9007199.254740993");
  });
  test("decimal string round trip", () => {
    assert.equal(rationalToDecimalString(parseDecimal("1.0026642075893797"), 16), "1.0026642075893797");
    assert.equal(rationalToNumber(parseDecimal("0.25")), 0.25);
  });
});

describe("scaled ui amount replay", () => {
  test("single scheduled update does not roll forward by itself", () => {
    const r = replayScaledUiAmount([ob("A", 10, 1000, "5", 2000)], genesis);
    assert.ok(rationalEquals(r.finalState.multiplier, one));
    assert.ok(rationalEquals(r.finalState.newMultiplier, parseDecimal("5")));
    assert.equal(r.intervals.length, 2);
    assert.ok(rationalEquals(resolveReplayAt(r.intervals, 1999n)!.multiplier, one));
    assert.ok(rationalEquals(resolveReplayAt(r.intervals, 2000n)!.multiplier, parseDecimal("5")));
  });
  test("boundary is inclusive at effective timestamp", () => {
    const st: ScaledState = { multiplier: one, newMultiplier: parseDecimal("2"), newMultiplierEffectiveTimestamp: 500n };
    assert.ok(rationalEquals(activeMultiplier(st, 499n), one));
    assert.ok(rationalEquals(activeMultiplier(st, 500n), parseDecimal("2")));
  });
  test("C4: A takes effect then B scheduled: multiplier becomes A", () => {
    const r = replayScaledUiAmount([ob("A", 10, 1000, "2", 2000), ob("B", 20, 3000, "3", 4000)], genesis);
    assert.ok(rationalEquals(r.finalState.multiplier, parseDecimal("2")));
    assert.ok(rationalEquals(r.finalState.newMultiplier, parseDecimal("3")));
    assert.equal(r.neverEffective.length, 0);
  });
  test("C3: B overwrites A before A takes effect, A never effective", () => {
    const r = replayScaledUiAmount([ob("A", 10, 1000, "2", 5000), ob("B", 20, 2000, "3", 6000)], genesis);
    assert.equal(r.neverEffective.length, 1);
    assert.equal(r.neverEffective[0].signature, "A");
    assert.ok(rationalEquals(r.finalState.multiplier, one));
    const at5500 = resolveReplayAt(r.intervals, 5500n)!;
    assert.ok(rationalEquals(at5500.multiplier, one));
  });
  test("C3 under unconditional policy differs", () => {
    const r = replayScaledUiAmount([ob("A", 10, 1000, "2", 5000), ob("B", 20, 2000, "3", 6000)], genesis, "UNCONDITIONAL_NEW");
    assert.ok(rationalEquals(r.finalState.multiplier, parseDecimal("2")));
  });
  test("unknown start yields UNKNOWN first interval", () => {
    const r = replayScaledUiAmount([ob("A", 10, 1000, "2", 2000)], null);
    assert.equal(r.intervals[0].confidence, "UNKNOWN");
    assert.equal(r.intervals[0].startTs, null);
  });
  test("replay is deterministic regardless of input order", () => {
    const a = [ob("A", 10, 1000, "2", 2000), ob("B", 20, 3000, "3", 4000)];
    const r1 = replayScaledUiAmount(a, genesis);
    const r2 = replayScaledUiAmount([...a].reverse(), genesis);
    assert.ok(stateEquals(r1.finalState, r2.finalState));
    assert.equal(r1.intervals.length, r2.intervals.length);
  });
  test("resolveReplayAt returns null outside covered intervals only when none match", () => {
    const r = replayScaledUiAmount([], genesis);
    assert.ok(resolveReplayAt(r.intervals, 0n));
  });
});

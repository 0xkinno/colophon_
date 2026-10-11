import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseDecimal,
  scaleRaw,
  rationalEquals,
  replayScaledUiAmount,
  resolveReplayAt,
  buildEvidenceTimeline,
  multiplierAt,
  computeRawBalanceAnchored,
  computeRawBalanceAt,
  formatUiAmount,
  activeMultiplier,
  UpdateObservation,
  ScaledState,
  TransferEvent,
} from "../src/index.js";

// Deterministic PRNG so failures reproduce.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const one = parseDecimal("1");
const dec = (r: () => number) => `${1 + Math.floor(r() * 9)}.${Math.floor(r() * 1e6).toString().padStart(6, "0")}`;
const genesis: ScaledState = { multiplier: one, newMultiplier: one, newMultiplierEffectiveTimestamp: 0n };

function randomEvents(r: () => number, n: number): UpdateObservation[] {
  const out: UpdateObservation[] = [];
  let t = 1_000_000;
  for (let i = 0; i < n; i++) {
    t += 1000 + Math.floor(r() * 5000);
    out.push({
      signature: `S${i}`,
      slot: BigInt(i + 1),
      blockTime: BigInt(t),
      mint: "M",
      newMultiplier: parseDecimal(dec(r)),
      newMultiplierTimestamp: BigInt(t + Math.floor(r() * 20000)),
    });
  }
  return out;
}

describe("properties (I1, I3, I5, I7)", () => {
  test("I1: replay is order independent for 200 random histories", () => {
    for (let k = 0; k < 200; k++) {
      const r = rng(k + 1);
      const ev = randomEvents(r, 1 + Math.floor(r() * 6));
      const a = replayScaledUiAmount(ev, genesis);
      const b = replayScaledUiAmount([...ev].reverse(), genesis);
      assert.ok(rationalEquals(a.finalState.newMultiplier, b.finalState.newMultiplier));
      assert.ok(rationalEquals(a.finalState.multiplier, b.finalState.multiplier));
      assert.equal(a.intervals.length, b.intervals.length);
    }
  });

  test("I3: active multiplier at effective timestamp is the new one, one second earlier is the old one", () => {
    for (let k = 0; k < 200; k++) {
      const r = rng(k + 500);
      const eff = BigInt(1000 + Math.floor(r() * 1e6));
      const st: ScaledState = { multiplier: parseDecimal(dec(r)), newMultiplier: parseDecimal(dec(r)), newMultiplierEffectiveTimestamp: eff };
      assert.ok(rationalEquals(activeMultiplier(st, eff), st.newMultiplier));
      assert.ok(rationalEquals(activeMultiplier(st, eff - 1n), st.multiplier));
    }
  });

  test("I7: replay final tip equals the last submitted update", () => {
    for (let k = 0; k < 200; k++) {
      const r = rng(k + 900);
      const ev = randomEvents(r, 2 + Math.floor(r() * 5));
      const rep = replayScaledUiAmount(ev, genesis);
      const last = ev[ev.length - 1];
      assert.ok(rationalEquals(rep.finalState.newMultiplier, last.newMultiplier));
      assert.equal(rep.finalState.newMultiplierEffectiveTimestamp, last.newMultiplierTimestamp);
    }
  });

  test("intervals tile the timeline with no gaps or overlaps", () => {
    for (let k = 0; k < 200; k++) {
      const r = rng(k + 1300);
      const rep = replayScaledUiAmount(randomEvents(r, 1 + Math.floor(r() * 6)), genesis);
      for (let i = 1; i < rep.intervals.length; i++) {
        assert.equal(rep.intervals[i - 1].endTs, rep.intervals[i].startTs);
      }
      assert.equal(rep.intervals[rep.intervals.length - 1].endTs, null);
    }
  });

  test("every instant resolves to exactly one interval", () => {
    const r = rng(77);
    const rep = replayScaledUiAmount(randomEvents(r, 5), genesis);
    for (let i = 0; i < 300; i++) {
      const ts = BigInt(Math.floor(r() * 2_000_000));
      assert.ok(resolveReplayAt(rep.intervals, ts));
    }
  });

  test("I5: anchored raw balance equals genesis-summed balance", () => {
    for (let k = 0; k < 200; k++) {
      const r = rng(k + 2000);
      const wallet = "W";
      const evs: TransferEvent[] = [];
      let bal = 0n;
      const n = 1 + Math.floor(r() * 12);
      for (let i = 0; i < n; i++) {
        const inbound = bal === 0n || r() > 0.4;
        const amt = inbound ? BigInt(1 + Math.floor(r() * 1e9)) : BigInt(1 + Math.floor(r() * Number(bal > 1000000000n ? 1000000000n : bal)));
        bal += inbound ? amt : -amt;
        evs.push({
          type: "TransferEvent", signature: `T${i}`, slot: BigInt(i + 1), blockTime: BigInt(1000 + i * 100), mint: "M",
          from: inbound ? "X" : wallet, to: inbound ? wallet : "X", rawAmount: amt, confidence: "MEASURED",
        });
      }
      const asOf = BigInt(1000 + Math.floor(r() * n) * 100);
      const direct = computeRawBalanceAt(evs, wallet, "M", asOf).rawBalance;
      const anchored = computeRawBalanceAnchored(bal, evs, wallet, "M", asOf);
      assert.equal(anchored, direct);
    }
  });

  test("scaleRaw is monotone in raw amount", () => {
    const r = rng(3);
    for (let i = 0; i < 300; i++) {
      const m = parseDecimal(dec(r));
      const a = BigInt(Math.floor(r() * 1e12));
      const b = a + BigInt(Math.floor(r() * 1e6));
      assert.ok(scaleRaw(a, m) <= scaleRaw(b, m));
    }
  });

  test("formatUiAmount matches exact integer scaling", () => {
    const r = rng(9);
    for (let i = 0; i < 300; i++) {
      const decimals = Math.floor(r() * 10);
      const raw = BigInt(Math.floor(r() * 1e15));
      const m = parseDecimal(dec(r));
      const s = formatUiAmount(raw, decimals, m, decimals + 4);
      const [w, f] = s.split(".");
      const back = BigInt(w + f);
      const exact = (raw * m.num * 10n ** 4n) / m.den;
      assert.equal(back, exact);
    }
  });

  test("unknown start is never reported as a known multiplier", () => {
    const r = rng(11);
    for (let k = 0; k < 100; k++) {
      const ev = randomEvents(r, 2 + Math.floor(r() * 4));
      const tl = buildEvidenceTimeline({
        mint: "M", observations: ev,
        live: { multiplier: parseDecimal(dec(r)), newMultiplier: ev[ev.length - 1].newMultiplier, newMultiplierEffectiveTimestamp: ev[ev.length - 1].newMultiplierTimestamp },
        liveSlot: 10n, coverageStartTs: 0n,
      });
      const first = tl.intervals[0];
      assert.equal(first.confidence, "UNKNOWN");
      assert.equal(multiplierAt(tl, 1n).known, false);
    }
  });

  test("no events in window: instants before coverage are unknown", () => {
    const live: ScaledState = { multiplier: one, newMultiplier: one, newMultiplierEffectiveTimestamp: 0n };
    const tl = buildEvidenceTimeline({ mint: "M", observations: [], live, liveSlot: 5n, coverageStartTs: 5000n });
    assert.equal(multiplierAt(tl, 4999n).known, false);
    assert.equal(multiplierAt(tl, 5000n).known, true);
  });
});

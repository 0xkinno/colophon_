/**
 * COLOPHON: Scaled-UI-amount replay.
 *
 * Token-2022 ScaledUiAmount stores only the current state:
 *   multiplier, newMultiplier, newMultiplierEffectiveTimestamp.
 * The chain keeps no history. This module replays recovered `updateMultiplier`
 * instructions into explicit intervals and a final state that can be compared
 * with the live account (invariant I7).
 *
 * All arithmetic is exact: multipliers are decimal strings converted to rationals.
 */

import { EvidenceLabel } from "./types.js";

export type Rational = { num: bigint; den: bigint };

export function parseDecimal(input: string | number): Rational {
  const s = String(input).trim();
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!m) throw new Error(`Invalid decimal: ${s}`);
  const frac = m[3] ?? "";
  let num = BigInt(m[2] + frac);
  let den = 10n ** BigInt(frac.length);
  const exp = m[4] ? Number(m[4]) : 0;
  if (exp > 0) num *= 10n ** BigInt(exp);
  if (exp < 0) den *= 10n ** BigInt(-exp);
  if (m[1] === "-") num = -num;
  return { num, den };
}

export function rationalToNumber(r: Rational): number {
  return Number(r.num) / Number(r.den);
}

export function rationalEquals(a: Rational, b: Rational): boolean {
  return a.num * b.den === b.num * a.den;
}

export function rationalToDecimalString(r: Rational, places = 12): string {
  const neg = r.num < 0n;
  const n = neg ? -r.num : r.num;
  const scale = 10n ** BigInt(places);
  const scaled = (n * scale) / r.den;
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(places, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

/** raw * multiplier, floored, exact. */
export function scaleRaw(raw: bigint, m: Rational): bigint {
  return (raw * m.num) / m.den;
}

/** Exact decimal string of raw / 10^decimals * multiplier with `places` fractional digits (truncated). */
export function formatUiAmount(raw: bigint, decimals: number, m: Rational, places = 6): string {
  const scale = 10n ** BigInt(places);
  const q = (raw * m.num * scale) / (m.den * 10n ** BigInt(decimals));
  const whole = q / scale;
  const frac = (q % scale).toString().padStart(places, "0");
  return `${whole}.${frac}`;
}

export type UpdateObservation = {
  signature: string;
  slot: bigint;
  blockTime: bigint;
  mint: string;
  newMultiplier: Rational;
  newMultiplierTimestamp: bigint;
};

export type ScaledState = {
  multiplier: Rational;
  newMultiplier: Rational;
  newMultiplierEffectiveTimestamp: bigint;
};

export type ReplayInterval = {
  startTs: bigint | null; // null: unbounded start
  endTs: bigint | null; // null: open ended
  multiplier: Rational;
  source: { kind: "GENESIS" | "SCHEDULED"; signature: string; slot: bigint };
  confidence: EvidenceLabel;
};

/**
 * RollPolicy encodes what `multiplier` becomes when a new update is submitted.
 *  - ACTIVE_AT_SUBMIT: multiplier := value that was active at submission time
 *    (a pending update that has not yet taken effect is discarded).
 *  - UNCONDITIONAL_NEW: multiplier := previous newMultiplier regardless of its effective time.
 * The correct policy is pinned by comparing replays with live account state and by the devnet lab.
 */
export type RollPolicy = "ACTIVE_AT_SUBMIT" | "UNCONDITIONAL_NEW";

export function activeMultiplier(state: ScaledState, ts: bigint): Rational {
  return ts >= state.newMultiplierEffectiveTimestamp ? state.newMultiplier : state.multiplier;
}

export type ReplayResult = {
  finalState: ScaledState;
  intervals: ReplayInterval[];
  /** Updates that were overwritten before ever taking effect (C3). */
  neverEffective: UpdateObservation[];
};

/**
 * Replays observations in slot order starting from `initial` (the state before the first observation).
 * `initial` is null when history before the first recovered update is unknown; the first interval
 * then has an unbounded start and `UNKNOWN` confidence.
 */
export function replayScaledUiAmount(
  observations: readonly UpdateObservation[],
  initial: ScaledState | null,
  policy: RollPolicy = "ACTIVE_AT_SUBMIT"
): ReplayResult {
  const sorted = [...observations].sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
  const never: UpdateObservation[] = [];
  const one: Rational = { num: 1n, den: 1n };
  let state: ScaledState = initial ?? {
    multiplier: one,
    newMultiplier: one,
    newMultiplierEffectiveTimestamp: 0n,
  };
  const knownStart = initial !== null;
  let pendingSource: UpdateObservation | null = null;
  const changePoints: Array<{ ts: bigint; multiplier: Rational; source: ReplayInterval["source"] }> = [];

  for (const ob of sorted) {
    const at = ob.blockTime;
    const wasActive = at >= state.newMultiplierEffectiveTimestamp;
    if (pendingSource && !wasActive) never.push(pendingSource);
    const rolled =
      policy === "UNCONDITIONAL_NEW"
        ? state.newMultiplier
        : wasActive
          ? state.newMultiplier
          : state.multiplier;
    state = {
      multiplier: rolled,
      newMultiplier: ob.newMultiplier,
      newMultiplierEffectiveTimestamp: ob.newMultiplierTimestamp,
    };
    pendingSource = ob;
    changePoints.push({
      ts: ob.newMultiplierTimestamp,
      multiplier: ob.newMultiplier,
      source: { kind: "SCHEDULED", signature: ob.signature, slot: ob.slot },
    });
  }

  // Build intervals from effective points (sorted by effective time, but only those that were not overwritten).
  const neverSigs = new Set(never.map((n) => n.signature));
  const live = changePoints.filter((c) => !neverSigs.has(c.source.signature)).sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const startMult = initial ? initial.multiplier : one;
  const intervals: ReplayInterval[] = [];
  let curStart: bigint | null = null;
  let curMult = startMult;
  let curSource: ReplayInterval["source"] = { kind: "GENESIS", signature: "GENESIS", slot: 0n };
  let curConf: EvidenceLabel = knownStart ? "REPLAYED" : "UNKNOWN";
  for (const c of live) {
    intervals.push({ startTs: curStart, endTs: c.ts, multiplier: curMult, source: curSource, confidence: curConf });
    curStart = c.ts;
    curMult = c.multiplier;
    curSource = c.source;
    curConf = "REPLAYED";
  }
  intervals.push({ startTs: curStart, endTs: null, multiplier: curMult, source: curSource, confidence: curConf });
  return { finalState: state, intervals, neverEffective: never };
}

export function resolveReplayAt(
  intervals: readonly ReplayInterval[],
  ts: bigint
): ReplayInterval | null {
  for (const iv of intervals) {
    if ((iv.startTs === null || ts >= iv.startTs) && (iv.endTs === null || ts < iv.endTs)) return iv;
  }
  return null;
}

export function stateEquals(a: ScaledState, b: ScaledState): boolean {
  return (
    rationalEquals(a.multiplier, b.multiplier) &&
    rationalEquals(a.newMultiplier, b.newMultiplier) &&
    a.newMultiplierEffectiveTimestamp === b.newMultiplierEffectiveTimestamp
  );
}

export type EvidenceTimeline = {
  intervals: ReplayInterval[];
  /** Replay of recovered events reproduces the live account state exactly (I7). null when there are no events to replay. */
  consistent: boolean | null;
  eventCount: number;
  neverEffective: UpdateObservation[];
  /** Earliest instant for which the multiplier is known, or null when the first interval is unbounded. */
  knownFromTs: bigint | null;
  derivation: "NO_EVENTS_IN_WINDOW" | "SINGLE_EVENT_ANCHORED_TO_LIVE" | "REPLAY_UNKNOWN_START" | "REPLAY_FROM_GENESIS";
};

/**
 * Builds the strongest timeline the evidence supports. Never invents history:
 * instants outside a known interval resolve to UNKNOWN.
 *
 *  - No recovered events: the live account state is constant over the coverage window.
 *  - One recovered event: the live `multiplier` is the value active at that submission (policy ACTIVE_AT_SUBMIT).
 *  - Several events: the first interval has an unknown value; later intervals are exact.
 */
export function buildEvidenceTimeline(params: {
  mint: string;
  observations: readonly UpdateObservation[];
  live: ScaledState;
  liveSlot: bigint;
  coverageStartTs: bigint;
  genesisKnown?: boolean;
  policy?: RollPolicy;
}): EvidenceTimeline {
  const { observations, live, liveSlot, coverageStartTs, mint } = params;
  const policy = params.policy ?? "ACTIVE_AT_SUBMIT";
  const accountSource: ReplayInterval["source"] = { kind: "SCHEDULED", signature: `ACCOUNT_STATE:${mint}`, slot: liveSlot };

  if (observations.length === 0) {
    const intervals: ReplayInterval[] = [];
    const pendingTs = live.newMultiplierEffectiveTimestamp;
    if (pendingTs > coverageStartTs) {
      intervals.push({ startTs: coverageStartTs, endTs: pendingTs, multiplier: live.multiplier, source: accountSource, confidence: "MEASURED" });
      intervals.push({ startTs: pendingTs, endTs: null, multiplier: live.newMultiplier, source: accountSource, confidence: "MEASURED" });
    } else {
      intervals.push({ startTs: coverageStartTs, endTs: null, multiplier: live.newMultiplier, source: accountSource, confidence: "MEASURED" });
    }
    return { intervals, consistent: null, eventCount: 0, neverEffective: [], knownFromTs: coverageStartTs, derivation: "NO_EVENTS_IN_WINDOW" };
  }

  const sorted = [...observations].sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
  let initial: ScaledState | null = null;
  let derivation: EvidenceTimeline["derivation"] = "REPLAY_UNKNOWN_START";
  if (params.genesisKnown) {
    initial = { multiplier: { num: 1n, den: 1n }, newMultiplier: { num: 1n, den: 1n }, newMultiplierEffectiveTimestamp: 0n };
    derivation = "REPLAY_FROM_GENESIS";
  } else if (sorted.length === 1 && policy === "ACTIVE_AT_SUBMIT") {
    initial = { multiplier: live.multiplier, newMultiplier: live.multiplier, newMultiplierEffectiveTimestamp: 0n };
    derivation = "SINGLE_EVENT_ANCHORED_TO_LIVE";
  }
  const r = replayScaledUiAmount(sorted, initial, policy);
  const tipMatches =
    rationalEquals(r.finalState.newMultiplier, live.newMultiplier) &&
    r.finalState.newMultiplierEffectiveTimestamp === live.newMultiplierEffectiveTimestamp;
  const consistent = initial === null ? tipMatches : stateEquals(r.finalState, live);
  const knownFromTs = r.intervals[0].startTs;
  return { intervals: r.intervals, consistent, eventCount: sorted.length, neverEffective: r.neverEffective, knownFromTs, derivation };
}

export type MultiplierAt =
  | { known: true; multiplier: Rational; source: ReplayInterval["source"]; confidence: EvidenceLabel; intervalStartTs: bigint | null }
  | { known: false; reason: string };

export function multiplierAt(tl: EvidenceTimeline, ts: bigint): MultiplierAt {
  const iv = resolveReplayAt(tl.intervals, ts);
  if (!iv) {
    return { known: false, reason: "Instant precedes the history window Colophon has recovered for this mint." };
  }
  if (iv.confidence === "UNKNOWN") {
    return { known: false, reason: "The multiplier before the first recovered update is not recorded on chain history Colophon could read." };
  }
  return { known: true, multiplier: iv.multiplier, source: iv.source, confidence: iv.confidence, intervalStartTs: iv.startTs };
}

"use client";
import { useMemo } from "react";
import type { TimelineIv } from "@/lib/types";

/**
 * Two halves of every balance: the raw token amount (flat) and the multiplier history (stepped).
 * Their product is the share count. Intervals come straight from the evidence timeline.
 */
export function TwoHalvesLine({
  intervals,
  rawUnits,
  asOfTs,
  fromTs,
  toTs,
}: {
  intervals: TimelineIv[];
  rawUnits: number;
  asOfTs: number;
  fromTs: number;
  toTs: number;
}) {
  const W = 800;
  const H = 220;
  const pad = 30;
  const model = useMemo(() => {
    const pts = intervals
      .filter((iv) => iv.confidence !== "UNKNOWN")
      .map((iv) => ({
        s: Math.max(fromTs, iv.startTs === null ? fromTs : Number(iv.startTs)),
        e: Math.min(toTs, iv.endTs === null ? toTs : Number(iv.endTs)),
        m: Number(iv.multiplier),
      }))
      .filter((p) => p.e > p.s);
    const maxM = Math.max(1, ...pts.map((p) => p.m));
    const minM = Math.min(1, ...pts.map((p) => p.m));
    const span = Math.max(1e-9, maxM - minM) * 1.2;
    const x = (t: number) => pad + ((t - fromTs) / Math.max(1, toTs - fromTs)) * (W - 2 * pad);
    const y = (m: number) => H - pad - ((m - minM + span * 0.1) / span) * (H - 2 * pad);
    let d = "";
    pts.forEach((p, i) => {
      d += `${i === 0 ? "M" : "L"} ${x(p.s)} ${y(p.m)} L ${x(p.e)} ${y(p.m)} `;
    });
    return { d, x, y, pts };
  }, [intervals, fromTs, toTs]);

  const clampedAsOf = Math.min(toTs, Math.max(fromTs, asOfTs));
  return (
    <figure className="halves" aria-label="Raw balance is flat, the multiplier steps; their product is the share count">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <line className="raw" x1={pad} x2={W - pad} y1={H - pad / 2} y2={H - pad / 2} />
        <path className="scaled" d={model.d} />
        <line className="marker" x1={model.x(clampedAsOf)} x2={model.x(clampedAsOf)} y1={10} y2={H - 6} />
        <text x={pad} y={H - 4} fontSize="11" fontFamily="var(--font-mono)" fill="var(--ink-soft)">raw {rawUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })}</text>
        <text x={model.x(clampedAsOf) + 6} y={22} fontSize="11" fontFamily="var(--font-mono)" fill="var(--ink)">as of</text>
      </svg>
    </figure>
  );
}

export function ChainSplit({ solana, robinhood }: { solana: { rows: number; label: string }; robinhood: { rows: number; label: string } }) {
  return (
    <div className="split">
      <div className="panel">
        <span className="chip chip--chain">Solana</span>
        <h3 style={{ marginTop: 12 }}>Token-2022 ScaledUiAmount</h3>
        <p className="lede">{solana.label}</p>
        <p className="mono">{solana.rows} tracked mints, multiplier stored as multiplier / newMultiplier / effective time.</p>
      </div>
      <div className="split__kernel">One kernel<br />one verifier</div>
      <div className="panel">
        <span className="chip chip--chain">Robinhood Chain</span>
        <h3 style={{ marginTop: 12 }}>ERC-8056 uiMultiplier()</h3>
        <p className="lede">{robinhood.label}</p>
        <p className="mono">{robinhood.rows} stock tokens, multiplier read by selector 0xa60bf13d.</p>
      </div>
    </div>
  );
}

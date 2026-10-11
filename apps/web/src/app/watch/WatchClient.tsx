"use client";
import { useEffect, useState } from "react";
import { solExplorer, short, trimUnits } from "@/lib/format";

type Rec = { symbol: string | null; mint: string; submittedAt: number; newMultiplier: string; effectiveAt: number; signature: string; slot: number; evidence: string };
type Drift = {
  symbol: string;
  mint: string;
  before: { multiplier: string; newMultiplier: string; effectiveAt: number };
  after: { multiplier: string; newMultiplier: string; effectiveAt: number };
  observedAtSlot: number;
};
type Cov = Record<string, { signaturesScanned: number; oldestBlockTime: number | null; reachedBeginning: boolean }>;
type W = { snapshotAt: string; recoveredThrough: string; liveSlot: number | null; recorded: Rec[]; changedSinceSnapshot: Drift[]; coverage: Cov };

const iso = (t: number) => new Date(t * 1000).toISOString().replace(".000Z", "Z");

export function WatchClient() {
  const [w, setW] = useState<W | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/v1/watch")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setW(j);
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);
  if (err) return <div className="notice notice--bad">{err}</div>;
  if (!w) return <div className="notice"><span className="spin" /> Reading recorded changes.</div>;
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div className="notice">
        Snapshot {w.snapshotAt.slice(0, 19)}Z · live slot {w.liveSlot ?? "n/a"} · {w.recorded.length} recorded updates ·{" "}
        {Object.values(w.coverage).map((c, i) => (
          <span key={i} className="chip" style={{ marginLeft: 6 }}>
            {c.signaturesScanned} sigs{c.reachedBeginning ? ", from first" : ", partial window"}
          </span>
        ))}
      </div>
      <section>
        <h3 style={{ marginBottom: 12 }}>Observed since snapshot</h3>
        {w.changedSinceSnapshot.length === 0 ? (
          <div className="notice notice--good">No tracked mint changed state since the snapshot. This is a live comparison against chain, not a placeholder.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Token</th><th>Before</th><th>After</th><th>Slot</th></tr></thead>
              <tbody>
                {w.changedSinceSnapshot.map((d) => (
                  <tr key={d.mint}>
                    <td className="mono">{d.symbol}</td>
                    <td className="mono">{trimUnits(d.before.multiplier, 8)} → {trimUnits(d.before.newMultiplier, 8)}</td>
                    <td className="mono">{trimUnits(d.after.multiplier, 8)} → {trimUnits(d.after.newMultiplier, 8)}</td>
                    <td className="mono">{d.observedAtSlot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h3 style={{ marginBottom: 12 }}>Recovered updates, newest first</h3>
        {w.recorded.length === 0 ? (
          <div className="notice notice--warn">No updates were recovered in the scanned window. The negative result is recorded in evidence/recovery.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Token</th><th>New multiplier</th><th>Submitted</th><th>Effective</th><th>Evidence</th><th>Transaction</th></tr></thead>
              <tbody>
                {w.recorded.map((r) => (
                  <tr key={r.signature + r.mint}>
                    <td className="mono">{r.symbol ?? short(r.mint)}</td>
                    <td className="mono">{trimUnits(r.newMultiplier, 8)}x</td>
                    <td className="mono">{iso(r.submittedAt)}</td>
                    <td className="mono">{iso(r.effectiveAt)}</td>
                    <td><span className="chip chip--measured">{r.evidence}</span></td>
                    <td className="mono"><a href={solExplorer("tx", r.signature)} target="_blank" rel="noreferrer">{short(r.signature, 8, 8)}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

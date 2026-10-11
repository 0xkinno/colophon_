import { ProofVerifier } from "./ProofVerifier";
import { featuredHolders } from "@/server/featured";
import probe from "@/data/generated/probe.json";
import breakRes from "@/data/generated/break.json";
import { UNITSEAL_GUARD_ADDRESS, COLOPHON_ANCHOR_PROGRAM_ID } from "@colophon/instruments";
import { rhExplorer, solExplorer } from "@/lib/format";

export const metadata = { title: "Proof | Colophon" };

const CLAIMS: Array<{ id: string; claim: string; enforcedBy: string }> = [
  { id: "I1", claim: "Same inputs always produce the same statement bytes.", enforcedBy: "packages/kernel/src/statement.ts" },
  { id: "I2", claim: "Every number traces to a transaction signature or an account read at a slot.", enforcedBy: "packages/verifier/src/offline.ts ANCHORS_TRACE" },
  { id: "I3", claim: "A multiplier applies from its effective timestamp inclusive (measured on devnet, case C2).", enforcedBy: "packages/kernel/src/scaled.ts" },
  { id: "I4", claim: "Instants outside recovered history resolve to UNKNOWN, never a guess.", enforcedBy: "packages/kernel/src/scaled.ts multiplierAt" },
  { id: "I5", claim: "Raw balance is conserved: observed balance minus later deltas.", enforcedBy: "packages/kernel/src/ledger.ts computeRawBalanceAnchored" },
  { id: "I9", claim: "Colophon never accepts a key, seed or signature.", enforcedBy: "apps/web/src/server/json.ts containsSecretShape" },
];

type Row = { tool: string; symbol: string; reports: string; kernel: string; verdict: string; at: string };
type Break = { generatedAt?: string; subject?: string; results: Array<{ id: string; attack: string; detected: boolean; reason: string }> };

export default function ProofPage() {
  const holders = featuredHolders();
  const rows = (probe as { rows: Row[] }).rows;
  const br = breakRes as unknown as Break;
  return (
    <div className="wrap page-top" style={{ paddingBottom: 60, display: "grid", gap: 56 }}>
      <div className="sec-head">
        <span className="label">Proof</span>
        <h1 className="display" style={{ fontSize: "clamp(2rem,5vw,3.6rem)" }}>Claims you can try to break.</h1>
      </div>

      <section>
        <h2 style={{ fontSize: "1.6rem", marginBottom: 16 }}>Claims ledger</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>ID</th><th>Claim</th><th>Enforced by</th></tr></thead>
            <tbody>
              {CLAIMS.map((c) => (
                <tr key={c.id}><td className="mono">{c.id}</td><td>{c.claim}</td><td className="mono" style={{ fontSize: 12 }}>{c.enforcedBy}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1.6rem", marginBottom: 16 }}>Check a bundle in your browser</h2>
        <ProofVerifier sampleWallet={holders[0]?.wallet ?? null} />
      </section>

      <section>
        <h2 style={{ fontSize: "1.6rem", marginBottom: 16 }}>Break results</h2>
        {br.results.length === 0 ? (
          <div className="notice notice--warn">The break campaign has not been run. Run <span className="mono">pnpm break</span> against a running app.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Case</th><th>Attack</th><th>Detected</th><th>Reason</th></tr></thead>
              <tbody>
                {br.results.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td><td>{r.attack}</td>
                    <td><span className={`chip ${r.detected ? "chip--measured" : "chip--breach"}`}>{r.detected ? "REFUSED" : "MISSED"}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.reason.slice(0, 120)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {br.generatedAt && <p className="label" style={{ marginTop: 10 }}>run {br.generatedAt} on {br.subject}</p>}
      </section>

      <section>
        <h2 style={{ fontSize: "1.6rem", marginBottom: 16 }}>Who reads these tokens wrong</h2>
        {rows.length === 0 ? (
          <div className="notice notice--warn">Probe not run. Run <span className="mono">pnpm probe</span>.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Tool</th><th>Token</th><th>Reports</th><th>Kernel</th><th>Verdict</th><th>At</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}><td className="mono">{r.tool}</td><td className="mono">{r.symbol}</td><td className="mono">{r.reports}</td><td className="mono">{r.kernel}</td>
                    <td><span className={`chip ${r.verdict === "MATCH" ? "chip--measured" : "chip--unknown"}`}>{r.verdict}</span></td><td className="mono">{r.at.slice(0, 19)}Z</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid2">
        <div className="panel">
          <span className="label">Robinhood Chain</span>
          <h3 style={{ margin: "10px 0" }}>UnitSealGuard</h3>
          <p>The read side tells you what you held. The guard stops you acting on a stale number: a seal bound to a multiplier that no longer matches is refused with <span className="mono">MultiplierMismatch</span>.</p>
          <a className="mono" href={rhExplorer("address", UNITSEAL_GUARD_ADDRESS)} target="_blank" rel="noreferrer">{UNITSEAL_GUARD_ADDRESS}</a>
        </div>
        <div className="panel">
          <span className="label">Solana devnet</span>
          <h3 style={{ margin: "10px 0" }}>Statement anchor program</h3>
          <p>Anchoring writes the statement hash to a program-derived account that can never be overwritten.</p>
          <a className="mono" href={solExplorer("address", COLOPHON_ANCHOR_PROGRAM_ID, "devnet")} target="_blank" rel="noreferrer">{COLOPHON_ANCHOR_PROGRAM_ID}</a>
        </div>
      </section>
    </div>
  );
}

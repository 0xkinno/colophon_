"use client";
import { useState } from "react";
import { deserializeBundle } from "@colophon/proof";
import { verifyProofBundleOffline, type OfflineVerificationReport } from "@colophon/verifier";

export function ProofVerifier({ sampleWallet }: { sampleWallet: string | null }) {
  const [text, setText] = useState("");
  const [report, setReport] = useState<OfflineVerificationReport | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = (t: string) => {
    try {
      setReport(verifyProofBundleOffline(deserializeBundle(t)));
      setMsg(null);
    } catch (e) {
      setReport(null);
      setMsg(`Not a Colophon bundle: ${e instanceof Error ? e.message : "parse error"}`);
    }
  };

  const loadSample = async () => {
    if (!sampleWallet) return;
    setBusy(true);
    try {
      const r = await fetch("/api/statement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: sampleWallet }) });
      const j = await r.json();
      const h = (j.holdings as Array<{ bundleJson?: string }> | undefined)?.find((x) => x.bundleJson);
      if (!h?.bundleJson) throw new Error(j.error ?? "No verifiable holding returned");
      setText(h.bundleJson);
      verify(h.bundleJson);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not load a sample");
    } finally {
      setBusy(false);
    }
  };

  const flip = () => {
    const idx = text.search(/"statementHash":"[0-9a-f]/);
    if (idx < 0) {
      setMsg("Load a bundle first.");
      return;
    }
    const pos = idx + '"statementHash":"'.length;
    const c = text[pos];
    const flipped = c === "0" ? "1" : "0";
    const t = text.slice(0, pos) + flipped + text.slice(pos + 1);
    setText(t);
    verify(t);
  };

  return (
    <div className="panel" style={{ display: "grid", gap: 14 }} data-testid="proof-verifier">
      <div className="row">
        <button className="btn btn--sm" disabled={!sampleWallet || busy} onClick={loadSample}>{busy ? "Loading" : "Load a real bundle"}</button>
        <button className="btn btn--ghost btn--sm" disabled={!text} onClick={() => verify(text)}>Verify</button>
        <button className="btn btn--ghost btn--sm" disabled={!text} onClick={flip}>Flip one byte</button>
      </div>
      <textarea aria-label="Bundle JSON" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an exported bundle.json here" spellCheck={false} />
      {msg && <div className="notice notice--warn" role="alert">{msg}</div>}
      {report && (
        <div className={`notice ${report.passed ? "notice--good" : "notice--bad"}`} data-testid="verifier-result">
          <strong className="mono">{report.passed ? "PASS" : "FAIL"}</strong>{" "}
          {report.passed ? "All checks re-ran in this browser with no network." : report.tamperReason}
          <ul className="mono" style={{ fontSize: 12, paddingLeft: 18 }}>
            {report.checks.map((c) => (
              <li key={c.checkId}>{c.passed ? "ok" : "FAIL"} {c.checkId}: {c.message.slice(0, 120)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

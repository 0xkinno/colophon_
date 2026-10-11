"use client";
import { useState } from "react";

const REPO = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/0xkinno/colophon";

export function TesterForm() {
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [consent, setConsent] = useState(false);
  const [notes, setNotes] = useState("");
  const [shown, setShown] = useState(false);

  const body = [
    `Name: ${name || "(not given)"}`,
    `Wallet (optional, public): ${wallet || "(not given)"}`,
    `Consent to be named in docs/users.md: ${consent ? "yes" : "no"}`,
    "",
    "What I tried and what happened:",
    notes || "(fill in)",
  ].join("\n");
  const href = `${REPO}/issues/new?title=${encodeURIComponent("Tester report")}&body=${encodeURIComponent(body)}`;

  return (
    <form
      className="panel"
      style={{ display: "grid", gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        setShown(true);
      }}
    >
      <div className="field">
        <label className="label" htmlFor="n">Name or handle</label>
        <input id="n" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="w">Wallet address (optional)</label>
        <input id="w" type="text" value={wallet} onChange={(e) => setWallet(e.target.value)} spellCheck={false} />
      </div>
      <div className="field">
        <label className="label" htmlFor="t">What did you try?</label>
        <textarea id="t" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I consent to being named in the users log
      </label>
      <button className="btn" type="submit">Prepare my report</button>
      {shown && (
        <div className="notice notice--good" data-testid="tester-ready">
          <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: 13, margin: "0 0 12px" }}>{body}</pre>
          <a className="btn btn--sm" href={href} target="_blank" rel="noreferrer">Open as a GitHub issue</a>
        </div>
      )}
    </form>
  );
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { TokenIcon } from "@/components/TokenIcon";
import { trimUnits, solExplorer, rhExplorer, short, tokenIcon } from "@/lib/format";
import type { BoardRow } from "@/lib/types";

type Snap = { symbol: string; mint: string; category: string; stale: string; active: string; pending: boolean; diverges: boolean };

export function BoardClient({ initial }: { initial: Snap[] }) {
  const [rows, setRows] = useState<BoardRow[]>(
    initial.map((r) => ({
      chain: "solana",
      symbol: r.symbol,
      name: r.symbol,
      id: r.mint,
      category: r.category,
      decimals: 0,
      icon: tokenIcon(r.mint),
      multiplierNow: r.active,
      staleField: r.stale,
      pendingMultiplier: r.pending ? r.active : null,
    }))
  );
  const [state, setState] = useState<"loading" | "live" | "error">("loading");
  const [q, setQ] = useState("");
  const [chain, setChain] = useState<"all" | "solana" | "robinhood">("all");
  const [onlyDiverging, setOnlyDiverging] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/v1/board")
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.rows) {
          setRows(j.rows as BoardRow[]);
          setState("live");
        } else setState("error");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (chain === "all" || r.chain === chain) &&
          (!q || r.symbol.toLowerCase().includes(q.toLowerCase()) || r.name.toLowerCase().includes(q.toLowerCase())) &&
          (!onlyDiverging || (r.staleField && r.multiplierNow && Number(r.staleField) !== Number(r.multiplierNow)))
      ),
    [rows, q, chain, onlyDiverging]
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <div className="field" style={{ flex: "2 1 240px" }}>
          <label className="label" htmlFor="q">Search</label>
          <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="AAPLx, OpenAI" />
        </div>
        <div className="switch" role="radiogroup" aria-label="Chain">
          {(["all", "solana", "robinhood"] as const).map((c) => (
            <button key={c} role="radio" aria-checked={chain === c} onClick={() => setChain(c)}>
              {c === "all" ? "All" : c === "solana" ? "Solana" : "Robinhood"}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={onlyDiverging} onChange={(e) => setOnlyDiverging(e.target.checked)} /> Stored field differs
        </label>
        <span className={`chip ${state === "live" ? "chip--measured" : state === "error" ? "chip--unknown" : ""}`}>
          {state === "live" ? "LIVE READ" : state === "error" ? "LIVE READ FAILED, SNAPSHOT SHOWN" : "READING"}
        </span>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>Token</th><th>Chain</th><th>Multiplier now</th><th>Stored field</th><th>Scheduled</th><th>Issuer powers</th><th>Account</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.chain}:${r.id}`}>
                <td>
                  <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    <TokenIcon src={r.icon} symbol={r.symbol} size={28} />
                    <strong className="mono">{r.symbol}</strong>
                  </span>
                </td>
                <td><span className="chip chip--chain">{r.chain === "solana" ? "Solana" : "Robinhood"}</span></td>
                <td className="mono">{r.multiplierNow ? `${trimUnits(r.multiplierNow, 8)}x` : <span className="chip chip--unknown">UNKNOWN</span>}</td>
                <td className="mono">{r.staleField ? `${trimUnits(r.staleField, 8)}x` : "n/a"}</td>
                <td className="mono">
                  {r.pendingMultiplier
                    ? `${trimUnits(r.pendingMultiplier, 8)}x${r.pendingAt ? " @ " + new Date(r.pendingAt * 1000).toISOString().slice(0, 16) + "Z" : ""}`
                    : "none"}
                </td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {r.powers?.length ? r.powers.join(", ") : r.chain === "solana" ? "none of the tracked set" : "n/a"}
                </td>
                <td className="mono">
                  <a href={r.chain === "solana" ? solExplorer("address", r.id) : rhExplorer("address", r.id)} target="_blank" rel="noreferrer">
                    {short(r.id, 5, 5)}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="label">{shown.length} rows</p>
    </div>
  );
}

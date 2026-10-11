"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { deserializeBundle } from "@colophon/proof";
import { verifyProofBundleOffline, type OfflineVerificationReport } from "@colophon/verifier";
import type { Holding, RhStatement, RhRow, SolanaStatement } from "@/lib/types";
import { isoDate, short, solExplorer, trimUnits, rhExplorer, tokenIcon } from "@/lib/format";
import { TokenIcon } from "./TokenIcon";
import { DigitRoll } from "./motion/DigitRoll";
import { TwoHalvesLine } from "./motion/TwoHalvesLine";
import { AnchorPanel } from "./wallet/AnchorPanel";
import { EvmPanel } from "./wallet/EvmPanel";

type Chain = "solana" | "robinhood";
type Result = SolanaStatement | RhStatement;

const chipFor = (e: string) => `chip chip--${e.toLowerCase()}`;

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function StatementClient({
  initialWallet = "",
  initialDate = "",
  initialChain = "solana",
  autoRun = false,
  featured = [],
}: {
  initialWallet?: string;
  initialDate?: string;
  initialChain?: Chain;
  autoRun?: boolean;
  featured?: Array<{ wallet: string; symbol: string }>;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [chain, setChain] = useState<Chain>(initialChain);
  const [wallet, setWallet] = useState(initialWallet);
  const [date, setDate] = useState(initialDate || today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Result | null>(null);
  const [verifyOpen, setVerifyOpen] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, OfflineVerificationReport>>({});
  const reqId = useRef(0);
  const { publicKey } = useWallet();
  const [evmAddr, setEvmAddr] = useState<string | null>(null);

  const run = useCallback(
    async (w: string, d: string, c: Chain) => {
      if (!w.trim()) return;
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const asOfTs = Math.floor(new Date(`${d}T23:59:59Z`).getTime() / 1000);
        const res = await fetch("/api/statement", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet: w.trim(), chain: c, asOfTs }),
        });
        const j = await res.json();
        if (id !== reqId.current) return;
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setData(j as Result);
      } catch (e) {
        if (id === reqId.current) {
          setData(null);
          setError(e instanceof Error ? e.message : "Request failed");
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (autoRun && initialWallet) void run(initialWallet, initialDate || today, initialChain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tour driver: the parent page posts steps and this page drives itself.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const m = ev.data as { type?: string; step?: number; wallet?: string; date?: string; chain?: Chain };
      if (m?.type !== "colophon-tour") return;
      if (m.wallet) setWallet(m.wallet);
      if (m.date) setDate(m.date);
      if (m.chain) setChain(m.chain);
      if (m.step === 4) setVerifyOpen("auto");
      if (m.wallet) void run(m.wallet, m.date ?? date, m.chain ?? chain);
      else if (m.date && wallet) void run(wallet, m.date, m.chain ?? chain);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [run, date, wallet, chain]);

  const useConnected = () => {
    if (chain === "solana" && publicKey) setWallet(publicKey.toBase58());
    if (chain === "robinhood" && evmAddr) setWallet(evmAddr);
  };

  const verify = (key: string, json: string) => {
    try {
      const rep = verifyProofBundleOffline(deserializeBundle(json));
      setReports((r) => ({ ...r, [key]: rep }));
    } catch (e) {
      setError(`Verifier could not read the bundle: ${e instanceof Error ? e.message : "error"}`);
    }
  };

  const nowTs = Math.floor(Date.now() / 1000);

  return (
    <div>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void run(wallet, date, chain);
        }}
        aria-label="Statement request"
      >
        <div className="row">
          <div className="field" style={{ flex: "0 0 auto" }}>
            <span className="label">Chain</span>
            <div className="switch" role="radiogroup" aria-label="Chain">
              {(["solana", "robinhood"] as const).map((c) => (
                <button type="button" key={c} role="radio" aria-checked={chain === c} onClick={() => setChain(c)}>
                  {c === "solana" ? "Solana" : "Robinhood Chain"}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ flex: "3 1 320px" }}>
            <label className="label" htmlFor="wallet">Wallet address</label>
            <input id="wallet" type="text" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder={chain === "solana" ? "Solana address" : "0x address"} spellCheck={false} autoComplete="off" />
          </div>
          <div className="field" style={{ flex: "1 1 170px" }}>
            <label className="label" htmlFor="date">As of date</label>
            <input
              id="date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => {
                setDate(e.target.value);
                if (wallet) void run(wallet, e.target.value, chain);
              }}
            />
          </div>
          <button className="btn" type="submit" disabled={loading || !wallet.trim()}>
            {loading ? <span className="spin" /> : null}
            Show statement
          </button>
        </div>
        <div className="row" style={{ marginTop: 14, alignItems: "center" }}>
          {chain === "solana" && publicKey && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={useConnected}>
              Use connected wallet {short(publicKey.toBase58())}
            </button>
          )}
          {chain === "robinhood" && evmAddr && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={useConnected}>
              Use connected wallet {short(evmAddr, 6, 4)}
            </button>
          )}
          {featured.map((f) => (
            <button type="button" key={f.wallet} className="btn btn--ghost btn--sm" onClick={() => { setChain("solana"); setWallet(f.wallet); void run(f.wallet, date, "solana"); }}>
              Real holder: {f.symbol} {f.wallet.slice(0, 4)}
            </button>
          ))}
        </div>
      </form>

      {chain === "robinhood" && <EvmPanel onConnected={setEvmAddr} statement={data && data.chain === "robinhood" ? data : null} />}

      <div aria-live="polite" style={{ marginTop: 24, display: "grid", gap: 20 }}>
        {error && <div className="notice notice--bad" role="alert">{error}</div>}
        {loading && !data && <div className="notice"><span className="spin" /> Reading chain data. Each tracked token is verified against its mint account.</div>}
        {data?.note && (
          <div className="notice notice--warn">
            {data.note}
          </div>
        )}
        {data && data.chain === "robinhood" && data.coverage === "CURRENT_ONLY" && (
          <div className="notice notice--warn"><span className="chip chip--unknown">COVERAGE: CURRENT_ONLY</span> {data.coverageReason}</div>
        )}
        {data && data.chain === "solana" && data.holdings.map((h) => (
          <SolanaHolding
            key={h.mint}
            h={h}
            asOfTs={data.asOfTs}
            nowTs={nowTs}
            wallet={data.wallet}
            report={reports[h.mint]}
            onVerify={() => h.bundleJson && verify(h.mint, h.bundleJson)}
            autoVerify={verifyOpen === "auto"}
            open={verifyOpen === h.mint}
            setOpen={(v) => setVerifyOpen(v ? h.mint : null)}
          />
        ))}
        {data && data.chain === "robinhood" && data.holdings.map((r) => (
          <RhHolding key={r.token} r={r} asOfIso={data.asOfIso} report={reports[r.token]} onVerify={() => verify(r.token, r.bundleJson)} />
        ))}
      </div>
    </div>
  );
}

function SolanaHolding({
  h, asOfTs, nowTs, wallet, report, onVerify, autoVerify, open, setOpen,
}: {
  h: Holding; asOfTs: number; nowTs: number; wallet: string; report?: OfflineVerificationReport; onVerify: () => void;
  autoVerify: boolean; open: boolean; setOpen: (v: boolean) => void;
}) {
  const icon = tokenIcon(h.mint);
  const rawUnits = Number(h.asOfRaw ?? h.currentRaw) / 10 ** h.decimals;
  const fromTs = Math.min(asOfTs - 86400 * 14, nowTs - 86400 * 60);
  const verified = h.status === "VERIFIED";
  useEffect(() => {
    if (autoVerify && h.bundleJson && !report) onVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVerify]);
  return (
    <article className="panel holding" aria-label={`${h.symbol} statement`}>
      <div className="holding__head">
        <TokenIcon src={icon} symbol={h.symbol} size={40} />
        <div>
          <h3>{h.symbol}</h3>
          <div className="stack__sub">{h.name}</div>
        </div>
        <span className={chipFor(h.evidence)}>{h.evidence}</span>
        <span className="chip chip--chain">Solana</span>
        {h.category === "PreStocks" && <span className="chip">TOKEN UNITS, not legal shares</span>}
        {h.offlineVerified === true && <span className="chip chip--measured">OFFLINE VERIFIED</span>}
      </div>

      {h.status !== "VERIFIED" && (
        <div className="notice notice--warn">
          <strong className="mono">{h.status}</strong>: {h.reason}
          <div className="stack__sub" style={{ marginTop: 6 }}>Wallet shows today: {trimUnits(h.walletShowsUnits)} {h.symbol}</div>
        </div>
      )}

      {verified && (
        <>
          <div className="wvt">
            <div className="wvt__side" data-active="false">
              <span className="label">What your wallet shows today</span>
              <div className="wvt__num mono"><DigitRoll value={trimUnits(h.walletShowsUnits, 6)} /></div>
              <div className="stack__sub">raw x {trimUnits(h.multiplierNow, 8)} (multiplier in force now)</div>
            </div>
            <div className="wvt__side" data-active="true">
              <span className="label">What you held on {isoDate(asOfTs)}</span>
              <div className="wvt__num mono"><DigitRoll value={trimUnits(h.heldUnits ?? "0", 6)} /></div>
              <div className="stack__sub">raw {trimUnits((Number(h.asOfRaw) / 10 ** h.decimals).toString(), 6)} x {trimUnits(h.multiplierAtAsOf ?? "", 8)}</div>
            </div>
          </div>
          <TwoHalvesLine intervals={h.timeline} rawUnits={rawUnits} asOfTs={asOfTs} fromTs={fromTs} toTs={nowTs + 86400 * 30} />
          <dl className="kv">
            <dt>Mint</dt><dd className="mono"><a href={solExplorer("address", h.mint)} target="_blank" rel="noreferrer">{h.mint}</a></dd>
            <dt>Token account</dt><dd className="mono"><a href={solExplorer("address", h.tokenAccount)} target="_blank" rel="noreferrer">{short(h.tokenAccount, 8, 8)}</a></dd>
            <dt>Multiplier source</dt>
            <dd className="mono">
              {h.multiplierSource?.startsWith("ACCOUNT_STATE:") ? (
                <>Account state of the mint (live read, MEASURED)</>
              ) : (
                <a href={solExplorer("tx", h.multiplierSource ?? "")} target="_blank" rel="noreferrer">{short(h.multiplierSource ?? "", 10, 10)}</a>
              )}
            </dd>
            <dt>Timeline</dt><dd>{h.timelineDerivation.replace(/_/g, " ").toLowerCase()}{h.consistent === true ? ", replay reproduces live state" : h.consistent === false ? ", replay differs from live state" : ""}</dd>
            <dt>Statement hash</dt><dd className="hash">{h.statement?.statementHash}</dd>
          </dl>
          <div className="row" style={{ alignItems: "center" }}>
            <button className="btn btn--ghost btn--sm" onClick={() => { setOpen(!open); if (!report) onVerify(); }}>
              {open ? "Hide offline check" : "Check it offline"}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => h.bundleJson && download(`colophon-${h.symbol}-${isoDate(asOfTs)}.bundle.json`, h.bundleJson)}>
              Export bundle
            </button>
          </div>
          {(open || autoVerify) && report && (
            <div className={`notice ${report.passed ? "notice--good" : "notice--bad"}`} data-testid="verify-report">
              <strong className="mono">{report.passed ? "PASS" : "FAIL"}</strong> {report.checks.length} checks re-run in your browser, no network.
              <ul className="mono" style={{ fontSize: 12, margin: "8px 0 0", paddingLeft: 18 }}>
                {report.checks.map((c) => (
                  <li key={c.checkId}>{c.passed ? "ok" : "FAIL"} {c.name}</li>
                ))}
              </ul>
            </div>
          )}
          {h.statement && (
            <AnchorPanel
              statementHash={h.statement.statementHash}
              evidenceRoot={h.statement.evidenceRoot ?? ""}
              mint={h.mint}
              asOfTs={Number(h.statement.asOfTs)}
              symbol={h.symbol}
            />
          )}
        </>
      )}
      <span className="sr-only" hidden>{wallet}</span>
    </article>
  );
}

function RhHolding({ r, asOfIso, report, onVerify }: { r: RhRow; asOfIso: string; report?: OfflineVerificationReport; onVerify: () => void }) {
  return (
    <article className="panel holding" aria-label={`${r.symbol} statement`}>
      <div className="holding__head">
        <TokenIcon src={r.logoUrl} symbol={r.symbol} size={40} />
        <div><h3>{r.symbol}</h3><div className="stack__sub">{r.name}</div></div>
        <span className="chip chip--measured">MEASURED</span>
        <span className="chip chip--chain">Robinhood Chain</span>
        {r.offlineVerified && <span className="chip chip--measured">OFFLINE VERIFIED</span>}
      </div>
      <div className="wvt">
        <div className="wvt__side" data-active="false">
          <span className="label">Raw token balance</span>
          <div className="wvt__num mono"><DigitRoll value={trimUnits((Number(r.rawBalance) / 10 ** r.decimals).toString(), 6)} /></div>
          <div className="stack__sub">balanceOf, unscaled</div>
        </div>
        <div className="wvt__side" data-active="true">
          <span className="label">Shares on {asOfIso.slice(0, 10)}</span>
          <div className="wvt__num mono"><DigitRoll value={trimUnits(r.heldUnits, 6)} /></div>
          <div className="stack__sub">raw x uiMultiplier {trimUnits(r.uiMultiplier, 12)}</div>
        </div>
      </div>
      <dl className="kv">
        <dt>Token</dt><dd className="mono"><a href={rhExplorer("address", r.token)} target="_blank" rel="noreferrer">{r.token}</a></dd>
        <dt>Read at block</dt><dd className="mono">{r.block}</dd>
        <dt>Statement hash</dt><dd className="hash">{r.statement.statementHash}</dd>
      </dl>
      <div className="row">
        <button className="btn btn--ghost btn--sm" onClick={onVerify}>Check it offline</button>
        <button className="btn btn--ghost btn--sm" onClick={() => download(`colophon-${r.symbol}-robinhood.bundle.json`, r.bundleJson)}>Export bundle</button>
      </div>
      {report && (
        <div className={`notice ${report.passed ? "notice--good" : "notice--bad"}`}>
          <strong className="mono">{report.passed ? "PASS" : "FAIL"}</strong> {report.checks.length} checks re-run in your browser.
        </div>
      )}
    </article>
  );
}

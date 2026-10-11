import Image from "next/image";
import Link from "next/link";
import { HeadlineBlur } from "@/components/motion/HeadlineBlur";
import { LedgerCircuit } from "@/components/motion/LedgerCircuit";
import { CardStack, PrintedStatement, TickerMarquee, WalletVsTruth, type PrintLine } from "@/components/motion/Landing";
import { ChainSplit } from "@/components/motion/TwoHalvesLine";
import { featuredStatement, robinhoodCount, snapshotRows } from "@/server/featured";
import { trimUnits, tokenIcon } from "@/lib/format";
import type { Holding } from "@/lib/types";
import probe from "@/data/generated/probe.json";

type ProbeRow = { tool: string; symbol: string; reports: string; kernel: string; verdict: string; at: string };

export default function Home() {
  const rows = snapshotRows();
  const stmt = featuredStatement();
  const rh = robinhoodCount();
  const real = stmt?.holdings.find((h) => h.status === "VERIFIED") as Holding | undefined;

  const diverging = rows.filter((r) => r.diverges).sort((a, b) => Math.abs(Number(b.active) - Number(b.stale)) - Math.abs(Number(a.active) - Number(a.stale)));
  const cards = (diverging.length ? diverging : rows).slice(0, 3).map((r) => ({
    symbol: r.symbol,
    icon: tokenIcon(r.mint),
    line: r.category === "PreStocks" ? "TOKEN UNITS" : "SHARES",
    big: `${trimUnits(r.active, 6)}x`,
    sub: `stored field ${trimUnits(r.stale, 6)}x`,
  }));
  const ticker = rows.slice(0, 40).map((r) => ({ symbol: r.symbol, icon: tokenIcon(r.mint), multiplier: trimUnits(r.active, 6), chain: "Solana" }));

  // Story numbers: real holder when available, otherwise a labelled illustration on a real mint.
  const ill = diverging[0] ?? rows[0];
  const story = real
    ? {
        symbol: real.symbol,
        mint: real.mint,
        stale: real.staleField,
        active: real.multiplierNow,
        walletShows: trimUnits(((Number(real.currentRaw) / 10 ** real.decimals) * Number(real.staleField)).toFixed(6), 6),
        truth: trimUnits(real.walletShowsUnits, 6),
        wallet: stmt!.wallet,
        evidence: "MEASURED",
      }
    : {
        symbol: ill.symbol,
        mint: ill.mint,
        stale: ill.stale,
        active: ill.active,
        walletShows: trimUnits((100 * Number(ill.stale)).toFixed(6), 6),
        truth: trimUnits((100 * Number(ill.active)).toFixed(6), 6),
        wallet: "illustration: 100 tokens",
        evidence: "SYNTHETIC",
      };

  const printLines: PrintLine[] = real?.statement
    ? [
        { id: "w", label: "Wallet", value: `${stmt!.wallet.slice(0, 6)}...${stmt!.wallet.slice(-6)}` },
        { id: "t", label: "Token", value: real.symbol },
        { id: "d", label: "As of", value: stmt!.asOfIso.slice(0, 10) },
        { id: "r", label: "Raw balance", value: trimUnits((Number(real.asOfRaw) / 10 ** real.decimals).toString(), 6) },
        { id: "m", label: "Multiplier", value: trimUnits(real.multiplierAtAsOf ?? "", 8) },
        { id: "u", label: "Shares held", value: trimUnits(real.heldUnits ?? "", 6) },
        { id: "e", label: "Evidence", value: real.evidence },
      ]
    : [
        { id: "t", label: "Token", value: story.symbol },
        { id: "r", label: "Raw balance (illustration)", value: "100" },
        { id: "m", label: "Multiplier in force", value: trimUnits(story.active, 8) },
        { id: "u", label: "Shares", value: story.truth },
        { id: "e", label: "Evidence", value: "SYNTHETIC" },
      ];
  const bundleHash = real?.statement?.statementHash ?? "0".repeat(16);
  const probeRows = (probe as { rows: ProbeRow[] }).rows;

  return (
    <>
      <section className="hero" id="top">
        <div className="hero__img" data-busy>
          <Image src="/photo/hero.jpg" alt="" fill priority sizes="100vw" />
        </div>
        <div className="wrap hero__inner">
          <div className="hero__copy" data-safe>
            <span className="eyebrow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/solana-logomark.svg" alt="" width={16} height={14} /> Solana · Robinhood{" "}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/robinhood-logomark.svg" alt="" width={16} height={16} style={{ borderRadius: 4 }} />
            </span>
            <HeadlineBlur text="Your stock tokens changed while you weren't looking. Colophon shows what you actually held." />
            <p className="lede">
              Raw token balances never move when a multiplier changes. Colophon reconstructs the multiplier history, prints the statement,
              and lets anyone re-check it offline.
            </p>
            <div className="hero__actions">
              <Link className="btn" href="/try">Open a real statement</Link>
              <Link className="btn btn--ghost" href="/tour">See how it works</Link>
            </div>
          </div>
          <CardStack cards={cards} />
        </div>
      </section>

      <TickerMarquee items={ticker} />

      <section className="block" id="problem">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">The problem in one gesture</span>
            <h2>The same balance reads two ways.</h2>
            <p className="lede">
              Token-2022 stores a multiplier, a new multiplier and the time it takes effect. The stored field is never rolled forward on its own,
              so a reader that stops at it is wrong the moment the effective time passes.
            </p>
          </div>
          <WalletVsTruth
            symbol={story.symbol}
            icon={tokenIcon(story.mint)}
            walletShows={story.walletShows}
            truth={story.truth}
            staleMultiplier={trimUnits(story.stale, 8)}
            activeMultiplier={trimUnits(story.active, 8)}
            wallet={story.wallet}
            mint={story.mint}
          />
          {story.evidence === "SYNTHETIC" && (
            <p className="label" style={{ marginTop: 12 }}>SYNTHETIC amount on a real mint. Open /try for a real holder.</p>
          )}
        </div>
      </section>

      <section className="block" id="how">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">How it works</span>
            <h2>Reads flow through one kernel.</h2>
          </div>
          <LedgerCircuit />
        </div>
      </section>

      <PrintedStatement lines={printLines} bundleHash={bundleHash} />

      <section className="block">
        <div className="wrap grid2">
          <div className="sec-head">
            <span className="label">Tolu, Lagos (illustrative)</span>
            <h2>One page his accountant can re-check.</h2>
            <p>
              Tolu bought SPYx and NVDAx on Solana last year and some TSLA stock tokens on Robinhood Chain. His accountant asks what he held on
              31 December. His wallets show today&apos;s numbers, adjusted by multipliers that changed since. Colophon answers in one page, with the
              source transaction behind every line, and the accountant verifies it offline without trusting Colophon.
            </p>
          </div>
          <div className="photo-band" data-busy>
            <Image src="/photo/ledger.jpg" alt="" fill sizes="(max-width: 860px) 100vw, 560px" style={{ objectFit: "cover" }} />
          </div>
        </div>
      </section>

      <section className="block" id="chains">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">Two chains, one primitive</span>
            <h2>Two implementations. One kernel.</h2>
          </div>
          <ChainSplit
            solana={{ rows: rows.length, label: "The balance never changes, the multiplier does. Pending changes are scheduled by timestamp." }}
            robinhood={{ rows: rh ?? 0, label: "The same idea behind an ERC-20 balanceOf and a view function." }}
          />
        </div>
      </section>

      <section className="block" id="probe">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">Compatibility probe</span>
            <h2>Who reads these tokens wrong.</h2>
            <p className="lede">Every row is a real response with a timestamp. Nothing was sent to any network.</p>
          </div>
          {probeRows.length === 0 ? (
            <div className="notice notice--warn">The probe has not been run for this deployment. Run <span className="mono">node scripts/probe-compat.mjs</span>.</div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead><tr><th>Tool</th><th>Token</th><th>Reports</th><th>Kernel</th><th>Verdict</th><th>At</th></tr></thead>
                <tbody>
                  {probeRows.map((r, i) => (
                    <tr key={i}>
                      <td className="mono">{r.tool}</td><td className="mono">{r.symbol}</td><td className="mono">{r.reports}</td>
                      <td className="mono">{r.kernel}</td><td><span className={`chip ${r.verdict === "AGREES" ? "chip--measured" : "chip--replayed"}`}>{r.verdict.replace(/_/g, " ")}</span></td>
                      <td className="mono">{r.at.slice(0, 19)}Z</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="block">
        <div className="wrap grid2">
          <div className="panel">
            <span className="label">For developers</span>
            <h3 style={{ margin: "10px 0 14px" }}>One call, point in time.</h3>
            <pre className="mono" style={{ margin: 0, overflowX: "auto", fontSize: 13 }}>{`curl -s -X POST /api/statement \\
  -H 'content-type: application/json' \\
  -d '{"wallet":"<address>","chain":"solana","asOfTs":1767225599}'`}</pre>
            <p style={{ marginTop: 14 }}><a className="mono" href="/openapi.json">openapi.json</a> · <a className="mono" href="/llms.txt">llms.txt</a></p>
          </div>
          <div className="panel">
            <span className="label">Business</span>
            <h3 style={{ margin: "10px 0 14px" }}>Free for holders. Paid for the people who file.</h3>
            <p>Free personal statements on both chains. Pro for accountants and funds: multi-wallet packs and signed year-end exports. API for wallets, tax tools and lenders: point-in-time endpoints, metered.</p>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap" style={{ textAlign: "center", display: "grid", gap: 20, justifyItems: "center" }}>
          <h2>Try it on a real holder. No wallet needed.</h2>
          <div className="hero__actions">
            <Link className="btn" href="/try">Open /try</Link>
            <Link className="btn btn--ghost" href="/testers">Volunteer as a tester</Link>
          </div>
        </div>
      </section>
    </>
  );
}

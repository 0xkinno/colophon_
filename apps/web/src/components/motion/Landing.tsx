"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TokenIcon } from "@/components/TokenIcon";
import { DigitRoll } from "./DigitRoll";

gsap.registerPlugin(ScrollTrigger);

export type TickerItem = { symbol: string; icon: string | null; multiplier: string | null; chain: string };

export function TickerMarquee({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="marquee" aria-label="Live token multipliers">
      <div className="marquee__track">
        {doubled.map((it, i) => (
          <span className="marquee__item" key={i}>
            <TokenIcon src={it.icon} symbol={it.symbol} size={22} />
            {it.symbol}
            <small>{it.multiplier ? `${it.multiplier}x` : "UNKNOWN"}</small>
            <small>{it.chain}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

export type StackCard = { symbol: string; icon: string | null; line: string; big: string; sub: string };

export function CardStack({ cards }: { cards: StackCard[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fan, setFan] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const st = ScrollTrigger.create({ trigger: ref.current, start: "top 70%", onEnter: () => setFan(true) });
    return () => st.kill();
  }, []);
  return (
    <div ref={ref} className="stack" data-fan={fan ? "" : undefined} aria-label="Real token multipliers read from chain">
      {cards.slice(0, 3).map((c) => (
        <div className="stack__card" key={c.symbol}>
          <div className="stack__row">
            <TokenIcon src={c.icon} symbol={c.symbol} size={34} />
            <div>
              <div className="mono" style={{ fontWeight: 700 }}>{c.symbol}</div>
              <div className="stack__sub">{c.line}</div>
            </div>
          </div>
          <div className="stack__big">{c.big}</div>
          <div className="stack__sub">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function WalletVsTruth({
  symbol,
  icon,
  walletShows,
  truth,
  staleMultiplier,
  activeMultiplier,
  wallet,
  mint,
}: {
  symbol: string;
  icon: string | null;
  walletShows: string;
  truth: string;
  staleMultiplier: string;
  activeMultiplier: string;
  wallet: string;
  mint: string;
}) {
  const [truthOn, setTruthOn] = useState(false);
  return (
    <div>
      <div className="row" style={{ marginBottom: 20, alignItems: "center" }}>
        <div className="switch" role="group" aria-label="View">
          <button role="switch" aria-checked={truthOn} onClick={() => setTruthOn((v) => !v)}>
            {truthOn ? "What you actually hold" : "What a stale reader shows"}
          </button>
        </div>
        <span className="chip chip--measured">MEASURED</span>
        <span className="label">real holder, not your wallet</span>
      </div>
      <div className="wvt">
        <div className="wvt__side" data-active={!truthOn}>
          <div className="stack__row"><TokenIcon src={icon} symbol={symbol} size={30} /><span className="label">Reads the multiplier field only</span></div>
          <div className="wvt__num mono"><DigitRoll value={walletShows} /></div>
          <div className="stack__sub">{symbol} x {staleMultiplier} (stored field, never rolled forward)</div>
        </div>
        <div className="wvt__side" data-active={truthOn}>
          <div className="stack__row"><TokenIcon src={icon} symbol={symbol} size={30} /><span className="label">Multiplier in force now</span></div>
          <div className="wvt__num mono"><DigitRoll value={truth} /></div>
          <div className="stack__sub">{symbol} x {activeMultiplier} (newMultiplier, effective time passed)</div>
        </div>
      </div>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 14 }}>
        holder {wallet.slice(0, 6)}...{wallet.slice(-6)} · mint {mint.slice(0, 6)}...{mint.slice(-6)}
      </p>
    </div>
  );
}

export type PrintLine = { id: string; label: string; value: string };

export function PrintedStatement({ lines, bundleHash }: { lines: PrintLine[]; bundleHash: string }) {
  const stage = useRef<HTMLElement>(null);
  const slip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!stage.current || !slip.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      slip.current.style.setProperty("--feed", "1");
      return;
    }
    const st = ScrollTrigger.create({
      trigger: stage.current,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (s) => slip.current?.style.setProperty("--feed", s.progress.toFixed(4)),
    });
    return () => st.kill();
  }, []);
  return (
    <section ref={stage} id="print" className="print-stage" aria-label="A statement printed from real chain data">
      <div className="print-sticky">
        <div className="print-slot" aria-hidden />
        <div ref={slip} className="print-slip" data-safe style={{ ["--feed" as string]: 0 }}>
          {lines.map((l, i) => (
            <div key={l.id} className="print-line" style={{ ["--at" as string]: String((i + 1) / (lines.length + 2)) }}>
              <span>{l.label}</span>
              <span className="mono">{l.value}</span>
            </div>
          ))}
          <div className="print-colophon" style={{ ["--at" as string]: "0.95" }}>
            Sources, method and bundle <span className="mono">{bundleHash.slice(0, 16)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HeadlineBlur } from "./motion/HeadlineBlur";

export type TourStep = {
  title: string;
  headline: string;
  body: string;
  post: { wallet?: string; date?: string; chain?: "solana" | "robinhood" };
};

const DURATION = 7000;

export function LiveTour({ steps, wallet }: { steps: TourStep[]; wallet: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const loaded = useRef(false);
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (n: number) => {
      const next = (n + steps.length) % steps.length;
      setI(next);
      setProgress(0);
      setBusy(true);
      window.setTimeout(() => setBusy(false), 400);
    },
    [steps.length]
  );

  const post = useCallback(
    (n: number) => {
      const s = steps[n];
      frame.current?.contentWindow?.postMessage({ type: "colophon-tour", step: n, ...s.post }, window.location.origin);
    },
    [steps]
  );

  useEffect(() => {
    if (loaded.current) post(i);
  }, [i, post]);

  useEffect(() => {
    if (paused) return;
    const t0 = performance.now() - progress * DURATION;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / DURATION);
      setProgress(p);
      if (p >= 1) go(i + 1);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, paused]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
      if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    let lock = false;
    const wheel = (e: WheelEvent) => {
      if (lock || Math.abs(e.deltaY) < 40) return;
      lock = true;
      go(i + (e.deltaY > 0 ? 1 : -1));
      window.setTimeout(() => (lock = false), 700);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("wheel", wheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("wheel", wheel);
    };
  }, [i, go]);

  const s = steps[i];
  const src = `/statement?embed=1&wallet=${encodeURIComponent(wallet)}`;

  return (
    <div
      className="wrap tour"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      <div style={{ display: "grid", gap: 26 }}>
        <div key={i} data-safe>
          <span className="label">Step {String(i + 1).padStart(2, "0")}</span>
          <HeadlineBlur text={s.headline} className="display" as="h1" />
          <p className="lede" style={{ marginTop: 18 }}>{s.body}</p>
        </div>
        <div className="tour__steps" role="list">
          {steps.map((st, n) => (
            <button key={st.title} className="tour__step" aria-current={n === i ? "step" : undefined} onClick={() => go(n)} role="listitem">
              <span className="mono">{String(n + 1).padStart(2, "0")}</span>
              <span>{st.title}</span>
              <span className="tour__bar" aria-hidden><i style={{ ["--p" as string]: n < i ? "100%" : n === i ? `${progress * 100}%` : "0%" }} /></span>
            </button>
          ))}
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</button>
          <span className="label">Scroll, swipe or use the arrow keys</span>
          <button className="btn btn--ghost btn--sm" aria-label="Previous step" onClick={() => go(i - 1)}>←</button>
          <button className="btn btn--ghost btn--sm" aria-label="Next step" onClick={() => go(i + 1)}>→</button>
        </div>
      </div>
      <div className="tour__frame" data-busy={busy} data-busy-region>
        <iframe
          ref={frame}
          title="The live Colophon statement page"
          src={src}
          onLoad={() => {
            loaded.current = true;
            post(i);
          }}
        />
      </div>
    </div>
  );
}

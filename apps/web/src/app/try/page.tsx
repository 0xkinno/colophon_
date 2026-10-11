import { featuredHolders } from "@/server/featured";
import { StatementClient } from "@/components/StatementClient";

export const metadata = { title: "Try Colophon: a real holder, no wallet" };

export default function TryPage() {
  const hs = featuredHolders();
  const first = hs[0];
  return (
    <div className="wrap page-top" style={{ paddingBottom: 60 }}>
      <div className="sec-head">
        <span className="label">No wallet needed</span>
        <h1 className="display" style={{ fontSize: "clamp(2rem,5vw,3.6rem)" }}>A real holder&apos;s statement.</h1>
        <p className="lede">
          This is a real on-chain address that holds tracked stock tokens. It is labelled <strong>not your wallet</strong>. Change the date to cross a
          multiplier change and watch the share count move by exactly the kernel&apos;s amount.
        </p>
      </div>
      {first ? (
        <StatementClient initialWallet={first.wallet} initialChain="solana" autoRun featured={hs.map((h) => ({ wallet: h.wallet, symbol: h.symbol }))} />
      ) : (
        <div className="notice notice--warn">
          No featured holder has been recorded yet. Run <span className="mono">node scripts/find-holders.mjs</span> or paste any address on{" "}
          <a href="/statement" className="mono">/statement</a>.
        </div>
      )}
    </div>
  );
}

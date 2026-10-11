import { featuredHolders } from "@/server/featured";
import { loadRecovered } from "@/server/recovered";
import { LiveTour, type TourStep } from "@/components/LiveTour";

export const metadata = { title: "Tour | Colophon" };

export default function TourPage() {
  const holders = featuredHolders();
  const rec = loadRecovered();
  const h = holders[0];
  if (!h) {
    return (
      <div className="wrap page-top">
        <div className="notice notice--warn">The tour drives a real holder. No holder has been recorded yet: run <span className="mono">node scripts/find-holders.mjs</span>.</div>
      </div>
    );
  }
  const change = [...rec.events].filter((e) => e.mint === h.mint).sort((a, b) => b.newMultiplierTimestamp - a.newMultiplierTimestamp)[0];
  const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const before = change ? day(change.newMultiplierTimestamp - 86400) : undefined;
  const after = change ? day(change.newMultiplierTimestamp + 86400) : today;
  const steps: TourStep[] = [
    { title: "Your wallet", headline: "A wallet shows today's number.", body: "This is a real holder, not your wallet. The raw token balance is exact. The multiplier in force decides what it is worth in shares.", post: { wallet: h.wallet, date: today, chain: "solana" } },
    { title: "The multiplier changed", headline: "Then the multiplier moved.", body: before ? `One recovered update took effect on ${after}. Moving the date to ${before} shows the holding before it.` : "No update is recorded for this mint in the scanned window. The statement uses the live account state.", post: { wallet: h.wallet, date: before ?? today } },
    { title: "Your statement", headline: "The statement prints the difference.", body: "Shares held on the chosen date, the raw balance, the multiplier and the transaction it came from.", post: { wallet: h.wallet, date: after } },
    { title: "Check it offline", headline: "Anyone can re-check it.", body: "Every hash, ordering rule and balance is recomputed in the browser with no network. Change one byte and it fails.", post: { wallet: h.wallet, date: after } },
    { title: "Two chains", headline: "Same kernel on Robinhood Chain.", body: "ERC-8056 stock tokens expose uiMultiplier(). The statement page switches chain and uses the same verifier.", post: { chain: "robinhood" } },
  ];
  return <LiveTour steps={steps} wallet={h.wallet} />;
}

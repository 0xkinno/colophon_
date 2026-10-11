import { StatementClient } from "@/components/StatementClient";

export const metadata = { title: "Statement | Colophon" };

export default function StatementPage({ searchParams }: { searchParams: { wallet?: string; date?: string; chain?: string; embed?: string } }) {
  const chain = searchParams.chain === "robinhood" ? "robinhood" : "solana";
  const embed = searchParams.embed === "1";
  return (
    <div className={embed ? "embed" : ""}>
      <div className="wrap page-top" style={{ paddingBottom: 60 }}>
        {!embed && (
          <div className="sec-head">
            <span className="label">Statement</span>
            <h1 className="display" style={{ fontSize: "clamp(2rem,5vw,3.6rem)" }}>What you actually held.</h1>
            <p className="lede">Paste or connect a wallet, pick a chain and a date. Every line links to the transaction or account state behind it.</p>
          </div>
        )}
        <StatementClient
          initialWallet={searchParams.wallet ?? ""}
          initialDate={searchParams.date ?? ""}
          initialChain={chain}
          autoRun={Boolean(searchParams.wallet)}
        />
      </div>
    </div>
  );
}

import lab from "@/data/generated/lab.json";
import { solExplorer } from "@/lib/format";

export const metadata = { title: "Lab | Colophon" };

type Case = {
  question: string;
  answer: string;
  mint?: string;
  signatures?: Record<string, string>;
  [k: string]: unknown;
};

const ORDER = ["C1", "C2", "C3", "C4", "C5", "C6"];

export default function LabPage() {
  const cases = (lab as unknown as { cases: Record<string, Case>; startedAt?: string }).cases;
  const have = ORDER.filter((k) => cases[k]);
  return (
    <div className="wrap page-top" style={{ paddingBottom: 60 }}>
      <div className="sec-head">
        <span className="label">Semantic lab, Solana devnet</span>
        <h1 className="display" style={{ fontSize: "clamp(2rem,5vw,3.6rem)" }}>What the program really does.</h1>
        <p className="lede">
          Each case is a real devnet transaction on a Token-2022 mint with ScaledUiAmount. The answers below set the replay rules the kernel
          uses on mainnet history.
        </p>
      </div>
      {have.length === 0 && <div className="notice notice--warn">No lab run is recorded. Run <span className="mono">pnpm lab</span>.</div>}
      <div style={{ display: "grid", gap: 16 }}>
        {have.map((k) => {
          const c = cases[k];
          return (
            <article className="panel" key={k}>
              <div className="row" style={{ alignItems: "center" }}>
                <span className="chip chip--measured">{k} MEASURED</span>
                <h3 style={{ fontSize: "1.1rem" }}>{c.question}</h3>
              </div>
              <p style={{ margin: "12px 0" }}><strong>{c.answer}</strong></p>
              <div className="row" style={{ gap: 8 }}>
                {Object.entries(c.signatures ?? {}).map(([name, sig]) => (
                  <a key={name} className="chip mono" href={solExplorer("tx", sig, "devnet")} target="_blank" rel="noreferrer">
                    {name} {sig.slice(0, 8)}...
                  </a>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

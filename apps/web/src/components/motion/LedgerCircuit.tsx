// Every path has pathLength="1", so dash lengths are fractions of the path.
// A short dash travelling along the path is the packet. Pure CSS, no per-frame JS.
type Wire = { d: string; color: string; stop?: boolean; dur: number; delay: number };

const WIRES: Wire[] = [
  { d: "M 150 90 H 300 V 190 H 420", color: "var(--sol-green)", dur: 3.0, delay: 0 },
  { d: "M 150 310 H 300 V 230 H 420", color: "var(--breach)", dur: 3.0, delay: 1.2, stop: true },
  { d: "M 620 210 H 740 V 100 H 850", color: "var(--flow-blue)", dur: 3.2, delay: 0.4 },
  { d: "M 620 210 H 850", color: "var(--flow-blue)", dur: 3.2, delay: 0.8 },
  { d: "M 620 210 H 740 V 320 H 850", color: "var(--flow-blue)", dur: 3.2, delay: 1.6 },
];

export function LedgerCircuit() {
  return (
    <figure
      className="circuit"
      data-safe
      aria-label="Wallet balances and mint history flow into the kernel. A stale multiplier read is refused. Statements flow out to the statement, the offline verifier and the watch keeper."
    >
      <div className="circuit-h">
        <svg viewBox="0 0 1000 400" role="img">
          {WIRES.map((w, i) => (
            <g key={i} style={{ ["--c" as string]: w.color, ["--dur" as string]: `${w.dur}s`, ["--d" as string]: `${w.delay}s` }}>
              <path d={w.d} pathLength={1} className="wire" />
              <path d={w.d} pathLength={1} className={`beam ${w.stop ? "beam--stop" : ""}`} />
            </g>
          ))}
          <text x="430" y="275" className="refuse">
            REFUSED: stale multiplier
          </text>
        </svg>
        <div className="circuit__node" style={{ left: "1%", top: "22%" }}>
          Your wallet<small>raw units</small>
        </div>
        <div className="circuit__node" style={{ left: "1%", top: "77%" }}>
          Mint history<small>multiplier events</small>
        </div>
        <div className="circuit__node circuit__node--kernel" style={{ left: "42%", top: "52%" }}>
          Kernel<small>shares at time T</small>
        </div>
        <div className="circuit__node" style={{ left: "85%", top: "25%" }}>
          Statement
        </div>
        <div className="circuit__node" style={{ left: "85%", top: "52%" }}>
          Offline verifier
        </div>
        <div className="circuit__node" style={{ left: "85%", top: "80%" }}>
          Watch keeper
        </div>
      </div>
      <div className="circuit-v">
        <div className="node">Your wallet<small>raw units</small></div>
        <div className="link" />
        <div className="node">Mint history<small>multiplier events</small></div>
        <div className="link link--stop" />
        <div className="node node--kernel">Kernel<small>shares at time T. Stale reads are refused.</small></div>
        <div className="link" />
        <div className="node">Statement</div>
        <div className="link" />
        <div className="node">Offline verifier</div>
        <div className="link" />
        <div className="node">Watch keeper</div>
      </div>
      <figcaption>Green reads match the multiplier in force at that moment. Red is a stale read. The kernel refuses it.</figcaption>
    </figure>
  );
}

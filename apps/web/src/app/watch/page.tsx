import { WatchClient } from "./WatchClient";

export const metadata = { title: "Watch | Colophon" };

export default function WatchPage() {
  return (
    <div className="wrap page-top" style={{ paddingBottom: 60 }}>
      <div className="sec-head">
        <span className="label">Watch keeper</span>
        <h1 className="display" style={{ fontSize: "clamp(2rem,5vw,3.6rem)" }}>Every multiplier change on record.</h1>
        <p className="lede">The chain keeps only the current value. This page lists every update Colophon recovered from transaction history, and any change observed since the snapshot.</p>
      </div>
      <WatchClient />
    </div>
  );
}

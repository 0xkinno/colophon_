import { snapshotRows } from "@/server/featured";
import { BoardClient } from "./BoardClient";

export const metadata = { title: "Board | Colophon" };
export const revalidate = 600;

export default function BoardPage() {
  return (
    <div className="wrap page-top" style={{ paddingBottom: 60 }}>
      <div className="sec-head">
        <span className="label">Board</span>
        <h1 className="display" style={{ fontSize: "clamp(2rem,5vw,3.6rem)" }}>Every tracked token, both chains.</h1>
        <p className="lede">Multiplier in force now, the stored field a naive reader sees, and any change already scheduled. Each Solana mint was proven on chain before it was listed.</p>
      </div>
      <BoardClient initial={snapshotRows()} />
    </div>
  );
}

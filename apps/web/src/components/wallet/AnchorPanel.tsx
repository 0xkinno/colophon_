"use client";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { COLOPHON_ANCHOR_PROGRAM_ID } from "@colophon/instruments";
import { solExplorer } from "@/lib/format";

type State = "IDLE" | "SIGNING" | "CONFIRMING" | "ANCHORED" | "VERIFIED" | "FAILED";

const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_COLOPHON_PROGRAM_ID || COLOPHON_ANCHOR_PROGRAM_ID);

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function AnchorPanel({
  statementHash,
  evidenceRoot,
  mint,
  asOfTs,
  symbol,
}: {
  statementHash: string;
  evidenceRoot: string;
  mint: string;
  asOfTs: number;
  symbol: string;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [state, setState] = useState<State>("IDLE");
  const [sig, setSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [pda, setPda] = useState<PublicKey | null>(null);

  useEffect(() => {
    const [p] = PublicKey.findProgramAddressSync([new TextEncoder().encode("colophon_statement"), hexToBytes(statementHash)], PROGRAM_ID);
    setPda(p);
    let live = true;
    connection
      .getAccountInfo(p, "confirmed")
      .then((acc) => {
        if (live && acc && acc.data.length >= 154 && new TextDecoder().decode(acc.data.subarray(0, 8)) === "COLOPHON") {
          if (toHex(acc.data.subarray(72, 104)) === statementHash) {
            setSlot(Number(new DataView(acc.data.buffer, acc.data.byteOffset).getBigUint64(144, true)));
            setState("VERIFIED");
          }
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [statementHash, connection]);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    let live = true;
    connection.getBalance(publicKey, "confirmed").then((b) => live && setBalance(b / LAMPORTS_PER_SOL)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [publicKey, connection, state]);

  const airdrop = useCallback(async () => {
    if (!publicKey) return;
    try {
      const s = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(s, "confirmed");
      setBalance((await connection.getBalance(publicKey, "confirmed")) / LAMPORTS_PER_SOL);
    } catch (e) {
      setErr(`Devnet faucet refused: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
    }
  }, [publicKey, connection]);

  const anchor = useCallback(async () => {
    if (!publicKey || !pda) return;
    setErr(null);
    setState("SIGNING");
    try {
      const data = new Uint8Array(106);
      data[0] = 0;
      data.set(hexToBytes(statementHash), 1);
      data.set(new PublicKey(mint).toBytes(), 33);
      data.set(hexToBytes(evidenceRoot.padEnd(64, "0").slice(0, 64)), 65);
      new DataView(data.buffer).setBigInt64(97, BigInt(asOfTs), true);
      data[105] = 1;
      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(data),
      });
      const tx = new Transaction().add(ix);
      const s = await sendTransaction(tx, connection, { preflightCommitment: "confirmed" });
      setSig(s);
      setState("CONFIRMING");
      const c = await connection.confirmTransaction(s, "confirmed");
      if (c.value.err) throw new Error(`Transaction failed: ${JSON.stringify(c.value.err)}`);
      setState("ANCHORED");
      const acc = await connection.getAccountInfo(pda, "confirmed");
      if (acc && toHex(acc.data.subarray(72, 104)) === statementHash) {
        setSlot(Number(new DataView(acc.data.buffer, acc.data.byteOffset).getBigUint64(144, true)));
        setState("VERIFIED");
      } else {
        throw new Error("Read back from the statement account did not match the statement hash.");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(/reject|denied|cancel/i.test(m) ? "Signature rejected in the wallet." : m.slice(0, 200));
      setState("FAILED");
    }
  }, [publicKey, pda, statementHash, mint, evidenceRoot, asOfTs, sendTransaction, connection]);

  const labels: Record<State, string> = {
    IDLE: "Anchor on Solana devnet",
    SIGNING: "Waiting for signature",
    CONFIRMING: "Confirming",
    ANCHORED: "Reading back",
    VERIFIED: "Anchored and verified",
    FAILED: "Retry anchor",
  };

  return (
    <div className="notice" data-testid="anchor-panel" style={{ display: "grid", gap: 12 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <strong className="mono">Anchor {symbol} statement on devnet</strong>
        <span className={`chip ${state === "VERIFIED" ? "chip--measured" : ""}`}>{state}</span>
      </div>
      <div className="hash">program {PROGRAM_ID.toBase58()} · statement account {pda?.toBase58() ?? "deriving"}</div>
      <div className="row" style={{ alignItems: "center" }}>
        <WalletMultiButton />
        {publicKey && (balance ?? 0) < 0.01 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={airdrop}>
            Request 1 devnet SOL
          </button>
        )}
        <button type="button" className="btn btn--purple btn--sm" disabled={!publicKey || state === "SIGNING" || state === "CONFIRMING" || state === "VERIFIED"} onClick={anchor}>
          {labels[state]}
        </button>
        {balance !== null && <span className="mono" style={{ fontSize: 12 }}>{balance.toFixed(4)} SOL</span>}
      </div>
      {sig && (
        <div className="mono" style={{ fontSize: 13 }}>
          tx <a href={solExplorer("tx", sig, "devnet")} target="_blank" rel="noreferrer">{sig.slice(0, 20)}...</a>
          {slot ? ` · slot ${slot}` : ""}
        </div>
      )}
      {state === "VERIFIED" && !sig && slot && <div className="mono" style={{ fontSize: 13 }}>Already anchored at slot {slot}. The account holds this exact statement hash.</div>}
      {err && <div className="notice notice--bad" role="alert">{err}</div>}
    </div>
  );
}

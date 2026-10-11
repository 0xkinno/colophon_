import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "@colophon/instruments";
import { buildStatements } from "@/server/statement";
import { rpcCall } from "@/server/rpc";

export const runtime = "nodejs";
export const maxDuration = 60;

const HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,accept-encoding",
  "access-control-expose-headers": "X-Action-Version,X-Blockchain-Ids",
  "x-action-version": "2.1.3",
  "x-blockchain-ids": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "content-type": "application/json",
};

function origin(req: Request) {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}

export async function GET(req: Request) {
  const base = origin(req);
  const q = new URL(req.url).searchParams;
  const wallet = q.get("wallet");
  const date = q.get("date");
  let description =
    "Your stock tokens change through a multiplier. Enter any Solana wallet and a date to get the share count that wallet actually held, with the source transaction behind it.";
  if (wallet) {
    try {
      const asOf = date ? Math.floor(new Date(date).getTime() / 1000) : undefined;
      const s = await buildStatements(wallet, Number.isFinite(asOf) ? asOf : undefined);
      description = s.holdings.length
        ? s.holdings
            .slice(0, 5)
            .map((h) => `${h.symbol}: ${h.heldUnits ?? "UNKNOWN"} held on ${s.asOfIso.slice(0, 10)} (wallet shows ${h.walletShowsUnits})`)
            .join(" | ")
        : s.note ?? "No tracked stock tokens.";
    } catch (e) {
      description = `Statement unavailable: ${e instanceof Error ? e.message : "error"}`;
    }
  }
  const body = {
    type: "action",
    icon: `${base}/brand/colophon-blink.png`,
    title: "Colophon statement",
    description,
    label: "Statement",
    links: {
      actions: [
        {
          type: "transaction",
          label: "Record statement hash",
          href: `${base}/api/actions/statement?wallet={wallet}&date={date}`,
          parameters: [
            { name: "wallet", label: "Wallet address", required: true },
            { name: "date", label: "Date (YYYY-MM-DD)", required: true },
          ],
        },
      ],
    },
  };
  return new Response(JSON.stringify(body), { headers: HEADERS });
}

export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const wallet = q.get("wallet");
  const date = q.get("date");
  const body = (await req.json().catch(() => ({}))) as { account?: string };
  if (!body.account || !wallet || !date) {
    return new Response(JSON.stringify({ message: "account, wallet and date are required" }), { status: 400, headers: HEADERS });
  }
  const asOf = Math.floor(new Date(date).getTime() / 1000);
  if (!Number.isFinite(asOf)) {
    return new Response(JSON.stringify({ message: "date must be YYYY-MM-DD" }), { status: 400, headers: HEADERS });
  }
  try {
    const s = await buildStatements(wallet, asOf);
    const first = s.holdings.find((h) => h.status === "VERIFIED");
    if (!first || !first.statement) {
      return new Response(JSON.stringify({ message: s.note ?? "No verifiable holding for that date." }), { status: 422, headers: HEADERS });
    }
    const hash = (first.statement as { statementHash: string }).statementHash;
    const payer = new PublicKey(body.account);
    const bh = await rpcCall<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "finalized" }]);
    const tx = new Transaction({ feePayer: payer, recentBlockhash: bh.value.blockhash }).add(
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
        data: Buffer.from(`colophon:statement:${hash}`, "utf8"),
      })
    );
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    return new Response(
      JSON.stringify({ type: "transaction", transaction: serialized, message: `Recorded statement ${hash.slice(0, 12)} for ${first.symbol}` }),
      { headers: HEADERS }
    );
  } catch (e) {
    return new Response(JSON.stringify({ message: e instanceof Error ? e.message : "failed" }), { status: 502, headers: HEADERS });
  }
}

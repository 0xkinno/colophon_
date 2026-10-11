// Phase C: semantic lab on Solana devnet. Every case is a real transaction; signatures are written to
// evidence/semantic_lab/e2_boundary_lab.json. Requires DEPLOYER_PRIVATE_KEY in .env.local (devnet only).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { ROOT, loadEnv } from "./lib/solana-rpc.mjs";

loadEnv();
const RPC = process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const secret = JSON.parse(String(process.env.DEPLOYER_PRIVATE_KEY));
const payer = Keypair.fromSecretKey(Uint8Array.from(secret));

const f64 = (v) => {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(v);
  return b;
};
const i64 = (v) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(v));
  return b;
};
const u64 = (v) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
};

const MINT_SPACE = 165 + 1 + 4 + 56;

async function now() {
  const slot = await conn.getSlot("confirmed");
  return (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
}

const ixInitScaled = (mint, authority, mult) =>
  new TransactionInstruction({
    programId: TOKEN_2022,
    keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
    data: Buffer.concat([Buffer.from([43, 0]), authority.toBuffer(), f64(mult)]),
  });
const ixInitMint2 = (mint, decimals, auth) =>
  new TransactionInstruction({
    programId: TOKEN_2022,
    keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
    data: Buffer.concat([Buffer.from([20, decimals]), auth.toBuffer(), Buffer.from([0, 0, 0, 0])]),
  });
const ixUpdate = (mint, authority, mult, eff) =>
  new TransactionInstruction({
    programId: TOKEN_2022,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([43, 1]), f64(mult), i64(eff)]),
  });
const ixAmountToUi = (mint, amount) =>
  new TransactionInstruction({ programId: TOKEN_2022, keys: [{ pubkey: mint, isSigner: false, isWritable: false }], data: Buffer.concat([Buffer.from([23]), u64(amount)]) });

function ata(owner, mint) {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_2022.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];
}

async function send(ixs, signers = []) {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(conn, tx, [payer, ...signers], { commitment: "confirmed" });
}

async function newMint(decimals, mult, supplyRaw) {
  const kp = Keypair.generate();
  const rent = await conn.getMinimumBalanceForRentExemption(MINT_SPACE);
  const sig = await send(
    [
      SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: kp.publicKey, lamports: rent, space: MINT_SPACE, programId: TOKEN_2022 }),
      ixInitScaled(kp.publicKey, payer.publicKey, mult),
      ixInitMint2(kp.publicKey, decimals, payer.publicKey),
    ],
    [kp]
  );
  const a = ata(payer.publicKey, kp.publicKey);
  const createAta = new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: a, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: false },
      { pubkey: kp.publicKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
  const mintTo = new TransactionInstruction({
    programId: TOKEN_2022,
    keys: [
      { pubkey: kp.publicKey, isSigner: false, isWritable: true },
      { pubkey: a, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([14]), u64(supplyRaw), Buffer.from([decimals])]),
  });
  const sig2 = await send([createAta, mintTo]);
  return { mint: kp.publicKey, ata: a, createSig: sig, mintSig: sig2 };
}

async function readState(mint) {
  const acc = await conn.getParsedAccountInfo(mint, "confirmed");
  const ext = acc.value.data.parsed.info.extensions.find((e) => e.extension === "scaledUiAmountConfig").state;
  return { multiplier: ext.multiplier, newMultiplier: ext.newMultiplier, newMultiplierEffectiveTimestamp: Number(ext.newMultiplierEffectiveTimestamp), slot: acc.context.slot };
}

async function simulateUi(mint, amount) {
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: (await conn.getLatestBlockhash()).blockhash }).add(ixAmountToUi(mint, amount));
  const r = await conn.simulateTransaction(tx);
  const rd = r.value.returnData;
  const text = rd ? Buffer.from(rd.data[0], "base64").toString("utf8") : null;
  const bt = (await conn.getBlockTime(r.context.slot).catch(() => null)) ?? null;
  return { ui: text, slot: r.context.slot, blockTime: bt, err: r.value.err };
}

async function balanceUi(account) {
  const b = await conn.getTokenAccountBalance(account, "confirmed");
  return { uiAmountString: b.value.uiAmountString, amount: b.value.amount };
}

const out = { cluster: "devnet", rpc: RPC.replace(/api-key=.*/, "api-key=REDACTED"), payer: payer.publicKey.toBase58(), startedAt: new Date().toISOString(), cases: {} };
const explorer = (s) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

// C1 + C6: schedule a change, read before and after effect, read balance during the pending window.
{
  const m = await newMint(6, 1.0, 1_000_000_000n);
  const t0 = await now();
  const eff = t0 + 40;
  const sSched = await send([ixUpdate(m.mint, payer.publicKey, 2.0, eff)]);
  const during = { state: await readState(m.mint), ui: await simulateUi(m.mint, 1_000_000_000n), balance: await balanceUi(m.ata) };
  while ((await now()) < eff + 3) await sleep(1500);
  const after = { state: await readState(m.mint), ui: await simulateUi(m.mint, 1_000_000_000n), balance: await balanceUi(m.ata) };
  out.cases.C1 = {
    question: "Does multiplier ever roll forward by itself after the effective time?",
    mint: m.mint.toBase58(),
    signatures: { create: m.createSig, mint: m.mintSig, schedule: sSched },
    explorer: explorer(sSched),
    effectiveAt: eff,
    during,
    after,
    answer: after.state.multiplier === during.state.multiplier ? "NO: the multiplier field stays at the old value; newMultiplier is the one in force." : "YES: multiplier rolled forward.",
  };
  out.cases.C6 = {
    question: "What does getTokenAccountBalance show during the pending window?",
    signatures: { schedule: sSched },
    explorer: explorer(sSched),
    duringPending: during.balance,
    programUiDuringPending: during.ui.ui,
    afterEffective: after.balance,
    programUiAfterEffective: after.ui.ui,
  };
}

// C2: sample the program's amountToUiAmount around the effective instant.
{
  const m = await newMint(6, 1.0, 1_000_000_000n);
  const t0 = await now();
  const eff = t0 + 30;
  const sSched = await send([ixUpdate(m.mint, payer.publicKey, 3.0, eff)]);
  const samples = [];
  while ((await now()) < eff + 3) {
    const s = await simulateUi(m.mint, 1_000_000_000n);
    samples.push({ ui: s.ui, blockTime: s.blockTime, slot: s.slot, relative: s.blockTime === null ? null : s.blockTime - eff });
    await sleep(350);
  }
  const first = samples.find((s) => s.ui && Number(s.ui) >= 2999);
  out.cases.C2 = {
    question: "Is the boundary >= or > at the effective timestamp?",
    mint: m.mint.toBase58(),
    signatures: { create: m.createSig, mint: m.mintSig, schedule: sSched },
    explorer: explorer(sSched),
    effectiveAt: eff,
    firstScaledSample: first ?? null,
    samples,
    answer: first && first.relative !== null ? (first.relative === 0 ? "AT_OR_AFTER (>=): scaled value appears when blockTime equals the effective timestamp." : first.relative > 0 ? "AFTER (>): scaled value appears only after the timestamp." : "EARLIER than timestamp: sampling clock skew.") : "UNKNOWN: no sample crossed the boundary.",
  };
}

// C3: schedule A, then B before A takes effect.
{
  const m = await newMint(6, 1.0, 1_000_000_000n);
  const t0 = await now();
  const sA = await send([ixUpdate(m.mint, payer.publicKey, 7.0, t0 + 3600)]);
  const afterA = await readState(m.mint);
  const sB = await send([ixUpdate(m.mint, payer.publicKey, 9.0, t0 + 7200)]);
  const afterB = await readState(m.mint);
  out.cases.C3 = {
    question: "After A then B before A takes effect, is A recoverable from state at all?",
    mint: m.mint.toBase58(),
    signatures: { create: m.createSig, mint: m.mintSig, A: sA, B: sB },
    explorerA: explorer(sA),
    explorerB: explorer(sB),
    afterA,
    afterB,
    answer:
      Number(afterB.newMultiplier) === 9 && Number(afterB.multiplier) !== 7
        ? "NO: state holds only B. A exists only in transaction history. Recovering history from transactions is required."
        : "A is still visible in state.",
  };
}

// C4: let A take effect, then schedule B.
{
  const m = await newMint(6, 1.0, 1_000_000_000n);
  const t0 = await now();
  const effA = t0 + 25;
  const sA = await send([ixUpdate(m.mint, payer.publicKey, 5.0, effA)]);
  while ((await now()) < effA + 3) await sleep(1500);
  const beforeB = await readState(m.mint);
  const sB = await send([ixUpdate(m.mint, payer.publicKey, 6.0, (await now()) + 3600)]);
  const afterB = await readState(m.mint);
  out.cases.C4 = {
    question: "After A took effect and B is scheduled, does multiplier become A?",
    mint: m.mint.toBase58(),
    signatures: { create: m.createSig, mint: m.mintSig, A: sA, B: sB },
    explorerA: explorer(sA),
    explorerB: explorer(sB),
    beforeB,
    afterB,
    answer: Number(afterB.multiplier) === 5 ? "YES: multiplier rolls to A when B is scheduled (ACTIVE_AT_SUBMIT)." : `NO: multiplier is ${afterB.multiplier} after B.`,
    rollPolicy: Number(afterB.multiplier) === 5 ? "ACTIVE_AT_SUBMIT" : "OTHER",
  };
}

// C5: non-representable multiplier on a very large raw amount.
{
  const decimals = 0;
  const raw = 9_007_199_254_740_993n; // 2^53 + 1
  const m = await newMint(decimals, 1.0000000000000002, raw);
  const ui = await simulateUi(m.mint, raw);
  const exact = (raw * 10000000000000002n) / 10000000000000000n;
  out.cases.C5 = {
    question: "f64 rounding versus exact decimal for a large raw amount",
    mint: m.mint.toBase58(),
    signatures: { create: m.createSig, mint: m.mintSig },
    explorer: explorer(m.mintSig),
    raw: raw.toString(),
    multiplierF64: 1.0000000000000002,
    programUi: ui.ui,
    exactDecimalFloor: exact.toString(),
    answer: ui.ui === exact.toString() ? "EXACT: program output equals exact decimal." : `DIFFERS: program ${ui.ui} vs exact ${exact}. Float arithmetic loses units at this size.`,
  };
}

out.finishedAt = new Date().toISOString();
mkdirSync(join(ROOT, "evidence", "semantic_lab"), { recursive: true });
writeFileSync(join(ROOT, "evidence", "semantic_lab", "e2_boundary_lab.json"), JSON.stringify(out, null, 2));
writeFileSync(join(ROOT, "apps", "web", "src", "data", "generated", "lab.json"), JSON.stringify(out));
process.stderr.write("lab done\n");

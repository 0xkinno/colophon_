// Finds real wallets that hold universe tokens, using transactions already fetched during history recovery:
// the recipients of issuer transfers. Each candidate is re-verified live. Output: data/featured-holders.json
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadEnv, makeRpc } from "./lib/solana-rpc.mjs";

loadEnv();
const rpc = makeRpc(process.env.SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com", { minGapMs: 120 });
const u = JSON.parse(readFileSync(join(ROOT, "data", "universe.solana.json"), "utf8"));
const byMint = new Map(u.mints.map((m) => [m.mint, m]));
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const dir = join(ROOT, "data", "cache", "tx");

const cands = new Map(); // wallet -> {mint, tokenAccount, blockTime}
for (const f of readdirSync(dir)) {
  let tx;
  try {
    tx = JSON.parse(readFileSync(join(dir, f), "utf8"));
  } catch {
    continue;
  }
  if (!tx?.meta || tx.meta.err) continue;
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
  for (const post of tx.meta.postTokenBalances ?? []) {
    if (!byMint.has(post.mint) || !post.owner) continue;
    const pre = (tx.meta.preTokenBalances ?? []).find((p) => p.accountIndex === post.accountIndex);
    const gained = BigInt(post.uiTokenAmount.amount) - BigInt(pre?.uiTokenAmount.amount ?? "0");
    if (gained <= 0n) continue;
    if (!cands.has(post.owner)) cands.set(post.owner, { mint: post.mint, tokenAccount: keys[post.accountIndex], blockTime: tx.blockTime });
  }
}
process.stderr.write(`candidates from cache: ${cands.size}\n`);

const found = [];
for (const [wallet, c] of cands) {
  if (found.length >= 8) break;
  const acc = await rpc.getAccountInfo(wallet).catch(() => null);
  if (acc?.value && acc.value.owner !== "11111111111111111111111111111111") continue; // programs and PDAs are not people
  const ta = await rpc.getAccountInfo(c.tokenAccount).catch(() => null);
  const amt = ta?.value?.data?.parsed?.info?.tokenAmount?.amount;
  if (!amt || BigInt(amt) === 0n) continue;
  const sigs = await rpc.getSignatures(c.tokenAccount, { limit: 100 }).catch(() => []);
  if (sigs.length === 0 || sigs.length >= 100) continue;
  const m = byMint.get(c.mint);
  found.push({
    wallet,
    symbol: m.symbol,
    mint: c.mint,
    tokenAccount: c.tokenAccount,
    rawAmount: amt,
    decimals: m.decimals,
    txCountAtDiscovery: sigs.length,
    oldestBlockTime: sigs.at(-1).blockTime,
    verifiedAt: new Date().toISOString(),
    evidence: "MEASURED",
  });
  process.stderr.write(`holder ${m.symbol} ${wallet} txs=${sigs.length}\n`);
}
void TOKEN_2022;
writeFileSync(join(ROOT, "data", "featured-holders.json"), JSON.stringify({ generatedAt: new Date().toISOString(), holders: found }, null, 2));
process.stderr.write(`done ${found.length}\n`);

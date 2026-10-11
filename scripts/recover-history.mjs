// Phase B: recover scheduled multiplier updates from chain history.
// Pages each multiplier authority's signatures, fetches every transaction (cached on disk),
// and records Token-2022 `updateMultiplier` instructions (outer and inner).
// Usage: node scripts/recover-history.mjs [--max-sigs 6000] [--authority <pubkey>]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadEnv, makeRpc, txCache } from "./lib/solana-rpc.mjs";

loadEnv();
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MAX = Number(arg("--max-sigs", "6000"));
const ONLY = arg("--authority", null);
const RPC = process.env.SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const rpc = makeRpc(RPC, { minGapMs: 50 });
const cache = txCache(join(ROOT, "data", "cache", "tx"));
const universe = JSON.parse(readFileSync(join(ROOT, "data", "universe.solana.json"), "utf8"));
const universeMints = new Set(universe.mints.map((m) => m.mint));
const authorities = [...new Set(universe.mints.map((m) => m.multiplierAuthority).filter(Boolean))].filter((a) => !ONLY || a === ONLY);

const events = [];
const failed = [];
const coverage = {};
const typesSeen = new Map();
let rawDumped = false;

for (const authority of authorities) {
  const sigs = [];
  let before;
  while (sigs.length < MAX) {
    const page = await rpc.getSignatures(authority, { limit: 1000, before });
    sigs.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }
  const scoped = sigs.slice(0, MAX);
  const reachedGenesis = sigs.length < MAX || scoped.length < MAX;
  let fetched = 0;
  const CONC = Number(process.env.RECOVER_CONCURRENCY ?? 6);
  const handle = (s, tx) => {
    const inner = (tx.meta?.innerInstructions ?? []).flatMap((x) => x.instructions);
    const all = [...tx.transaction.message.instructions, ...inner];
    for (const ix of all) {
      if (ix.programId !== TOKEN_2022 || !ix.parsed) continue;
      const t = ix.parsed.type;
      if (/ultipl|caled/i.test(t)) typesSeen.set(t, (typesSeen.get(t) ?? 0) + 1);
      if (t !== "updateMultiplier") continue;
      const info = ix.parsed.info;
      if (!universeMints.has(info.mint)) continue;
      if (!rawDumped) {
        rawDumped = true;
        mkdirSync(join(ROOT, "docs", "sources"), { recursive: true });
        writeFileSync(join(ROOT, "docs", "sources", "updateMultiplier.raw.json"), JSON.stringify({ note: "Raw jsonParsed getTransaction for one real updateMultiplier on Solana mainnet.", signature: s.signature, tx }, null, 2));
      }
      events.push({ signature: s.signature, slot: tx.slot, blockTime: tx.blockTime, mint: info.mint, authority: info.authority, newMultiplier: info.newMultiplier, newMultiplierTimestamp: info.newMultiplierTimestamp });
    }
  };
  const live = scoped.filter((x) => !x.err);
  for (let i = 0; i < live.length; i += CONC) {
    await Promise.all(
      live.slice(i, i + CONC).map(async (s) => {
        let tx = cache.get(s.signature);
        if (!tx) {
          try {
            tx = await rpc.getTransaction(s.signature);
          } catch {
            failed.push(s.signature);
            return;
          }
          if (!tx) return;
          cache.set(s.signature, tx);
        }
        fetched++;
        handle(s, tx);
      })
    );
    if ((i / CONC) % 40 === 0) process.stderr.write(`${authority.slice(0, 6)} ${fetched}/${scoped.length} events=${events.length}
`);
  }
  coverage[authority] = {
    signaturesScanned: scoped.length,
    newestBlockTime: scoped[0]?.blockTime ?? null,
    oldestBlockTime: scoped.at(-1)?.blockTime ?? null,
    reachedBeginning: reachedGenesis,
  };
}

events.sort((a, b) => a.slot - b.slot);
const out = {
  generatedAt: new Date().toISOString(),
  source: RPC.replace(/api-key=.*/, "api-key=REDACTED"),
  coverage,
  failedFetches: failed.length,
  instructionTypesSeen: Object.fromEntries(typesSeen),
  eventCount: events.length,
  events,
};
const name = ONLY ? `events.${ONLY.slice(0, 6)}.json` : "events.json";
writeFileSync(join(ROOT, "evidence", "recovery", name), JSON.stringify(out, null, 2));
process.stderr.write(`done: ${events.length} events, coverage ${JSON.stringify(coverage)}\n`);

// Precomputes the landing story from a running app so the landing page needs no chain reads at render time.
// Usage: BASE_URL=http://localhost:3000 node scripts/build-featured.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/solana-rpc.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const holders = JSON.parse(readFileSync(join(ROOT, "data", "featured-holders.json"), "utf8")).holders;
let statement = null;
for (const h of holders) {
  const r = await fetch(`${BASE}/api/statement`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: h.wallet }) });
  const j = await r.json();
  if (r.ok && j.holdings?.some((x) => x.status === "VERIFIED")) {
    for (const x of j.holdings) delete x.bundleJson;
    statement = j;
    break;
  }
}
let rhCount = null;
try {
  const b = await (await fetch(`${BASE}/api/v1/board?chain=robinhood`)).json();
  rhCount = b.count ?? null;
} catch {
  rhCount = null;
}
const out = { generatedAt: new Date().toISOString(), statement, rhCount };
writeFileSync(join(ROOT, "data", "featured-statement.json"), JSON.stringify(out));
writeFileSync(join(ROOT, "apps", "web", "src", "data", "generated", "featured-statement.json"), JSON.stringify(out));
process.stderr.write(`featured: ${statement ? statement.holdings.length + " holdings" : "none"}, rh ${rhCount}\n`);

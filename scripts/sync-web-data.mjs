// Copies verified data into the web app so it is bundled with the deployment.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/solana-rpc.mjs";

const out = join(ROOT, "apps", "web", "src", "data", "generated");
mkdirSync(out, { recursive: true });
const universe = JSON.parse(readFileSync(join(ROOT, "data", "universe.solana.json"), "utf8"));
writeFileSync(join(out, "universe.solana.json"), JSON.stringify(universe));
const fh = join(ROOT, "data", "featured-holders.json");
writeFileSync(join(out, "featured-holders.json"), existsSync(fh) ? readFileSync(fh, "utf8") : JSON.stringify({ holders: [] }));

const iconsDir = join(ROOT, "apps", "web", "public", "tokens");
const have = existsSync(iconsDir) ? readdirSync(iconsDir).map((f) => f.replace(/\.png$/, "")) : [];
writeFileSync(join(out, "icons.json"), JSON.stringify(have));
const dir = join(ROOT, "evidence", "recovery");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^events.*\.json$/.test(f)) : [];
const merged = { generatedAt: new Date().toISOString(), coverage: {}, events: [], failedFetches: 0 };
const seen = new Set();
for (const f of files) {
  const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
  Object.assign(merged.coverage, j.coverage);
  merged.failedFetches += j.failedFetches ?? 0;
  for (const e of j.events) {
    const k = `${e.signature}:${e.mint}`;
    if (!seen.has(k)) {
      seen.add(k);
      merged.events.push(e);
    }
  }
}
merged.events.sort((a, b) => a.slot - b.slot);
const labP = join(ROOT, "evidence", "semantic_lab", "e2_boundary_lab.json");
merged.policy = "ACTIVE_AT_SUBMIT";
if (existsSync(labP)) {
  const lab = JSON.parse(readFileSync(labP, "utf8"));
  if (lab.cases?.C4?.rollPolicy) merged.policy = lab.cases.C4.rollPolicy;
  writeFileSync(join(out, "lab.json"), JSON.stringify(lab));
}
for (const [src, dst] of [["data/featured-statement.json", "featured-statement.json"], ["evidence/compat/probe.json", "probe.json"], ["evidence/break/results.json", "break.json"]]) {
  const p = join(ROOT, src);
  if (existsSync(p)) writeFileSync(join(out, dst), readFileSync(p, "utf8"));
}
writeFileSync(join(out, "recovered.json"), JSON.stringify(merged));
process.stderr.write(`synced: ${universe.mints.length} mints, ${merged.events.length} events from ${files.length} files\n`);

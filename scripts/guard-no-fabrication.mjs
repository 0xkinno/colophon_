// Fails the build when an unverified base58 literal ships, or evidence claims PASS with empty results.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["apps", "packages"];
const SKIP = new Set(["node_modules", ".next", "dist", "evidence", "test", "generated"]);
const B58 = /["'`]([1-9A-HJ-NP-Za-km-z]{32,90})["'`]/g;
const allowed = new Set([...readFileSync("packages/instruments/src/constants.ts", "utf8").matchAll(B58)].map((m) => m[1]));

const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    if (![".ts", ".tsx", ".js", ".mjs"].includes(extname(p))) continue;
    if (p.endsWith("constants.ts") || p.endsWith(".d.ts")) continue;
    for (const m of readFileSync(p, "utf8").matchAll(B58)) {
      if (!allowed.has(m[1])) bad.push(`${p}: ${m[1].slice(0, 12)}...`);
    }
  }
}
ROOTS.forEach(walk);

if (existsSync("evidence")) {
  for (const f of readdirSync("evidence", { recursive: true })) {
    if (!String(f).endsWith(".json")) continue;
    const j = JSON.parse(readFileSync(join("evidence", String(f)), "utf8"));
    const r = j.results;
    const empty = Array.isArray(r)
      ? r.length === 0
      : r && typeof r === "object" && Object.values(r).every((v) => Array.isArray(v?.events) && v.events.length === 0);
    if (empty && /PASS/.test(JSON.stringify(j.status ?? j.claim ?? ""))) bad.push(`evidence/${f}: PASS with empty results`);
  }
}

if (bad.length) {
  process.stderr.write(bad.join("\n") + "\n");
  process.exit(1);
}
process.stdout.write("guard: ok, no unverified base58 literals\n");

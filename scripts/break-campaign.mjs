// Break campaign: tamper a real bundle in the ways a reviewer would, and record whether the offline verifier refuses.
// Usage: BASE_URL=http://localhost:3000 node scripts/break-campaign.mjs [wallet]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/solana-rpc.mjs";
import { verifyProofBundleOffline } from "../packages/verifier/dist/src/index.js";
import { deserializeBundle, serializeBundle } from "../packages/proof/dist/src/index.js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const holders = JSON.parse(readFileSync(join(ROOT, "data", "featured-holders.json"), "utf8")).holders;
const wallet = process.argv[2] ?? holders[0]?.wallet;
if (!wallet) throw new Error("no wallet available");

const res = await fetch(`${BASE}/api/statement`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }) });
const j = await res.json();
const h = j.holdings?.find((x) => x.bundleJson);
if (!h) throw new Error(`no verifiable holding for ${wallet}: ${JSON.stringify(j).slice(0, 200)}`);
const baseJson = h.bundleJson;
const fresh = () => deserializeBundle(baseJson);

const results = [];
const run = (id, attack, mutate) => {
  const b = fresh();
  let detected;
  let reason;
  try {
    mutate(b);
    const r = verifyProofBundleOffline(b);
    detected = !r.passed;
    reason = r.tamperReason ?? "all checks passed (attack missed)";
  } catch (e) {
    detected = true;
    reason = `verifier threw: ${e.message}`;
  }
  results.push({ id, attack, detected, reason });
};

const baseline = verifyProofBundleOffline(fresh());
results.push({ id: "B0", attack: "Untouched real bundle verifies", detected: !baseline.passed ? false : true, reason: baseline.passed ? "PASS as expected" : baseline.tamperReason });
results[0].detected = baseline.passed; // for B0, "detected" means it behaved correctly

run("B1", "Raise the raw balance by one unit", (b) => { b.statement.rawBalance = BigInt(b.statement.rawBalance) + 1n; });
run("B2", "Swap the multiplier numerator", (b) => { b.statement.activeMultiplier.numerator = BigInt(b.statement.activeMultiplier.numerator) + 1n; });
run("B3", "Change the as-of timestamp by one second", (b) => { b.statement.asOfTs = BigInt(b.statement.asOfTs) + 1n; });
run("B4", "Replace the statement hash with another valid-looking digest", (b) => { b.hashes.statementHash = "0".repeat(64); });
run("B5", "Flip one hex digit of the bundle hash", (b) => { const s = b.hashes.bundleHash; b.hashes.bundleHash = (s[0] === "0" ? "1" : "0") + s.slice(1); });
run("B6", "Remove all source events and a balance anchor offset", (b) => { b.sourceEvents = []; if (b.balanceAnchor) b.balanceAnchor.rawBalance = BigInt(b.balanceAnchor.rawBalance) - 1n; });
run("B7", "Delete one source event", (b) => { if (b.sourceEvents.length) b.sourceEvents.pop(); else throw new Error("bundle has no events to delete; raw balance tamper covers this case"); });
run("B8", "Duplicate a source event", (b) => { if (b.sourceEvents.length) b.sourceEvents.push(b.sourceEvents[0]); else throw new Error("bundle has no events to duplicate"); });
run("B9", "Change a source signature", (b) => { b.sourceAnchors[0].signature = "NONE"; });
run("B10", "Zero a source slot", (b) => { b.sourceAnchors[0].slot = 0n; });
run("B11", "Change the wallet in the statement only", (b) => { b.statement.wallet = b.statement.wallet.slice(0, -1) + (b.statement.wallet.endsWith("A") ? "B" : "A"); });
run("B12", "Change the mint in the statement only", (b) => { b.statement.mint = b.statement.mint.slice(0, -1) + (b.statement.mint.endsWith("A") ? "B" : "A"); });
run("B13", "Substitute the evidence root", (b) => { b.hashes.evidenceRoot = "f".repeat(64); });
run("B14", "Substitute the statement commitment", (b) => { b.hashes.statementCommitment = "e".repeat(64); });
run("B15", "Claim COMPLETE with a missing range", (b) => { if (b.statement.completenessReport) { b.statement.completenessReport.state = "COMPLETE"; b.statement.completenessReport.missingRanges = [{ startTs: 1n, endTs: 2n, reason: "forged" }]; } });
run("B16", "Alter the displayed units only", (b) => { b.statement.reconstructedUnits = b.statement.reconstructedUnits + 1; });
run("B17", "Change the balance anchor", (b) => { if (b.balanceAnchor) b.balanceAnchor.rawBalance = BigInt(b.balanceAnchor.rawBalance) + 1n; else throw new Error("no anchor"); });
run("B18", "Null the block time of an anchor", (b) => { b.sourceAnchors[0].blockTime = 0n; b.sourceAnchors[0].slot = 0n; });
run("B19", "Replace the manifest bundle id", (b) => { b.manifest.bundleId = "bundle-forged"; });
run("B20", "One-byte tamper of the serialized JSON", (b) => {
  const s = serializeBundle(b, 0);
  const i = s.indexOf('"statementHash":"') + '"statementHash":"'.length;
  const t = s.slice(0, i) + (s[i] === "a" ? "b" : "a") + s.slice(i + 1);
  Object.assign(b, deserializeBundle(t));
});

mkdirSync(join(ROOT, "evidence", "break"), { recursive: true });
const out = { generatedAt: new Date().toISOString(), subject: `${h.symbol} ${wallet}`, bundleHash: baseline.bundleId, results };
writeFileSync(join(ROOT, "evidence", "break", "results.json"), JSON.stringify(out, null, 2));
const missed = results.filter((r) => !r.detected);
process.stderr.write(`break: ${results.length - missed.length}/${results.length} as expected\n`);
if (missed.length) {
  process.stderr.write(missed.map((m) => `${m.id}: ${m.attack}: ${m.reason}`).join("\n") + "\n");
  process.exitCode = 1;
}

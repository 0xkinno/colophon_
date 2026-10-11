// Compatibility probe: what common read paths report versus the kernel for the same instant.
// Read-only. Nothing is signed or sent. Output: evidence/compat/probe.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadEnv, makeRpc } from "./lib/solana-rpc.mjs";

loadEnv();
const rpc = makeRpc(process.env.SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com", { minGapMs: 150 });
const u = JSON.parse(readFileSync(join(ROOT, "data", "universe.solana.json"), "utf8"));
const SYMBOLS = ["OPENAI", "SPACEX", "AAPLx", "NVDAx", "SPYx", "TSLAx"];
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function dec(s) {
  const m = String(s).match(/^(\d+)(?:\.(\d+))?$/);
  const frac = m[2] ?? "";
  return { num: BigInt(m[1] + frac), den: 10n ** BigInt(frac.length) };
}
function fmt(raw, decimals, m, places = 9) {
  const scale = 10n ** BigInt(places);
  const q = (raw * m.num * scale) / (m.den * 10n ** BigInt(decimals));
  const w = q / scale;
  const f = (q % scale).toString().padStart(places, "0").replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
}
const trim = (s) => (String(s).includes(".") ? String(s).replace(/0+$/, "").replace(/\.$/, "") : String(s));

const rows = [];
const now = Math.floor(Date.now() / 1000);

for (const sym of SYMBOLS) {
  const m = u.mints.find((x) => x.symbol === sym);
  if (!m) continue;
  const live = await rpc.getAccountInfo(m.mint);
  const st = live.value.data.parsed.info.extensions.find((e) => e.extension === "scaledUiAmountConfig").state;
  const active = Number(st.newMultiplierEffectiveTimestamp) <= now ? st.newMultiplier : st.multiplier;
  const am = dec(active);
  const at = new Date().toISOString();

  const sup = await rpc.call("getTokenSupply", [m.mint]);
  const kSupply = fmt(BigInt(sup.value.amount), m.decimals, am, m.decimals);
  rows.push({
    tool: "RPC getTokenSupply",
    symbol: sym,
    reports: trim(sup.value.uiAmountString),
    kernel: kSupply,
    verdict: trim(sup.value.uiAmountString) === trim(kSupply) ? "MATCH" : "MISMATCH",
    at,
  });

  const largest = await rpc.call("getTokenLargestAccounts", [m.mint]).catch(() => null);
  const top = largest?.value?.[0];
  if (top) {
    const bal = await rpc.call("getTokenAccountBalance", [top.address]);
    const k = fmt(BigInt(bal.value.amount), m.decimals, am, m.decimals);
    rows.push({
      tool: "RPC getTokenAccountBalance",
      symbol: sym,
      reports: trim(bal.value.uiAmountString),
      kernel: k,
      verdict: trim(bal.value.uiAmountString) === trim(k) ? "MATCH" : "MISMATCH",
      at: new Date().toISOString(),
    });
  }

  const oneUnit = (10n ** BigInt(m.decimals)).toString();
  try {
    const r = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${m.mint}&outputMint=${USDC}&amount=${oneUnit}&slippageBps=50`);
    const j = await r.json();
    rows.push({
      tool: "Jupiter quote API",
      symbol: sym,
      reports: r.ok && j.outAmount ? `inAmount ${j.inAmount} raw, out ${j.outAmount}` : `HTTP ${r.status} ${String(j.error ?? j.message ?? "").slice(0, 60)}`,
      kernel: `1 raw unit = ${fmt(10n ** BigInt(m.decimals), m.decimals, am)} shown`,
      verdict: r.ok && j.outAmount ? "NOT_COMPARABLE" : "NO_ROUTE",
      at: new Date().toISOString(),
    });
  } catch (e) {
    rows.push({ tool: "Jupiter quote API", symbol: sym, reports: `fetch failed: ${e.message}`.slice(0, 80), kernel: "n/a", verdict: "NO_ROUTE", at: new Date().toISOString() });
  }
}

// Robinhood Chain: balanceOf is raw, uiMultiplier scales it.
try {
  const assets = (await (await fetch("https://api.robinhood.com/rhj/assets")).json()).assets.filter((a) => a.deployments?.some((d) => d.chainId === 4663));
  const rhRpc = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
  for (const a of assets.slice(0, 3)) {
    const addr = a.deployments.find((d) => d.chainId === 4663).contractAddress;
    const call = async (data) => {
      const r = await fetch(rhRpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: addr, data }, "latest"] }) });
      return (await r.json()).result;
    };
    const mult = BigInt(await call("0xa60bf13d"));
    const supply = BigInt(await call("0x18160ddd"));
    const scaled = (supply * mult) / 10n ** 18n;
    rows.push({
      tool: "Robinhood Chain totalSupply()",
      symbol: a.tokenSymbol,
      reports: supply.toString(),
      kernel: scaled.toString(),
      verdict: supply === scaled ? "MATCH" : "MISMATCH",
      at: new Date().toISOString(),
    });
  }
} catch (e) {
  rows.push({ tool: "Robinhood Chain totalSupply()", symbol: "n/a", reports: `unavailable: ${e.message}`.slice(0, 80), kernel: "n/a", verdict: "NOT_RUN", at: new Date().toISOString() });
}

mkdirSync(join(ROOT, "evidence", "compat"), { recursive: true });
const out = {
  generatedAt: new Date().toISOString(),
  method: "Read-only RPC and public quote calls. Kernel value is raw x multiplier in force at the same instant, exact decimal arithmetic.",
  notRun: ["Jupiter referral fee-account simulation", "Explorer page display screenshots"],
  rows,
};
writeFileSync(join(ROOT, "evidence", "compat", "probe.json"), JSON.stringify(out, null, 2));
writeFileSync(join(ROOT, "apps", "web", "src", "data", "generated", "probe.json"), JSON.stringify(out));
process.stderr.write(`probe rows: ${rows.length}\n`);

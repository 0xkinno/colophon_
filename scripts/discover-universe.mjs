// Discovers tokenized-stock mints on Solana mainnet and verifies each on chain.
// A mint is kept only if getAccountInfo proves it is a Token-2022 mint carrying scaledUiAmountConfig.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadEnv, makeRpc } from "./lib/solana-rpc.mjs";

loadEnv();
const RPC = process.env.SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";
const rpc = makeRpc(RPC);
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const QUERIES = [
  "AAPLx","TSLAx","NVDAx","SPYx","GOOGLx","METAx","MSFTx","AMZNx","COINx","HOODx","PLTRx","QQQx",
  "CRCLx","MSTRx","NFLXx","AVGOx","JPMx","LLYx","GMEx","ORCLx","AMDx","INTCx","BRKBx","VTIx","TQQQx","MCDx","KOx","PEPx","WMTx","XOMx","CVXx","UNHx","PFEx","JNJx","Vx","MAx","HDx","CSCOx","IBMx","CRMx","ABBVx","MRKx","ADBEx","BACx","DISx","NKEx","PYPLx","UBERx","SHOPx","SQx","SOFIx","DFDVx","STRCx","ACNx","AZNx","CMCSAx","TMOx","GLDx","IWMx","IVVx","DHRx","LINx","MDTx","NVOx","PGx","TMUSx","WFCx","BTGOx","OPENAI","SPACEX","ANTHROPIC","ANDURIL","KALSHI","POLYMARKET","NEURALINK","FIGURE","PreStocks","ScaledUi",
];

const candidates = new Map();
for (const q of QUERIES) {
  try {
    const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`);
    if (!r.ok) continue;
    for (const t of await r.json()) {
      if (t.tokenProgram === TOKEN_2022 || t.tags?.includes?.("token-2022")) candidates.set(t.id, t);
    }
  } catch {}
}
process.stderr.write(`candidates: ${candidates.size}\n`);

const out = [];
for (const [mint, j] of candidates) {
  const acc = await rpc.getAccountInfo(mint).catch(() => null);
  const info = acc?.value?.data?.parsed?.info;
  if (!info || acc.value.owner !== TOKEN_2022) continue;
  const ext = (info.extensions ?? []).find((e) => e.extension === "scaledUiAmountConfig");
  if (!ext) continue;
  const meta = (info.extensions ?? []).find((e) => e.extension === "tokenMetadata")?.state;
  const s = ext.state;
  out.push({
    mint,
    symbol: meta?.symbol ?? j.symbol,
    name: meta?.name ?? j.name,
    decimals: info.decimals,
    supplyRaw: info.supply,
    multiplier: s.multiplier,
    newMultiplier: s.newMultiplier,
    newMultiplierEffectiveTimestamp: s.newMultiplierEffectiveTimestamp,
    multiplierAuthority: s.authority ?? null,
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    extensions: (info.extensions ?? []).map((e) => e.extension),
    iconSource: j.icon ?? meta?.uri ?? null,
    category: /^(OPENAI|SPACEX|ANTHROPIC|ANDURIL|KALSHI|POLYMARKET|NEURALINK|FIGURE)/i.test(meta?.symbol ?? j.symbol) || /prestock/i.test(j.name ?? "") ? "PreStocks" : "xStocks",
    verifiedAt: new Date().toISOString(),
    evidence: "MEASURED",
    explorer: `https://explorer.solana.com/address/${mint}`,
  });
  process.stderr.write(`ok ${meta?.symbol ?? j.symbol} ${mint}\n`);
}
out.sort((a, b) => a.symbol.localeCompare(b.symbol));
mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "universe.solana.json"), JSON.stringify({ cluster: "mainnet-beta", generatedAt: new Date().toISOString(), count: out.length, mints: out }, null, 2));
process.stderr.write(`verified: ${out.length}\n`);

import { createPublicClient, http, isAddress, getAddress, type Address } from "viem";
import {
  generateStatement,
  HistoricalHoldingsRecord,
  scaleRaw,
  formatUiAmount,
  rationalToNumber,
  rationalToDecimalString,
  CompletenessReport,
  EvidenceLabel,
} from "@colophon/kernel";
import { buildProofBundle, serializeBundle } from "@colophon/proof";
import { verifyProofBundleOffline } from "@colophon/verifier";
import { ROBINHOOD_CHAIN } from "@colophon/instruments";
import { StatementError } from "./statement";

const ABI = [
  { type: "function", name: "uiMultiplier", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
] as const;

export function rhRpc(): string {
  return process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
}

export function rhClient() {
  return createPublicClient({
    chain: {
      id: ROBINHOOD_CHAIN.mainnetChainId,
      name: "Robinhood Chain",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rhRpc()] } },
    },
    transport: http(rhRpc(), { batch: { batchSize: 100, wait: 25 }, retryCount: 4, retryDelay: 600 }),
  });
}

export type RhAsset = {
  symbol: string;
  name: string;
  address: Address;
  logoUrl: string | null;
  apiMultiplier: string | null;
  pendingMultiplier: string | null;
  status: string;
};

type ApiAsset = {
  tokenSymbol: string;
  tokenName: string;
  deployments?: Array<{ contractAddress: string; chainId: number }>;
  logoUrl?: string;
  currentMultiplier?: string;
  pendingMultiplier?: string;
  status?: string;
};

export async function fetchRhAssets(): Promise<RhAsset[]> {
  const res = await fetch("https://api.robinhood.com/rhj/assets", { next: { revalidate: 60 } });
  if (!res.ok) throw new StatementError(`Robinhood assets API returned ${res.status}`, 502);
  const j = (await res.json()) as { assets?: ApiAsset[] };
  return (j.assets ?? [])
    .filter((a) => a.deployments?.some((d) => d.chainId === ROBINHOOD_CHAIN.mainnetChainId))
    .map((a) => {
      const d = a.deployments!.find((x) => x.chainId === ROBINHOOD_CHAIN.mainnetChainId)!;
      return {
        symbol: a.tokenSymbol,
        name: a.tokenName,
        address: getAddress(d.contractAddress),
        logoUrl: a.logoUrl ?? null,
        apiMultiplier: a.currentMultiplier ?? null,
        pendingMultiplier: a.pendingMultiplier ? a.pendingMultiplier : null,
        status: a.status ?? "UNKNOWN",
      };
    });
}

export async function readRhMultiplier(address: Address, blockNumber?: bigint): Promise<bigint> {
  return rhClient().readContract({ address, abi: ABI, functionName: "uiMultiplier", ...(blockNumber ? { blockNumber } : {}) });
}

async function blockAtOrBefore(ts: number): Promise<bigint> {
  const c = rhClient();
  const latest = await c.getBlock();
  if (Number(latest.timestamp) <= ts) return latest.number;
  let lo = 0n;
  let hi = latest.number;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const b = await c.getBlock({ blockNumber: mid });
    if (Number(b.timestamp) <= ts) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

export async function buildRobinhoodStatement(wallet: string, asOfTs?: number) {
  if (!isAddress(wallet)) throw new StatementError("wallet must be a 0x address on Robinhood Chain");
  const owner = getAddress(wallet);
  const nowTs = Math.floor(Date.now() / 1000);
  const asOf = Math.min(asOfTs ?? nowTs, nowTs);
  const assets = await fetchRhAssets();
  const c = rhClient();
  const latest = await c.getBlock();
  const historical = asOf < nowTs - 60;
  let blockNumber: bigint | undefined;
  let coverage: "AT_BLOCK" | "CURRENT_ONLY" = "AT_BLOCK";
  let coverageReason: string | undefined;
  if (historical) {
    try {
      blockNumber = await blockAtOrBefore(asOf);
      await c.readContract({ address: assets[0].address, abi: ABI, functionName: "uiMultiplier", blockNumber });
    } catch (e) {
      coverage = "CURRENT_ONLY";
      coverageReason = `Archive state at ${new Date(asOf * 1000).toISOString()} is not served by this endpoint (${(e instanceof Error ? e.message : "error").slice(0, 80)}). Showing current state only.`;
      blockNumber = undefined;
    }
  }
  const effectiveTs = coverage === "CURRENT_ONLY" || !historical ? nowTs : asOf;
  const readBlock = blockNumber ?? latest.number;
  const readTs = blockNumber ? Number((await c.getBlock({ blockNumber })).timestamp) : Number(latest.timestamp);

  const readOne = async (a: RhAsset) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await Promise.all([
          c.readContract({ address: a.address, abi: ABI, functionName: "balanceOf", args: [owner], ...(blockNumber ? { blockNumber } : {}) }),
          c.readContract({ address: a.address, abi: ABI, functionName: "uiMultiplier", ...(blockNumber ? { blockNumber } : {}) }),
          c.readContract({ address: a.address, abi: ABI, functionName: "decimals" }),
        ]);
        return { a, raw: r[0], mult: r[1], decimals: Number(r[2]) };
      } catch {
        await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
      }
    }
    return null;
  };
  const reads: Array<Awaited<ReturnType<typeof readOne>>> = [];
  for (let i = 0; i < assets.length; i += 16) {
    reads.push(...(await Promise.all(assets.slice(i - 0, i + 16).map(readOne))));
  }
  const readFailures = reads.filter((r) => r === null).length;
  const rows = [];
  for (const read of reads) {
    if (!read || read.raw === 0n) continue;
    const { a, raw, mult, decimals } = read;
    const m = { num: mult, den: 10n ** 18n };
    const confidence: EvidenceLabel = "MEASURED";
    const src = `eth_call:${a.address}@${readBlock}`;
    const rawFloat = Number(raw) / 10 ** decimals;
    const holdingsRecord: HistoricalHoldingsRecord = {
      wallet: owner,
      mint: a.address,
      asOfTs: BigInt(effectiveTs),
      asOfIso: new Date(effectiveTs * 1000).toISOString(),
      rawBalance: raw,
      decimals,
      activeMultiplierNumerator: m.num,
      activeMultiplierDenominator: m.den,
      effectiveMultiplierFloat: rationalToNumber(m),
      multiplierEffectiveAt: BigInt(readTs),
      multiplierSourceSignature: src,
      multiplierConfidence: confidence,
      reconstructedUiUnits: rawFloat * rationalToNumber(m),
      reconstructedRawScaled: scaleRaw(raw, m),
      naiveStaleMultiplierFloat: 1,
      naiveUiUnits: rawFloat,
      divergenceUnitsDelta: rawFloat * (rationalToNumber(m) - 1),
      divergenceRelativeErrorPct: Math.abs(rationalToNumber(m) - 1) * 100,
      sourceAnchors: {
        balanceSignature: src,
        balanceSlot: readBlock,
        multiplierSignature: src,
        multiplierSlot: readBlock,
      },
      confidence,
    };
    const statement = generateStatement({ holdings: holdingsRecord, symbol: a.symbol, category: "xStocks" });
    const completeness: CompletenessReport = {
      state: coverage === "AT_BLOCK" ? "COMPLETE" : "PARTIAL",
      coverageWindow: { startTs: BigInt(readTs), endTs: BigInt(readTs), startSlot: readBlock, endSlot: readBlock },
      unresolvedEventsCount: 0,
      explanation:
        coverage === "AT_BLOCK"
          ? `balanceOf and uiMultiplier read at block ${readBlock} by eth_call.`
          : "CURRENT_ONLY: archive state unavailable, values are the latest block.",
    };
    statement.completenessReport = completeness;
    const bundle = buildProofBundle({
      statement,
      events: [],
      rpcSource: "robinhood-chain-mainnet",
      balanceAnchor: { rawBalance: raw, observedAtTs: BigInt(readTs), observedSlot: readBlock, tokenAccount: a.address },
    });
    const report = verifyProofBundleOffline(bundle);
    rows.push({
      symbol: a.symbol,
      name: a.name,
      token: a.address,
      logoUrl: a.logoUrl,
      decimals,
      rawBalance: raw.toString(),
      uiMultiplier: rationalToDecimalString(m, 18),
      heldUnits: formatUiAmount(raw, decimals, m, 6),
      block: readBlock.toString(),
      statement,
      bundleJson: serializeBundle(bundle, 0),
      offlineVerified: report.passed,
    });
  }
  return {
    wallet: owner,
    chain: "robinhood" as const,
    asOfTs: effectiveTs,
    asOfIso: new Date(effectiveTs * 1000).toISOString(),
    generatedAt: new Date().toISOString(),
    coverage,
    coverageReason,
    universeSize: assets.length,
    holdingsFound: rows.length,
    readFailures,
    holdings: rows,
    note: rows.length === 0 && readFailures > 0 ? `${readFailures} of ${assets.length} token reads failed (endpoint rate limit). Try again or set ROBINHOOD_RPC_URL to an authenticated endpoint.` : rows.length === 0 ? `This wallet holds none of the ${assets.length} stock tokens on Robinhood Chain. Open a real holder's statement instead.` : undefined,
  };
}

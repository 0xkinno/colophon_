import {
  TransferEvent,
  Statement,
  HistoricalHoldingsRecord,
  generateStatement,
  buildEvidenceTimeline,
  multiplierAt,
  parseDecimal,
  scaleRaw,
  formatUiAmount,
  rationalToNumber,
  rationalToDecimalString,
  computeRawBalanceAnchored,
  ScaledState,
  UpdateObservation,
  EvidenceTimeline,
  EvidenceLabel,
  CompletenessReport,
} from "@colophon/kernel";
import { buildProofBundle, ProofBundle, serializeBundle } from "@colophon/proof";
import { verifyProofBundleOffline } from "@colophon/verifier";
import { TOKEN_2022_PROGRAM_ID, VERIFIED_SOLANA_MINTS } from "@colophon/instruments";
import { rpcCall, getTransaction, TokenBalance } from "./rpc";
import { loadRecovered } from "./recovered";

const MINTS = new Map(VERIFIED_SOLANA_MINTS.map((m) => [m.mint, m]));
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_TX_PER_ACCOUNT = 90;
const MAX_MINTS = 20;

export class StatementError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type MintAccount = {
  context: { slot: number };
  value: {
    data: { parsed: { info: { decimals: number; supply: string; extensions?: Array<{ extension: string; state: Record<string, unknown> }> } } };
  } | null;
};

export type LiveMint = { state: ScaledState; slot: bigint; supplyRaw: bigint; decimals: number };

export async function readLiveMint(mint: string): Promise<LiveMint> {
  const acc = await rpcCall<MintAccount>("getAccountInfo", [mint, { encoding: "jsonParsed" }], { ttlMs: 20_000 });
  const info = acc.value?.data?.parsed?.info;
  const ext = info?.extensions?.find((e) => e.extension === "scaledUiAmountConfig")?.state;
  if (!info || !ext) throw new StatementError(`Mint ${mint} has no scaledUiAmountConfig`, 422);
  return {
    state: {
      multiplier: parseDecimal(String(ext.multiplier)),
      newMultiplier: parseDecimal(String(ext.newMultiplier)),
      newMultiplierEffectiveTimestamp: BigInt(String(ext.newMultiplierEffectiveTimestamp)),
    },
    slot: BigInt(acc.context.slot),
    supplyRaw: BigInt(info.supply),
    decimals: info.decimals,
  };
}

export async function timelineFor(mint: string): Promise<{ timeline: EvidenceTimeline; live: LiveMint; coverageStartTs: bigint }> {
  const live = await readLiveMint(mint);
  const rec = loadRecovered();
  const meta = MINTS.get(mint);
  const authority = meta?.multiplierAuthority ?? "";
  const cov = rec.coverage[authority];
  const coverageStartTs = BigInt(cov?.oldestBlockTime ?? Math.floor(Date.now() / 1000));
  const observations: UpdateObservation[] = rec.events
    .filter((e) => e.mint === mint)
    .map((e) => ({
      signature: e.signature,
      slot: BigInt(e.slot),
      blockTime: BigInt(e.blockTime),
      mint,
      newMultiplier: parseDecimal(e.newMultiplier),
      newMultiplierTimestamp: BigInt(e.newMultiplierTimestamp),
    }));
  const timeline = buildEvidenceTimeline({
    mint,
    observations,
    live: live.state,
    liveSlot: live.slot,
    coverageStartTs,
    policy: rec.policy,
  });
  return { timeline, live, coverageStartTs };
}

type TokenAccountsResult = {
  value: Array<{
    pubkey: string;
    account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } };
  }>;
};

type SigRow = { signature: string; slot: number; blockTime: number | null; err: unknown };

async function deltasAfter(
  wallet: string,
  mint: string,
  tokenAccount: string,
  asOfTs: number
): Promise<{ events: TransferEvent[]; complete: boolean; txCount: number }> {
  const events: TransferEvent[] = [];
  const picked: SigRow[] = [];
  let before: string | undefined;
  let complete = true;
  for (let page = 0; page < 3; page++) {
    const rows = await rpcCall<SigRow[]>(
      "getSignaturesForAddress",
      [tokenAccount, { limit: 200, ...(before ? { before } : {}) }],
      { ttlMs: 20_000 }
    );
    let reached = false;
    for (const r of rows) {
      if (r.blockTime !== null && r.blockTime <= asOfTs) {
        reached = true;
        break;
      }
      if (!r.err) picked.push(r);
    }
    if (reached || rows.length < 200) break;
    before = rows[rows.length - 1].signature;
    if (page === 2) complete = false;
  }
  if (picked.length > MAX_TX_PER_ACCOUNT) {
    complete = false;
  }
  for (const s of picked.slice(0, MAX_TX_PER_ACCOUNT)) {
    const tx = await getTransaction(s.signature);
    if (!tx || !tx.meta || tx.meta.err) continue;
    const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
    const idx = keys.indexOf(tokenAccount);
    const find = (arr?: TokenBalance[]) => arr?.find((b) => b.accountIndex === idx && b.mint === mint);
    const pre = find(tx.meta.preTokenBalances);
    const post = find(tx.meta.postTokenBalances);
    const preAmt = BigInt(pre?.uiTokenAmount.amount ?? "0");
    const postAmt = BigInt(post?.uiTokenAmount.amount ?? "0");
    const delta = postAmt - preAmt;
    if (delta === 0n) continue;
    // Counterparty owner: any other balance entry of the same mint with the opposite sign.
    const counter = (tx.meta.postTokenBalances ?? []).find((b) => b.mint === mint && b.accountIndex !== idx && b.owner && b.owner !== wallet)?.owner;
    events.push({
      type: "TransferEvent",
      signature: s.signature,
      slot: BigInt(tx.slot),
      blockTime: BigInt(tx.blockTime ?? s.blockTime ?? 0),
      mint,
      from: delta > 0n ? counter ?? "COUNTERPARTY_UNRESOLVED" : wallet,
      to: delta > 0n ? wallet : counter ?? "COUNTERPARTY_UNRESOLVED",
      rawAmount: delta > 0n ? delta : -delta,
      confidence: "MEASURED",
    });
  }
  events.sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
  return { events, complete, txCount: picked.length };
}

export type HoldingResult = {
  symbol: string;
  name: string;
  mint: string;
  category: "xStocks" | "PreStocks";
  decimals: number;
  tokenAccount: string;
  currentRaw: string;
  asOfRaw: string | null;
  status: "VERIFIED" | "UNKNOWN_MULTIPLIER" | "PARTIAL_BALANCE";
  reason?: string;
  walletShowsUnits: string; // raw today x multiplier active today
  heldUnits: string | null; // raw at asOf x multiplier at asOf
  multiplierAtAsOf: string | null;
  multiplierNow: string;
  staleField: string;
  multiplierSource: string | null;
  evidence: EvidenceLabel;
  timeline: Array<{ startTs: string | null; endTs: string | null; multiplier: string; source: string; confidence: string }>;
  timelineDerivation: string;
  consistent: boolean | null;
  statement?: Statement;
  bundleJson?: string;
  offlineVerified?: boolean;
};

export type StatementResponse = {
  wallet: string;
  chain: "solana";
  asOfTs: number;
  asOfIso: string;
  generatedAt: string;
  universeSize: number;
  holdingsFound: number;
  holdings: Array<Omit<HoldingResult, "statement"> & { statement?: unknown }>;
  note?: string;
};

export async function buildStatements(wallet: string, asOfTs?: number): Promise<StatementResponse> {
  if (!BASE58.test(wallet)) throw new StatementError("wallet must be a base58 Solana address");
  const nowTs = Math.floor(Date.now() / 1000);
  const asOf = Math.min(asOfTs ?? nowTs, nowTs);

  const accounts = await rpcCall<TokenAccountsResult>(
    "getTokenAccountsByOwner",
    [wallet, { programId: TOKEN_2022_PROGRAM_ID }, { encoding: "jsonParsed" }],
    { ttlMs: 15_000 }
  );
  const held = accounts.value
    .map((a) => ({ tokenAccount: a.pubkey, info: a.account.data.parsed.info }))
    .filter((a) => MINTS.has(a.info.mint) && BigInt(a.info.tokenAmount.amount) > 0n)
    .slice(0, MAX_MINTS);

  const holdings: HoldingResult[] = [];
  for (const h of held) {
    const meta = MINTS.get(h.info.mint)!;
    const currentRaw = BigInt(h.info.tokenAmount.amount);
    const { timeline, live, coverageStartTs } = await timelineFor(meta.mint);
    const nowMult = multiplierAt(timeline, BigInt(nowTs));
    const activeNow = nowMult.known ? nowMult.multiplier : live.state.newMultiplier;
    const walletShows = formatUiAmount(currentRaw, meta.decimals, activeNow, 6);

    const tlOut = timeline.intervals.map((iv) => ({
      startTs: iv.startTs === null ? null : iv.startTs.toString(),
      endTs: iv.endTs === null ? null : iv.endTs.toString(),
      multiplier: rationalToDecimalString(iv.multiplier, 16),
      source: iv.source.signature,
      confidence: iv.confidence,
    }));

    const base = {
      symbol: meta.symbol,
      name: meta.name,
      mint: meta.mint,
      category: meta.category,
      decimals: meta.decimals,
      tokenAccount: h.tokenAccount,
      currentRaw: currentRaw.toString(),
      walletShowsUnits: walletShows,
      multiplierNow: rationalToDecimalString(activeNow, 16),
      staleField: rationalToDecimalString(live.state.multiplier, 16),
      timeline: tlOut,
      timelineDerivation: timeline.derivation,
      consistent: timeline.consistent,
    };

    const atMult = multiplierAt(timeline, BigInt(asOf));
    if (!atMult.known) {
      holdings.push({
        ...base,
        asOfRaw: null,
        status: "UNKNOWN_MULTIPLIER",
        reason: `${atMult.reason} Coverage begins ${new Date(Number(coverageStartTs) * 1000).toISOString()}.`,
        heldUnits: null,
        multiplierAtAsOf: null,
        multiplierSource: null,
        evidence: "UNKNOWN",
      });
      continue;
    }

    let events: TransferEvent[] = [];
    let rawAtAsOf = currentRaw;
    let complete = true;
    if (asOf < nowTs - 60) {
      const d = await deltasAfter(wallet, meta.mint, h.tokenAccount, asOf);
      events = d.events;
      complete = d.complete;
      rawAtAsOf = computeRawBalanceAnchored(currentRaw, events, wallet, meta.mint, BigInt(asOf));
    }
    if (!complete || rawAtAsOf < 0n) {
      holdings.push({
        ...base,
        asOfRaw: null,
        status: "PARTIAL_BALANCE",
        reason: "More transactions after this date than Colophon reads in one request, so the raw balance cannot be proven.",
        heldUnits: null,
        multiplierAtAsOf: rationalToDecimalString(atMult.multiplier, 16),
        multiplierSource: atMult.source.signature,
        evidence: "INCOMPLETE",
      });
      continue;
    }

    const heldUnits = formatUiAmount(rawAtAsOf, meta.decimals, atMult.multiplier, 6);
    const staleF = rationalToNumber(live.state.multiplier);
    const rawFloat = Number(rawAtAsOf) / 10 ** meta.decimals;
    const reconstructedUi = rawFloat * rationalToNumber(atMult.multiplier);
    const naiveUi = rawFloat * staleF;
    const delta = reconstructedUi - naiveUi;
    const holdingsRecord: HistoricalHoldingsRecord = {
      wallet,
      mint: meta.mint,
      asOfTs: BigInt(asOf),
      asOfIso: new Date(asOf * 1000).toISOString(),
      rawBalance: rawAtAsOf,
      decimals: meta.decimals,
      activeMultiplierNumerator: atMult.multiplier.num,
      activeMultiplierDenominator: atMult.multiplier.den,
      effectiveMultiplierFloat: rationalToNumber(atMult.multiplier),
      multiplierEffectiveAt: atMult.intervalStartTs ?? coverageStartTs,
      multiplierSourceSignature: atMult.source.signature,
      multiplierConfidence: atMult.confidence,
      reconstructedUiUnits: reconstructedUi,
      reconstructedRawScaled: scaleRaw(rawAtAsOf, atMult.multiplier),
      naiveStaleMultiplierFloat: staleF,
      naiveUiUnits: naiveUi,
      divergenceUnitsDelta: delta,
      divergenceRelativeErrorPct: naiveUi !== 0 ? (Math.abs(delta) / Math.abs(naiveUi)) * 100 : 0,
      sourceAnchors: {
        balanceSignature: events.at(-1)?.signature ?? `ACCOUNT_STATE:${h.tokenAccount}`,
        balanceSlot: events.at(-1)?.slot ?? live.slot,
        multiplierSignature: atMult.source.signature,
        multiplierSlot: atMult.source.slot === 0n ? live.slot : atMult.source.slot,
      },
      confidence: atMult.confidence === "MEASURED" ? "MEASURED" : "REPLAYED",
    };
    const statement = generateStatement({
      holdings: holdingsRecord,
      symbol: meta.symbol,
      category: meta.category,
    });
    const completeness: CompletenessReport = {
      state: timeline.derivation === "REPLAY_UNKNOWN_START" ? "PARTIAL" : "COMPLETE",
      coverageWindow: { startTs: coverageStartTs, endTs: BigInt(nowTs), startSlot: 0n, endSlot: live.slot },
      unresolvedEventsCount: 0,
      explanation:
        timeline.derivation === "NO_EVENTS_IN_WINDOW"
          ? "No multiplier updates were found for this mint inside the scanned authority history window."
          : `Multiplier timeline replayed from ${timeline.eventCount} recovered updateMultiplier transaction(s).`,
    };
    statement.completenessReport = completeness;
    const bundle: ProofBundle = buildProofBundle({
      statement,
      events,
      rpcSource: "solana-mainnet",
      balanceAnchor: {
        rawBalance: currentRaw,
        observedAtTs: BigInt(nowTs),
        observedSlot: live.slot,
        tokenAccount: h.tokenAccount,
      },
    });
    const report = verifyProofBundleOffline(bundle);
    holdings.push({
      ...base,
      asOfRaw: rawAtAsOf.toString(),
      status: "VERIFIED",
      heldUnits,
      multiplierAtAsOf: rationalToDecimalString(atMult.multiplier, 16),
      multiplierSource: atMult.source.signature,
      evidence: holdingsRecord.confidence,
      statement,
      bundleJson: serializeBundle(bundle, 0),
      offlineVerified: report.passed,
    });
  }

  const response: StatementResponse = {
    wallet,
    chain: "solana",
    asOfTs: asOf,
    asOfIso: new Date(asOf * 1000).toISOString(),
    generatedAt: new Date().toISOString(),
    universeSize: VERIFIED_SOLANA_MINTS.length,
    holdingsFound: holdings.length,
    holdings,
  };
  if (holdings.length === 0) {
    response.note = `This wallet holds none of the ${VERIFIED_SOLANA_MINTS.length} stock tokens Colophon tracks. Open a real holder's statement instead.`;
  }
  return response;
}

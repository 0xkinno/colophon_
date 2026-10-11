export type TimelineIv = { startTs: string | null; endTs: string | null; multiplier: string; source: string; confidence: string };

export type Holding = {
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
  walletShowsUnits: string;
  heldUnits: string | null;
  multiplierAtAsOf: string | null;
  multiplierNow: string;
  staleField: string;
  multiplierSource: string | null;
  evidence: string;
  timeline: TimelineIv[];
  timelineDerivation: string;
  consistent: boolean | null;
  statement?: { statementHash: string; evidenceRoot?: string; asOfTs: string; mint: string; wallet: string; symbol: string; terminologyUnit: string };
  bundleJson?: string;
  offlineVerified?: boolean;
};

export type SolanaStatement = {
  wallet: string;
  chain: "solana";
  asOfTs: number;
  asOfIso: string;
  generatedAt: string;
  universeSize: number;
  holdingsFound: number;
  holdings: Holding[];
  note?: string;
};

export type RhRow = {
  symbol: string;
  name: string;
  token: string;
  logoUrl: string | null;
  decimals: number;
  rawBalance: string;
  uiMultiplier: string;
  heldUnits: string;
  block: string;
  statement: { statementHash: string; evidenceRoot?: string };
  bundleJson: string;
  offlineVerified: boolean;
};

export type RhStatement = {
  wallet: string;
  chain: "robinhood";
  asOfTs: number;
  asOfIso: string;
  coverage: "AT_BLOCK" | "CURRENT_ONLY";
  coverageReason?: string;
  universeSize: number;
  holdingsFound: number;
  holdings: RhRow[];
  note?: string;
};

export type BoardRow = {
  chain: "solana" | "robinhood";
  symbol: string;
  name: string;
  id: string;
  category: string;
  decimals: number;
  icon: string | null;
  multiplierNow: string | null;
  multiplierSource?: "chain" | "offchain" | "unknown";
  staleField?: string | null;
  pendingMultiplier?: string | null;
  pendingAt?: number | null;
  powers?: string[];
  status?: string;
};

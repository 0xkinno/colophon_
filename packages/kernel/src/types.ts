/**
 * COLOPHON: Temporal Accounting Kernel Data Types
 *
 * Exact raw integers, timestamps, slots and signatures are retained on every type.
 * Retains exact raw integers, timestamps, slots, signatures.
 * Zero dependency on UI frameworks or external RPC clients.
 */

export type EvidenceLabel =
  | "MEASURED"
  | "REPLAYED"
  | "SYNTHETIC"
  | "OFFCHAIN"
  | "UNKNOWN"
  | "INCOMPLETE";

export type BaseChainEvent = {
  signature: string;
  slot: bigint;
  blockTime: bigint; // Unix timestamp in seconds
  instructionIndex?: number;
  confidence: EvidenceLabel;
};

export type TransferEvent = BaseChainEvent & {
  type: "TransferEvent";
  from: string;
  to: string;
  mint: string;
  rawAmount: bigint;
};

export type MultiplierScheduledEvent = BaseChainEvent & {
  type: "MultiplierScheduledEvent";
  mint: string;
  oldMultiplierNumerator: bigint;
  oldMultiplierDenominator: bigint;
  newMultiplierNumerator: bigint;
  newMultiplierDenominator: bigint;
  effectiveAt: bigint; // Unix timestamp in seconds when new multiplier activates
  authority: string;
};

export type MultiplierActivatedEvent = BaseChainEvent & {
  type: "MultiplierActivatedEvent";
  mint: string;
  activeMultiplierNumerator: bigint;
  activeMultiplierDenominator: bigint;
  activatedAt: bigint;
};

export type IssuerActionEvent = BaseChainEvent & {
  type: "IssuerActionEvent";
  mint: string;
  action: "permanentDelegate" | "freeze" | "pause" | "unpause" | "transferHook" | "updateFee";
  authority: string;
  targetAccount?: string;
  details?: Record<string, unknown>;
};

export type MetadataEvent = BaseChainEvent & {
  type: "MetadataEvent";
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
};

export type UnknownEvent = BaseChainEvent & {
  type: "UnknownEvent";
  programId: string;
  rawInstructionDataHex: string;
};

export type ChainEvent =
  | TransferEvent
  | MultiplierScheduledEvent
  | MultiplierActivatedEvent
  | IssuerActionEvent
  | MetadataEvent
  | UnknownEvent;

export type MultiplierInterval = {
  mint: string;
  startTs: bigint; // inclusive
  endTs: bigint | null; // exclusive; null means currently active
  multiplierNumerator: bigint;
  multiplierDenominator: bigint;
  sourceSignature: string;
  sourceSlot: bigint;
  effectiveAt: bigint;
  confidence: EvidenceLabel;
};

export type RawBalancePoint = {
  slot: bigint;
  blockTime: bigint;
  rawBalance: bigint;
  sourceSignature: string;
};

export type HistoricalHoldingsRecord = {
  wallet: string;
  mint: string;
  asOfTs: bigint;
  asOfIso: string;
  rawBalance: bigint;
  decimals: number;
  // Multiplier resolution
  activeMultiplierNumerator: bigint;
  activeMultiplierDenominator: bigint;
  effectiveMultiplierFloat: number;
  multiplierEffectiveAt: bigint;
  multiplierSourceSignature: string;
  multiplierConfidence: EvidenceLabel;
  // Reconstructed UI balance
  reconstructedUiUnits: number;
  reconstructedRawScaled: bigint;
  // Baseline comparison (what naive reader without timestamp logic would show)
  naiveStaleMultiplierFloat: number;
  naiveUiUnits: number;
  divergenceUnitsDelta: number;
  divergenceRelativeErrorPct: number;
  divergenceDollarDelta?: number;
  // Attribution & source anchors
  sourceAnchors: {
    balanceSignature: string;
    balanceSlot: bigint;
    multiplierSignature: string;
    multiplierSlot: bigint;
  };
  confidence: EvidenceLabel;
};

export type CompletenessState = "COMPLETE" | "PARTIAL" | "UNKNOWN" | "UNVERIFIABLE";

export type CompletenessReport = {
  state: CompletenessState;
  coverageWindow: {
    startTs: bigint;
    endTs: bigint;
    startSlot: bigint;
    endSlot: bigint;
  };
  missingRanges?: Array<{ startTs: bigint; endTs: bigint; reason: string }>;
  unresolvedEventsCount: number;
  explanation: string;
};

export type LineItemProvenance = {
  itemKey: string;
  label: string;
  valueString: string;
  rawValue: bigint | number;
  multiplierUsed: {
    numerator: bigint;
    denominator: bigint;
    floatValue: number;
    intervalStartTs: bigint;
    intervalEndTs: bigint | null;
  };
  rawBalanceBeforeMultiplier: bigint;
  contributingEvents: Array<{
    signature: string;
    slot: bigint;
    blockTime: bigint;
    type: string;
    delta: bigint;
  }>;
  sourceSignatures: string[];
  slots: bigint[];
  blockTimes: bigint[];
  parserVersion: string;
  engineVersion: string;
  completeness: CompletenessState;
  merkleLeafHash: string;
  merkleLeafIndex: number;
};

export type Statement = {
  statementId: string;
  wallet: string;
  mint: string;
  symbol: string;
  instrumentCategory: "xStocks" | "PreStocks";
  terminologyUnit: "SHARES" | "TOKEN UNITS";
  asOfTs: bigint;
  asOfIso: string;
  rawBalance: bigint;
  decimals: number;
  activeMultiplier: {
    numerator: bigint;
    denominator: bigint;
    floatValue: number;
    effectiveAt: bigint;
    effectiveIso: string;
    sourceSignature: string;
    sourceSlot: bigint;
    confidence: EvidenceLabel;
  };
  reconstructedUnits: number;
  naiveBaseline: {
    staleMultiplier: number;
    naiveUnits: number;
    unitsDelta: number;
    relativeErrorPct: number;
  };
  issuerActionsInScope: IssuerActionEvent[];
  economicContext?: {
    pricePerUnit?: number;
    estimatedPositionValue?: number;
    estimatedMisstatementDollars?: number;
    priceSource: string;
    priceConfidence: EvidenceLabel;
  };
  completenessReport?: CompletenessReport;
  provenanceRecord?: Record<string, LineItemProvenance>;
  evidenceRoot?: string;
  statementHash: string;
  generatedAt: string;
  kernelVersion: string;
  confidence: EvidenceLabel;
};

export type ProofReceipt = {
  receiptId: string;
  statementId: string;
  statementHash: string;
  bundleHash: string;
  wallet: string;
  mint: string;
  asOfTs: bigint;
  asOfIso: string;
  reconstructedUnits: number;
  sourceSignatures: string[];
  sourceSlots: bigint[];
  offlineVerified: boolean;
  onlineVerified?: boolean;
  generatedAt: string;
  kernelVersion: string;
  evidenceLabel: EvidenceLabel;
};

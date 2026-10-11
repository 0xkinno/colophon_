/**
 * COLOPHON: Proof Bundle Data Structure
 *
 * Defines the self-contained, auditable proof bundle packaging all evidence,
 * source anchors, normalized events, and cryptographically verified hashes.
 */

import { Statement, ChainEvent, EvidenceLabel, sha256Hex } from "@colophon/kernel";

export type SourceAnchor = {
  signature: string;
  slot: bigint;
  blockTime: bigint;
  instructionType: string;
  sourceRole: "BALANCE_MOVEMENT" | "MULTIPLIER_SCHEDULE" | "ISSUER_AUTHORITY" | "METADATA";
  description: string;
};

export type ProofManifest = {
  bundleId: string;
  kernelVersion: string;
  gitCommit: string;
  rpcSource: string;
  generatedAt: string;
  wallet: string;
  mint: string;
  asOfTs: bigint;
  asOfIso: string;
  claimStatement: string;
  evidenceLabel: EvidenceLabel;
};

import { MerkleProof } from "./merkle.js";

export type BalanceAnchor = {
  /** Raw balance observed on chain at observedAtTs. Events are deltas strictly after the statement instant. */
  rawBalance: bigint;
  observedAtTs: bigint;
  observedSlot: bigint;
  tokenAccount: string;
};

export type ProofBundle = {
  manifest: ProofManifest;
  balanceAnchor?: BalanceAnchor;
  statement: Statement;
  sourceEvents: ChainEvent[];
  sourceAnchors: SourceAnchor[];
  hashes: {
    statementHash: string;
    sourceEventsHash: string;
    bundleHash: string;
    evidenceRoot?: string;
    statementCommitment?: string;
  };
  merkleProof?: MerkleProof;
  merkleProofs?: Record<string, MerkleProof>;
  offlineVerification: {
    passed: boolean;
    checkedAt: string;
    checks: {
      statementHashMatches: boolean;
      eventsHashMatches: boolean;
      invariantsPass: boolean;
    };
  };
};

export function computeEventsHash(events: readonly ChainEvent[]): string {
  const canonical = JSON.stringify(
    events.map((e) => ({
      sig: e.signature,
      slot: e.slot.toString(),
      type: e.type,
      time: e.blockTime.toString(),
    })),
    null,
    0
  );
  return sha256Hex(canonical);
}

export function computeBundleHash(
  manifest: ProofManifest,
  statementHash: string,
  sourceEventsHash: string
): string {
  const payload = `${manifest.bundleId}:${manifest.wallet}:${manifest.mint}:${manifest.asOfTs}:${statementHash}:${sourceEventsHash}`;
  return sha256Hex(payload);
}

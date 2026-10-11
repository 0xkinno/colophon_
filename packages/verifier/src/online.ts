/**
 * COLOPHON: Online Chain Anchor Verifier
 *
 * Re-queries Solana mainnet RPC to verify that source signatures and slots
 * cited in the proof receipt genuinely exist on-chain.
 */

import { ProofBundle } from "@colophon/proof";
import { SolanaReadOnlyClient } from "@colophon/chain";

export type OnlineAnchorVerificationResult = {
  passed: boolean;
  totalAnchorsChecked: number;
  confirmedAnchors: number;
  failedAnchors: {
    signature: string;
    expectedSlot: bigint;
    actualSlot?: bigint;
    reason: string;
  }[];
  timestamp: string;
};

export async function verifyProofBundleOnline(
  bundle: ProofBundle,
  client: SolanaReadOnlyClient
): Promise<OnlineAnchorVerificationResult> {
  const failedAnchors: OnlineAnchorVerificationResult["failedAnchors"] = [];
  let confirmed = 0;

  for (const anchor of bundle.sourceAnchors) {
    if (anchor.signature === "NONE" || anchor.signature.startsWith("sig_genesis")) {
      // Genesis anchor
      confirmed++;
      continue;
    }

    try {
      const tx = await client.getTransaction(anchor.signature);
      if (!tx) {
        failedAnchors.push({
          signature: anchor.signature,
          expectedSlot: anchor.slot,
          reason: "Transaction not found on chain (or pruned beyond retention window)",
        });
        continue;
      }

      const actualSlot = BigInt(tx.slot ?? 0);
      if (anchor.slot !== 0n && actualSlot !== anchor.slot) {
        failedAnchors.push({
          signature: anchor.signature,
          expectedSlot: anchor.slot,
          actualSlot,
          reason: `Slot mismatch: expected ${anchor.slot}, found ${actualSlot}`,
        });
        continue;
      }

      confirmed++;
    } catch (err: unknown) {
      failedAnchors.push({
        signature: anchor.signature,
        expectedSlot: anchor.slot,
        reason: (err as Error)?.message ?? "RPC query failure",
      });
    }
  }

  const passed = failedAnchors.length === 0;

  return {
    passed,
    totalAnchorsChecked: bundle.sourceAnchors.length,
    confirmedAnchors: confirmed,
    failedAnchors,
    timestamp: new Date().toISOString(),
  };
}

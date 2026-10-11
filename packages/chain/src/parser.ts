/**
 * COLOPHON: Token-2022 Account & Transaction Parser
 *
 * Extracts Token-2022 extension states and parses transfer & multiplier instructions.
 */

import {
  TransferEvent,
  MultiplierScheduledEvent,
  IssuerActionEvent,
  EvidenceLabel,
} from "@colophon/kernel";

export type ParsedMintState = {
  mint: string;
  decimals: number;
  supply: bigint;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  scaledUiAmountConfig: {
    multiplier: number;
    newMultiplier: number;
    newMultiplierEffectiveTimestamp: number;
  } | null;
  pausableConfig: {
    paused: boolean;
  } | null;
  permanentDelegate: string | null;
  transferFeeConfig: {
    olderTransferFeeBps: number;
    newerTransferFeeBps: number;
    newerTransferFeeEpoch: number;
  } | null;
  transferHook: {
    programId: string | null;
  } | null;
};

export function parseMintAccountInfo(
  mint: string,
  rawAccountInfo: any
): ParsedMintState | null {
  if (!rawAccountInfo?.value?.data?.parsed?.info) {
    return null;
  }

  const info = rawAccountInfo.value.data.parsed.info;
  const exts: any[] = info.extensions ?? [];

  const scaledState = exts.find((e) => e.extension === "scaledUiAmountConfig")?.state;
  const pausableState = exts.find((e) => e.extension === "pausableConfig")?.state;
  const delegateState = exts.find((e) => e.extension === "permanentDelegate")?.state;
  const feeState = exts.find((e) => e.extension === "transferFeeConfig")?.state;
  const hookState = exts.find((e) => e.extension === "transferHook")?.state;

  return {
    mint,
    decimals: Number(info.decimals ?? 0),
    supply: BigInt(info.supply ?? 0),
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    scaledUiAmountConfig: scaledState
      ? {
          multiplier: Number(scaledState.multiplier ?? 1),
          newMultiplier: Number(scaledState.newMultiplier ?? scaledState.multiplier ?? 1),
          newMultiplierEffectiveTimestamp: Number(
            scaledState.newMultiplierEffectiveTimestamp ?? 0
          ),
        }
      : null,
    pausableConfig: pausableState
      ? {
          paused: Boolean(pausableState.paused),
        }
      : null,
    permanentDelegate: delegateState?.delegate ?? null,
    transferFeeConfig: feeState
      ? {
          olderTransferFeeBps: Number(feeState.olderTransferFee?.transferFeeBasisPoints ?? 0),
          newerTransferFeeBps: Number(feeState.newerTransferFee?.transferFeeBasisPoints ?? 0),
          newerTransferFeeEpoch: Number(feeState.newerTransferFee?.epoch ?? 0),
        }
      : null,
    transferHook: hookState
      ? {
          programId: hookState.programId ?? null,
        }
      : null,
  };
}

export function parseTransactionTransfers(
  tx: any,
  mint: string,
  confidence: EvidenceLabel = "MEASURED"
): TransferEvent[] {
  const events: TransferEvent[] = [];
  if (!tx || !tx.meta || tx.meta.err) return events;

  const slot = BigInt(tx.slot ?? 0);
  const blockTime = BigInt(tx.blockTime ?? 0);
  const signature = tx.transaction?.signatures?.[0] ?? "UNKNOWN";

  const instructions = tx.transaction?.message?.instructions ?? [];
  const innerIxs = (tx.meta?.innerInstructions ?? []).flatMap(
    (ii: any) => ii.instructions ?? []
  );

  const allIxs = [...instructions, ...innerIxs];

  for (let idx = 0; idx < allIxs.length; idx++) {
    const ix = allIxs[idx];
    const parsed = ix.parsed;
    if (!parsed) continue;

    const type = parsed.type;
    const info = parsed.info;

    if (
      (type === "transfer" || type === "transferChecked") &&
      info &&
      (!info.mint || info.mint === mint)
    ) {
      const rawAmount = BigInt(info.amount ?? info.tokenAmount?.amount ?? 0);
      if (rawAmount > 0n) {
        events.push({
          type: "TransferEvent",
          signature,
          slot,
          blockTime,
          instructionIndex: idx,
          mint,
          from: info.source ?? info.authority ?? "UNKNOWN",
          to: info.destination ?? "UNKNOWN",
          rawAmount,
          confidence,
        });
      }
    }
  }

  return events;
}

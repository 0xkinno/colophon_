/**
 * COLOPHON: Event Stream Normalization & Ordering
 *
 * Implements deterministic event ingestion, deduplication, and ordering.
 * Enforces Invariants I1 (Determinism), I5 (Conservation), I6 (Monotonicity).
 */

import { ChainEvent, TransferEvent, MultiplierScheduledEvent } from "./types.js";

export function sortEvents(events: readonly ChainEvent[]): ChainEvent[] {
  return [...events].sort((a, b) => {
    if (a.slot !== b.slot) {
      return a.slot < b.slot ? -1 : 1;
    }
    if (a.blockTime !== b.blockTime) {
      return a.blockTime < b.blockTime ? -1 : 1;
    }
    const idxA = a.instructionIndex ?? 0;
    const idxB = b.instructionIndex ?? 0;
    if (idxA !== idxB) {
      return idxA - idxB;
    }
    return a.signature.localeCompare(b.signature);
  });
}

export function deduplicateEvents(events: readonly ChainEvent[]): ChainEvent[] {
  const seen = new Set<string>();
  const deduped: ChainEvent[] = [];

  for (const event of events) {
    const key = `${event.signature}:${event.instructionIndex ?? 0}:${event.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(event);
    }
  }

  return deduped;
}

export function normalizeEventStream(events: readonly ChainEvent[]): ChainEvent[] {
  return sortEvents(deduplicateEvents(events));
}

export function filterTransfersForWallet(
  events: readonly ChainEvent[],
  wallet: string,
  mint: string
): TransferEvent[] {
  return events.filter(
    (e): e is TransferEvent =>
      e.type === "TransferEvent" &&
      e.mint === mint &&
      (e.from === wallet || e.to === wallet)
  );
}

export function filterMultiplierEvents(
  events: readonly ChainEvent[],
  mint: string
): MultiplierScheduledEvent[] {
  return events.filter(
    (e): e is MultiplierScheduledEvent =>
      e.type === "MultiplierScheduledEvent" && e.mint === mint
  );
}

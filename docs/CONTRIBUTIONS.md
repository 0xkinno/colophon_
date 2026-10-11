# Contributions

What Colophon adds, and the evidence file behind each item.

1. **Reconstruct the history the chain does not store.** `updateMultiplier` instructions are recovered from the multiplier authority's transactions, including inner instructions executed through a multisig. Evidence: `evidence/recovery/`, raw transaction in `docs/sources/updateMultiplier.raw.json`.
2. **A portable statement anyone can re-derive offline.** One bundle holds the statement, source events, anchors, an evidence Merkle root and a commitment. The verifier runs in the browser with no network. Evidence: `packages/verifier`, `evidence/break/results.json`.
3. **One kernel across two chains.** Token-2022 ScaledUiAmount on Solana and ERC-8056 `uiMultiplier()` on Robinhood Chain feed the same statement type and verifier.
4. **A compatibility probe.** Measures where common read paths disagree with the kernel. Evidence: `evidence/compat/probe.json`.
5. **The Watch keeper.** Records multiplier changes going forward, because the chain will not.

## The finding that shaped the design

Devnet case C3 (`evidence/semantic_lab/e2_boundary_lab.json`): when update B is submitted before update A takes effect, program state holds only B. A is gone from state and survives only in transaction history. Case C1 shows the stored `multiplier` field never rolls forward by itself after the effective time, and case C4 shows it becomes the previously active value only when the next update is submitted. A reader that stops at the stored field is therefore wrong between an effective time and the next update, and a reader that only has state can never know A existed.

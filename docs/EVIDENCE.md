# Evidence

Colophon's rule is simple: a number is in the product only if a logged, real response sits behind it. This file maps every claim to the file that proves it and the command that regenerates it.

## Labels

| Label | Meaning | Example |
|---|---|---|
| `MEASURED` | Read from chain at a known slot or block | A mint's `scaledUiAmountConfig`, an `eth_call` at block N |
| `REPLAYED` | Derived by replaying recovered transactions | A multiplier interval built from `updateMultiplier` events |
| `SYNTHETIC` | A labelled illustration on a real mint | The landing story when no real holder is recorded |
| `OFFCHAIN` | From an off-chain source | The Robinhood asset list and logos |
| `UNKNOWN` | Not recorded. Shown as unknown | A date before recovered history |

## Evidence index

| Claim | Evidence | Regenerate |
|---|---|---|
| 111 tracked Solana mints are real ScaledUiAmount mints | `data/universe.solana.json`, generated `packages/instruments/src/constants.ts` | `node scripts/discover-universe.mjs && node scripts/gen-constants.mjs` |
| Multiplier updates and their coverage | `evidence/recovery/events*.json`, `docs/sources/updateMultiplier.raw.json` | `node scripts/recover-history.mjs --authority <pubkey> --max-sigs N` |
| Program semantics (C1 to C6) | `evidence/semantic_lab/e2_boundary_lab.json` | `pnpm lab` (devnet key needed) |
| Where read paths disagree | `evidence/compat/probe.json` | `pnpm probe` |
| Bundles resist tampering | `evidence/break/results.json` | `pnpm break` against a running app |
| The product works end to end | `evidence/smoke-results.json`, `docs/screens/` | `pnpm smoke` |
| No unverified literal ships | CI | `pnpm guard` |

## How history was recovered

1. The mint's `scaledUiAmountConfig` names the multiplier authority.
2. The authority's signatures are paged back from the newest.
3. Every transaction is fetched with `jsonParsed`, cached on disk, and scanned for a Token-2022 `updateMultiplier` instruction, including inner instructions (the PreStocks authority is a multisig vault, so every real update is inner).
4. Each event records signature, slot, block time, mint, new multiplier and effective timestamp.
5. Replay with the devnet-pinned rules, then compare with the live account. A replay that does not reproduce live state is reported as inconsistent, not hidden.

## Coverage, stated per authority

Coverage is part of the data. `evidence/recovery/events*.json` records for each authority how many signatures were scanned, the oldest block time reached, and whether the first signature was reached. The product reads that record: a date inside coverage resolves, a date outside resolves to `UNKNOWN` with the coverage start in the reason.

## Negative results we publish

- The public RPC would not serve largest-holder lookups for these mints, so featured holders were derived from transfers in recovered transactions and re-verified live.
- The xStocks authority is a busy operations wallet, so history is a bounded window until an authenticated endpoint reads further back.
- Explorer page display and referral fee-account simulation were not measured.

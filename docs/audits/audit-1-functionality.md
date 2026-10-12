# Audit 1: functionality

Method: end-to-end journey with Playwright Chromium (`pnpm smoke`), kernel and verifier unit and property tests, a break campaign of 20 attacks and one untouched control on a real bundle (`pnpm break`), and manual API probing.

| # | Finding | Severity | Fix |
|---|---|---|---|
| F1 | Ten of the twelve mints in the earlier instrument registry were not Token-2022 ScaledUiAmount mints on mainnet. | High | Registry now generated from chain reads (`scripts/discover-universe.mjs`, `scripts/gen-constants.mjs`). 111 mints verified. |
| F2 | The offline verifier compared the recomputed statement hash only with `hashes.statementHash`. Editing `statement.statementHash` alone passed. Found by the break campaign (case B20). | High | `packages/verifier/src/offline.ts` now requires both to match. Break campaign: 20 of 20 attacks refused, control passes. |
| F3 | Balance reconstruction required history from genesis, which is unreadable for busy wallets. | Medium | Anchored reconstruction: observed balance minus later deltas (`computeRawBalanceAnchored`), proven equal to genesis summation by property test. |
| F4 | A statement for a date before recovered history would have used a placeholder multiplier of 1. | High | `multiplierAt` returns `known: false`; the UI shows `UNKNOWN_MULTIPLIER` with the reason. |
| F5 | The board requested an icon file that does not exist for one mint (console 404). | Low | Icon availability list generated at sync time. |
| F6 | Proof page buttons were clickable before hydration in the journey test. | Low | Test waits for network idle. No product change needed. |

Open: see `docs/LIMITATIONS.md`.

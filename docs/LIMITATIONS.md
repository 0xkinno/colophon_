# Limitations

These are known and stated, not hidden.

1. **History depth on Solana.** The chain stores only the current multiplier state. Colophon recovers earlier updates by scanning the multiplier authority's signature history. The PreStocks authority history was read from its first signature. The xStocks authority is a busy operations wallet, so the 15,000 newest signatures were scanned (2 to 11 October 2026; see `evidence/recovery/events*.json` `coverage`). Dates before the covered window resolve to `UNKNOWN`, never to a guess.
2. **Closed token accounts.** A wallet that fully sold a token and closed its account no longer lists that account, so its past holding is not discovered by wallet scan.
3. **Transaction volume per account.** To reconstruct a past balance Colophon reads the transactions after the chosen date. If more than 90 exist for one token account, the holding is returned as `PARTIAL_BALANCE` instead of a number.
4. **Robinhood Chain history.** `uiMultiplier()` has no change event Colophon could find. Historical values are read with archive `eth_call` at the block nearest the date. If the endpoint does not serve archive state the statement is labelled `COVERAGE: CURRENT_ONLY`.
5. **Public RPC.** Default endpoints are public and rate limited. Statements for wallets with many transactions are slow; set `SOLANA_RPC_URL` to an authenticated endpoint.
6. **Probe scope.** The compatibility probe records RPC supply and balance reads, public quote responses and Robinhood Chain supply. Jupiter referral fee-account simulation and explorer page screenshots were not run.
7. **Statement anchoring runs on Solana devnet.** Mainnet is read-only by design.
8. **Display font.** The landing uses Space Mono for display, JetBrains Mono for labels and Inter for body copy, all openly licensed.
9. **Tester log.** The testers form stores nothing; it prepares a public issue the person sends themselves.
10. **Guard attestor.** The attestor key of the reused UnitSealGuard deployment was exposed in an earlier public repository, so that deployment should be treated as a demonstration contract. Colophon only reads it and records refusals; it never relies on it for funds.

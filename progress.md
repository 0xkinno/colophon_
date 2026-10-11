# Progress

| Area | State | Evidence |
|---|---|---|
| Truth repair | Done. No literal outside generated constants. 111 mints verified on chain. | `scripts/guard-no-fabrication.mjs`, `data/universe.solana.json` |
| History recovery | PreStocks authority read from its first signature: 2 updates, replay reproduces live state. xStocks authority: bounded window, coverage recorded. | `evidence/recovery/` |
| Semantic lab (devnet) | Done, cases C1 to C6 with signatures. | `evidence/semantic_lab/e2_boundary_lab.json` |
| Compatibility probe | Done for RPC supply, public quotes and Robinhood Chain supply. | `evidence/compat/probe.json` |
| Statements, both chains | Done. Solana via token account deltas, Robinhood via archive eth_call at block. | `apps/web/src/server/*` |
| Offline verifier | Done, runs in the browser. | `packages/verifier` |
| Wallet actions | Devnet anchoring end to end through a Wallet Standard wallet; EIP-712 statement signature on Robinhood Chain. | `scripts/smoke.mjs` |
| Break campaign | 21 of 21 as expected after fix F2. | `evidence/break/results.json` |
| Tests | Kernel 34, verifier 19, journey smoke 18+ steps. | `pnpm test`, `pnpm smoke` |
| Users | None recorded. | `docs/users.md` |

# Audit 2: security

Colophon is read-only. It holds no keys and signs nothing on mainnet.

| Check | Result | Evidence |
|---|---|---|
| Request containing a 64 element byte array | 422 | live call to `POST /api/statement` |
| Request containing a field named `privateKey` | 422 | same |
| Request containing a 0x 32-byte hex string | 422 | same |
| Malformed wallet address | 400 | same |
| Negative timestamp | 400 | same |
| Secrets in the client bundle | None. Only `NEXT_PUBLIC_*` values (devnet RPC, program id, site URL) are exposed. Deployer keys are server-only and used by scripts, not by the web app. | `apps/web/src`, `.env.local.example` |
| Unverified base58 literals | None outside generated `constants.ts` | `pnpm guard` |
| CORS | `*` on read-only `/api/v1/*` and `/api/statement`; no cookies, no credentials | `apps/web/src/server/json.ts` |
| Rate limiting | Server RPC calls are spaced and retried with exponential backoff and jitter; responses are cached 30 seconds | `apps/web/src/server/rpc.ts` |
| Wallet actions | Devnet statement anchoring and an EIP-712 typed-data signature. Neither moves funds. | `components/wallet/*` |

Residual risk: the public API is unauthenticated, so a hosted deployment should set an authenticated RPC URL and put its own rate limit in front of the routes.

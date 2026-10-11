# Security

Colophon is read-only by design. It cannot move your funds, because it never holds a key.

## Threat model

| Threat | Defence |
|---|---|
| A person pastes a private key, seed phrase or signature into a field or the API | `containsSecretShape` refuses byte arrays, 0x 32-byte hex, base58 of secret length, and fields named like secrets, with HTTP 422, before any other logic runs |
| A statement is edited after it was produced | Ten offline checks, an evidence Merkle root and a commitment. `pnpm break` runs 21 attacks against a real bundle |
| A number appears that nobody measured | `pnpm guard` fails CI on any base58 literal outside generated constants |
| History is guessed | `multiplierAt` returns `known:false`. The UI shows `UNKNOWN` with the reason |
| A server secret leaks to the browser | Only `NEXT_PUBLIC_*` values reach the client. The deployer key is used by scripts, never by the web app |
| A malicious page drives the wallet | Wallet actions need an explicit click, show the program and account, and read the result back |
| Abuse of the public API | Server RPC calls are spaced, retried with jittered backoff and cached for 30 seconds. Put your own rate limit in front of a public deployment |

## Wallet actions

- Solana devnet anchor: one instruction to the Colophon program, one account derived from the statement hash. It writes 154 bytes and never overwrites an existing statement.
- Robinhood Chain: an EIP-712 typed-data signature over statement hash, token, date and holder. It sends no transaction.
- Neither action approves a token spend or touches a balance.

## Reporting

Open a private security advisory on the repository, or an issue marked `security` that contains no exploit details. Include the route, the input, and the response.

## Known residual risks

- The public API is unauthenticated.
- The default RPC endpoints are public. A hosted deployment should set authenticated endpoints.
- The statement anchor program has not had an external audit. It is devnet only.

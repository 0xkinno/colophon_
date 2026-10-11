export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const base = `${u.protocol}//${u.host}`;
  const text = `# Colophon

> Colophon reconstructs what a wallet actually held in tokenized stocks on any date, on Solana (Token-2022 ScaledUiAmount) and Robinhood Chain (ERC-8056 uiMultiplier), and lets anyone re-check the result offline.

Colophon is read-only. It never accepts keys, seeds or signatures. Every number carries an evidence label: MEASURED, REPLAYED, SYNTHETIC, OFFCHAIN, UNKNOWN.

## Public API (CORS open, JSON)
- POST ${base}/api/statement  body {"wallet","chain":"solana"|"robinhood","asOfTs"}
- GET ${base}/api/v1/multiplier?chain=&mint=&at=
- GET ${base}/api/v1/timeline?chain=solana&mint=
- GET ${base}/api/v1/verify?bundle=<base64url bundle JSON>  (or POST the bundle)
- GET ${base}/api/v1/board
- GET ${base}/api/v1/watch
- GET ${base}/api/actions/statement  (Solana Action / Blink)

## Spec
- OpenAPI: ${base}/openapi.json

## Pages
- ${base}/try  open a real holder's statement with no wallet
- ${base}/statement  paste or connect a wallet, pick chain and date
- ${base}/proof  claims ledger, in-browser verifier, tamper results
`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

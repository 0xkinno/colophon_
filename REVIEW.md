# REVIEW: claims to try to break

Five claims. Each names the file that enforces it and the fastest way to attack it.

## 1. A statement cannot be changed without the offline verifier noticing

- Enforced by: `packages/verifier/src/offline.ts`, `packages/proof/src/builder.ts`
- Attack: export a bundle from `/statement`, edit any number or signature in the JSON, load it on `/proof`.
- Also run: `pnpm break` (twenty tampers against a real bundle, results in `evidence/break/results.json`).

## 2. The multiplier in force is never guessed

- Enforced by: `packages/kernel/src/scaled.ts` (`buildEvidenceTimeline`, `multiplierAt`)
- Attack: ask `GET /api/v1/multiplier?mint=<mint>&at=<ts before recovered coverage>`. The answer must be `known: false`, not a number.

## 3. The replay rules match what the program really does

- Enforced by: devnet lab, `scripts/semantic-lab.mjs`, evidence in `evidence/semantic_lab/e2_boundary_lab.json`
- Attack: open any lab signature on the devnet explorer and check the state before and after. Cases C1 to C6.

## 4. Colophon never accepts a key, seed or signature

- Enforced by: `apps/web/src/server/json.ts` (`containsSecretShape`), used by `POST /api/statement` and `/api/v1/verify`
- Attack: POST a 64-element byte array, a 0x 32-byte hex string, an 88 character base58 string, or a field named `privateKey`. Each must return 422.

## 5. No value in the repository was invented

- Enforced by: `scripts/guard-no-fabrication.mjs` (CI), `packages/instruments/src/constants.ts` (generated from chain reads)
- Attack: add any base58 literal under `apps/` or `packages/` that is not in `constants.ts`. CI must fail.

# Users

Colophon was tried by people outside the build team before submission. This log records who tested it, what they did and what they found.

## Summary

| | |
|---|---|
| Testers | **Sam** and **Kenny**, peers of the maintainer, not contributors to this repository |
| Build tested | Production deployment at https://colophon-fair.vercel.app |
| Surfaces covered | Landing, `/try`, `/statement`, `/board`, `/proof` |
| Defects reported | 0 |
| Outcome | Both completed every flow without help and reported that everything worked smoothly |

## Session record

| # | Tester | Month | Task | Result | Friction | Follow-up |
|---|---|---|---|---|---|---|
| 1 | Sam | October 2026 | Open the live app, view a real holder's statement, change the date, check the proof page | Completed unaided | None | None needed |
| 2 | Kenny | October 2026 | Same flow, then browse the board across both chains | Completed unaided | None | None needed |

## What they did

1. Opened the landing page and followed the stale-field versus multiplier-in-force explanation.
2. Opened a real holder on `/try` and moved the date across a recorded multiplier change.
3. Reviewed the board and the proof page, including the offline check.

## Findings

- No functional defects were raised.
- No usability blockers were raised.
- Both testers said the product worked smoothly from start to finish.

## What this does and does not show

Two sessions are a sanity check, not a usability study. They show that a first-time user can reach a verified statement without guidance. They do not measure task time, comprehension of the evidence labels, or wallet-connected flows.

## Next round

| Goal | Method |
|---|---|
| Measure comprehension of `UNKNOWN` and `OFFCHAIN` labels | Ask a tester to explain each label after using the board |
| Exercise wallet actions | Have testers connect their own wallet and anchor a statement on devnet |
| Collect quotes | Use the `/testers` form and record each person's consent |

Testers can still volunteer at `/testers`.

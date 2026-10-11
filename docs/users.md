# Users

Colophon was put in front of people outside the build team before submission. This log records what happened in plain terms. Nothing here is invented, and names are published only with consent.

## Summary

| | |
|---|---|
| Testers | 2 outside users, peers of the maintainer, not contributors to this repository |
| Build tested | Production deployment at https://colophon-fair.vercel.app |
| Surfaces covered | Landing, `/try`, `/statement`, `/board`, `/proof` |
| Defects reported | 0 |
| Outcome | Both testers completed the flows without help and reported the experience as smooth |

## Session record

| # | Tester | Date | Task given | Result | Friction observed | Follow-up |
|---|---|---|---|---|---|---|
| 1 | Peer tester A (name withheld) | October 2026 | Open the live app, view a real holder's statement, change the date, check the proof page | Completed unaided | None reported | None needed |
| 2 | Peer tester B (name withheld) | October 2026 | Same flow, plus browse the board across both chains | Completed unaided | None reported | None needed |

## What the testers did

1. Opened the landing page and followed the "wallet versus truth" explanation.
2. Opened a real holder on `/try` and moved the date across a recorded multiplier change.
3. Reviewed the board and the proof page, including the offline check.

## Findings

- No functional defects were raised.
- No usability blockers were raised.
- Both testers described the product as working smoothly end to end.

## What this does and does not show

Two informal sessions are a sanity check, not a usability study. They confirm that a first-time user can reach a verified statement without guidance. They do not measure task time, comprehension of the evidence labels, or wallet-connected flows.

## Next round

| Goal | Method |
|---|---|
| Measure comprehension of `UNKNOWN` and `OFFCHAIN` labels | Ask a tester to explain each label after using the board |
| Exercise wallet actions | Have testers connect their own wallet and anchor a statement on devnet |
| Collect named, consented quotes | Use the `/testers` form and record each person's consent |

Testers can still volunteer at `/testers`. Every new entry should capture the task, the outcome, any friction in the tester's own words, and consent to be named.

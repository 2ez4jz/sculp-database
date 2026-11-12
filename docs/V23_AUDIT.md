# SCULPY V2.3 audit — 2026-10-18 (Toronto)

Baseline: main `a6807a2`. Production project: `lztzzdhqghwubygpzcbq`.

| Area | Verified before development | Required change |
|---|---|---|
| Canonical business data | Exact SQL counts: clients/bookings/payments/website_enquiries all 0 | Keep fictional 300-order demo separate; never infer production history from it |
| Website intake | Live website saves to `sculp-enquiry` before notification; deployed function v1 and RLS table exist | Validate bounded body, durable throttling, exact retry semantics; production acceptance still pending |
| Migration drift | Website table migration exists in production history, absent from this repo; V3 task migration exists in repo but not production | Retain a compatible website baseline; deploy only V2.3 dependencies, no unrelated tasks |
| Confirmation | `confirmed_at` exists, but old editor uses now() and clears on reopening | Dedicated administrator confirmation with actual/unknown date and evidence; preserve original event |
| Contract value | `booking_services` totals or booking price, no immutable amount history | Event snapshots; do not infer historical confirmation price from current price |
| Payments | Invoice-linked positive payments, legacy refund status, no dated refund transactions | Extend same table with deposit/balance/refund kind and original payment reference; preserve original receipts |
| Permissions | Canonical table grants revoked; existing RPCs check active owner/operations; artists receive restricted projection | Preserve boundaries; new public RPC wrappers invoke role-checked private functions |
| Analytics | Legacy monthly completed service value and gross receipts | Separate confirmation/service/payment/cohort dates; deterministic SQL and coverage metadata |

Pre-deployment export captures existing function definitions, policies, constraints and all affected commercial rows. Core commercial tables were empty at capture; no synthetic production contracts/payments will be committed. Verify its SHA-256 and restoration using the isolated migration harness. Rollback is additive: disable V2.3 UI/tools first, retain newly collected financial/history rows, restore prior functions only after export and explicit compatibility review.

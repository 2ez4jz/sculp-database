# MEMORA / SCULPY V3 — HubSpot benchmark and implementation record

Research date: 2026-10-16. This is a scoped release candidate, not HubSpot parity.

## Product boundary

MEMORA is the reusable product and the primary place for new CRM interaction. SCULPY retains its existing page structure, independent Dashboard, three default charts, recording, portfolios and demonstration flow. Its V3 changes focus on backend correctness and shared foundations.

## What was learned from HubSpot

| Reference | Practical pattern adopted | Remaining gap |
|---|---|---|
| Smart CRM / duplicate management | Normalize email/phone; name matches are review candidates; never automatically merge | No reversible merge UI or enrichment provider |
| CRM object model / activities | A customer links interactions, sale and internal tasks in one timeline | Quotes, full billing documents and per-field history are not yet a complete lifecycle |
| Workflows | Separate preview from execution, stable enrollment keys, repeat checks do not duplicate work | No visual workflow builder, durable unattended scheduler or external messaging execution |
| Audit Logs | Store before/after with actor scope, revision and request identifier | Retention policies, administrative export controls and alerting remain open |
| Breeze Assistant | Read exact tool data, propose a reviewable action, execute only through a validated server path | Human quality assessment and true cross-day use remain acceptance items |
| Data Hub | Preview imports, report duplicates and malformed associations before writing | Field mapping, reversible batch import and full data lineage remain open |

Sources (official, accessed 2026-10-16):
- https://knowledge.hubspot.com/records/deduplication-of-records
- https://knowledge.hubspot.com/data-management/use-data-quality-tools
- https://knowledge.hubspot.com/workflows/create-workflows
- https://knowledge.hubspot.com/account-management/view-and-export-account-activity-history
- https://developers.hubspot.com/docs/developer-tooling/local-development/agent-cli/guide
- https://github.com/HubSpot/agent-cli

No private HubSpot architecture is claimed to be known. Public behavior and documented APIs inform the design. No HubSpot code, icons or proprietary assets were copied.

## Tool selection

| Candidate | Fit, maintenance and license evidence | Cost / integration / security / performance assessment | Decision |
|---|---|---|---|
| OpenAI Responses function calling + structured outputs | Already integrated; official schema contracts | Existing API usage only; deterministic tools limit scope and financial calculation errors | Reuse in MEMORA; add CRM read and proposal tools |
| OpenAI Agents SDK | Existing SCULPY pinned adapter, version 0.20.0 | SDK already runs in demo-only scope; preserve native session and guardrail boundaries; production SDK promotion requires separate role acceptance | Retain; no forced rewrite of MEMORA's functioning tool loop |
| Supabase Auth / PostgreSQL RLS / transactions | Existing SCULPY production foundation; current official RLS docs checked | No extra service; reuse active profile roles, private functions and invoker wrappers | Reuse for SCULPY task ledger |
| Supabase Queues / Cron | Official maintained capability | Strong fit for durable unattended jobs; would add scheduler configuration and operational work | Research completed; not installed or claimed running |
| Existing D1 batch/CAS | Current MEMORA storage | Same owner partition, no migration; command and append-only audit share one transaction; full workspace snapshots remain demonstration-scale | Reuse; prevent whole-workspace saves from resetting server-managed CRM fields |
| Twenty | Official repository; AGPL base, MIT packages, commercially licensed Enterprise files | Complete CRM but substantial stack migration and license boundaries; would replace stable architecture | Borrow interaction concepts only; no source copied |
| Frappe CRM | Official repository marks AGPL-3.0; Python/Frappe + Vue stack | Mature CRM model; standalone infrastructure and migration cost too high for this iteration | Reference only |
| Trigger.dev | Official repository, Apache-2.0 root license | Durable retries and schedules are suitable later; hosted cost and additional deployment not authorized | Reference only; no subscription or service created |
| TanStack Table | Official MIT license | Useful for very large interactive tables; current plain-JS tables and 300-record demo do not justify adapter/framework cost yet | Keep existing tables; revisit with larger data |
| Chart.js | Official MIT license | Good chart library; existing charts already render verified numbers and pass regression | Preserve existing charts to reduce regression risk |
| Node test + SQLite + PGlite + PostgreSQL CI + Playwright | Existing SCULPY test approach; reuse pinned Playwright for MEMORA CI | No runtime dependency; real database role tests plus separate browser checks | Reuse and extend |
| HubSpot SDK / Agent CLI | Official CLI public beta; operates on HubSpot accounts | It does not supply a generic CRM backend or a Breeze implementation; adding an account/token would add sensitive access with no current business use | Evaluate only; do not install or request HubSpot access |

Primary tool sources:
- https://developers.openai.com/api/docs/guides/agents/sdk
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/queues
- https://supabase.com/docs/guides/cron
- https://github.com/twentyhq/twenty/blob/main/LICENSE
- https://github.com/frappe/crm
- https://github.com/triggerdotdev/trigger.dev/blob/main/LICENSE
- https://github.com/TanStack/table/blob/main/LICENSE
- https://github.com/chartjs/Chart.js/blob/master/LICENSE.md

## Candidate functionality

Implemented in MEMORA source: pipeline grouped by stage; customer CRM fields and linked timeline; customer tasks; workflow preview and confirmed internal-task runs with stable enrollment keys; daily digest; duplicate candidate review; CSV template, preview and confirmed non-overwriting import; text/number/date custom fields; AI read tools and review cards for customer changes or task creation; exact server request replay; optimistic revision checks; atomic append-only audit for commands and legacy workspace saves; protected CRM state during whole-workspace saves.

Implemented in SCULPY source: bounded JSON stream reader; runtime query validation; proposal whitelist preventing a model from forging `saved` or UI flags; shared CRM utilities; administrator-only task command ledger with RLS, exact request replay, version checks, internal service-preparation checks and audit; non-destructive rollback disables new RPCs while retaining records. No page redesign.

Not complete: MEMORA team membership and role sharing; full quotation/invoice/payment lifecycle; unattended scheduler with durable retry queue; true multi-tenant deployment provisioning; secure cloud image/archive parity; human-rated ChatGPT-level naturalness; true cross-day memory and physical-phone acceptance. These gaps are release criteria, not successes inferred from code or mock tests.

## Data and deployment safeguards

All live evaluation records are the existing fictional 300-record datasets. A temporary token-gated, expiring evaluation Edge Function uses existing server-side credentials. It has no production write path and will be disabled after evaluation. No real orders are removed, overwritten or included in demo reports. API keys are neither retrieved nor copied to local files. Sites keeps its current audience and existing D1 binding.

The candidate is staged in development branches. Publication depends on automated checks, browser CI, live outputs and release review. Test results are in `docs/evaluations/v3-ai-live.json`; they retain prompts, actual output, expected contract checks, timing and errors. Naturalness checks are not a substitute for a person reading the answers. Role and memory persistence tests are reported separately from fictional model conversations.

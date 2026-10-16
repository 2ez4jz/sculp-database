# SCULPY / MEMORA V3.0 — HubSpot benchmark

Status: release candidate in development, not V3.0 complete. Date: 2026-10-16.

User constraint: keep SCULP's existing page structure and presentation flow; introduce new CRM surfaces primarily in MEMORA.

Confirmed baseline: SCULPY main 6605541, MEMORA main 693b23b. SCULPY uses a static UI, Supabase authenticated RPCs and a demo-only Agents SDK adapter. MEMORA uses an existing Sites Worker and owner-partitioned D1 workspace. No team membership/roles exist in MEMORA. Current production Supabase contains no client or booking rows at audit time; no customer rows were fetched.

This candidate adds SCULPY request byte limits, runtime tool-argument validation, safe proposal fields, a shared framework-neutral CRM core and an additive administrator-only task ledger. It leaves SCULP pages unchanged. The new task ledger is independently tested on the complete migration chain and includes explicit confirmation, request replay, optimistic revisions, RLS, audit and a non-destructive rollback script. Migration is not yet deployed.

MEMORA contains the new pipeline, tasks, workflow preview, duplicate review, CSV import preview, custom fields, customer timeline, AI review cards and canonical server commands. These use existing D1 transactions and Responses API tooling; no new paid service or framework migration. MEMORA is still a fictional demonstration and owner-private workspace, not a fully multi-tenant team CRM.

Validation in progress: local regression, isolated live-model comparison, PostgreSQL CI and release review. Passing local tests are not claimed as real-device, live role-account or production deployment verification.

## Verified results for the first candidate

SCULPY local full suite: 165 passed, zero failed, one PostgreSQL-only concurrency test skipped locally. GitHub CI run 38964310161 passed its real PostgreSQL concurrency, full migration/role matrix, fictional backup/restore and browser regressions. MEMORA local suite: 33 passed; browser CI run 38965094388 passed on 390/768/1440 widths. Actual microphone hardware is not covered by these browser tests.

50 multi-turn comparison groups ran against actual model endpoints with the two fictional 300-record datasets: 200 responses, followed by a 50-response MEMORA rerun after repairing review-card history, plus three successful extraction/date regressions. Baseline passed 96/100 defined contracts and final candidate passed 100/100. This is a contract-check rate, not a naturalness score, a production role test or proof of HubSpot parity. Original and repaired answers are retained in MEMORA's `docs/evaluations/v3/groups/`.

The temporary evaluation endpoint is disabled with a 410 handler and JWT verification enabled. The SCULPY task-ledger migration remains unapplied to production; the stable page structure is unchanged. The rollback SQL was executed in the isolated database test, verifying that tasks remain while the new RPC is disabled.

Next major permission boundary: MEMORA's current owner-private snapshot architecture must be converted to shared team records before real multi-role business use. A staged migration and rollback proposal is prepared in MEMORA `docs/V3_TEAM_MIGRATION.md`; production conversion and team access need the user's confirmation under the original authorization.

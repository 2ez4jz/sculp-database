# SCULPY / MEMORA V3.0 — HubSpot benchmark

Status: release candidate in development, not V3.0 complete. Date: 2026-10-16.

User constraint: keep SCULP's existing page structure and presentation flow; introduce new CRM surfaces primarily in MEMORA.

Confirmed baseline: SCULPY main 6605541, MEMORA main 693b23b. SCULPY uses a static UI, Supabase authenticated RPCs and a demo-only Agents SDK adapter. MEMORA uses an existing Sites Worker and owner-partitioned D1 workspace. No team membership/roles exist in MEMORA. Current production Supabase contains no client or booking rows at audit time; no customer rows were fetched.

This candidate adds SCULPY request byte limits, runtime tool-argument validation, safe proposal fields, a shared framework-neutral CRM core and an additive administrator-only task ledger. It leaves SCULP pages unchanged. The new task ledger is independently tested on the complete migration chain and includes explicit confirmation, request replay, optimistic revisions, RLS, audit and a non-destructive rollback script. Migration is not yet deployed.

MEMORA contains the new pipeline, tasks, workflow preview, duplicate review, CSV import preview, custom fields, customer timeline, AI review cards and canonical server commands. These use existing D1 transactions and Responses API tooling; no new paid service or framework migration. MEMORA is still a fictional demonstration and owner-private workspace, not a fully multi-tenant team CRM.

Validation in progress: local regression, isolated live-model comparison, PostgreSQL CI and release review. Passing local tests are not claimed as real-device, live role-account or production deployment verification.

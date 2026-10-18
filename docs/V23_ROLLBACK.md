# V2.3 deployment and rollback

Before production DDL: export affected commercial rows, existing function definitions, policies and constraints; retain the exact deployed chat v36 and enquiry v1 sources; calculate SHA-256. This is a scoped commercial/schema backup, not a full Auth/Storage/project backup. Restore-check exported definitions and empty commercial row counts in an isolated database before deployment.

Deployment order: compatible website baseline → V2.3 incremental schema → role/RPC smoke → website Edge Function → chat Edge Function → frontend. Do not run unrelated pending migrations such as the V3 task ledger.

Rollback preserves collected business history:

1. Revert the V2.3 frontend commit or disable its links, and restore the exact archived chat/enquiry function sources with their original JWT setting. No secret changes are required.
2. Keep the incremental tables/columns and all signed contracts/payments/events. Export new rows before any subsequent schema operation.
3. The old status editor is intentionally blocked from erasing signing history. Do not remove this safeguard to make old UI appear compatible. Orders/date edits and restricted artist pages can remain available; temporarily handle signing/payment operations through the verified V2.3 RPC until fixed.
4. If a full pre-V2.3 schema rollback is essential, stop writes, take a new complete backup and review/export all post-launch records first. Run a compensating migration after reviewing dependencies; never DROP V2.3 tables or delete collected records as routine rollback.

Local transactional rollback is tested by deliberately rejected invalid/cumulative refunds, stale revisions and replay conflicts. Production smoke uses BEGIN/ROLLBACK, leaving no synthetic commercial rows. A public endpoint probe, if used, must delete only its unique, exactly matched synthetic acceptance submission after verifying persistence, with before/after production counts recorded. Email delivery and a real signed-in device test remain separate acceptance steps.

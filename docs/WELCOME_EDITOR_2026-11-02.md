# SCULPY editable account welcomes — 2026-11-02

Status: deployed and source-verified on 2026-11-02.

## Behavior

The operations/system-administrator header adds **编辑欢迎语** beside **账户管理**. The inline editor selects an existing account, previews plain text and saves up to 160 characters. Empty text restores “业务工作台”. Existing Miranda wording is migrated into the cloud; it is no longer selected by a hardcoded frontend username. Editing the current account updates its heading immediately; other devices read the saved value after refresh/sign-in.

Only an active operations profile may list/edit welcomes through dedicated RPCs. Existing profile RLS/read scope and account APIs are unchanged. Direct browser profile writes remain revoked. No new API key, dependency or external service is introduced.

The save uses a welcome-specific revision, row lock and the same advisory lock as account role updates. Stale writes fail rather than overwrite another device. Repeating an already-applied value is a no-op, with one audit entry per change. Network uncertainty preserves the exact request for retry. Confirmed saves with failed rereads remain saved, and draft/unconfirmed writes block accidental page exit or logout. Switching accounts or collapsing the panel keeps drafts until saving, cancelling or explicitly reading the latest content.

## Migration and rollback

`20261102123719_editable_account_welcomes.sql` adds two defaulted columns and two narrowly authorized RPCs; existing account RPC signatures, RLS and privileges remain compatible. Its only seed uses the known `sculp_miranda` username and the previously requested greeting. No account role/password or customer business data changes.

Rollback the frontend first, retain the additive columns and saved values, and revoke the two new RPCs if necessary. Dropping the columns would discard greetings and is unnecessary. Preserve the newer production chat implementation when updating release descriptions.

## Verification and publication

Local full-migration database tests passed for active-operations authorization, owner/employee/read-only/inactive/anonymous denial, direct-write rejection, existing profile read scope, length validation, stale revision, idempotent retry, blank/default restoration and audit attribution.

Browser regression includes plain-text/XSS-safe preview and rendering, current-account heading updates, saved greetings after reload, lost acknowledgements, successful saves with failed rereads, retained conflict drafts and 320/390/768px layouts. Browser adapters use fictional data. Local complete suite: 186 passed, 2 PostgreSQL-only tests skipped locally. PR PostgreSQL CI subsequently passed all 22 checks, including concurrency and backup/recovery; browser CI passed the complete regression suite. Final chat/multi-step capability checks passed 16/16. The initial PostgreSQL-only assertion compared a driver-returned bigint string with a number; the assertion was corrected without waiving a failure.

Actual JZ/Miranda sign-in and real two-device greeting acceptance remain manual checks. Passing tests or a merge does not prove publication.

## Verified deployment evidence

- PR [#39](https://github.com/2ez4jz/sculp-database/pull/39), checked head `1ddc52ee321601438bfa84da5655ba6d09a3ee12`; merged as `71d129270ae98c680bfe1cc5b774899c609e63aa`. Both jobs in [41447255658](https://github.com/2ez4jz/sculp-database/actions/runs/41447255658) passed before merging.
- Existing Pages publish workflow [41447916554](https://github.com/2ez4jz/sculp-database/actions/runs/41447916554) succeeded. All six live frontend resources (index, bootstrap, login, welcome-editor, auth service and polish stylesheet) returned HTTP 200 and exactly matched the released source.
- Production additive migration applied successfully. Readback confirms JZ active operations with the default greeting, and Miranda active owner with the exact preserved welcome and revision 1. The live operations-authorized RPC was verified with the existing value in a rolled-back transaction; no new customer/test account, role or password was written.
- Advisor review: existing notices remain; two additional authenticated SECURITY DEFINER RPC notices correspond to these deliberately exposed, operations-gated APIs. Both revoke PUBLIC/anon execution, derive the actor from auth.uid/current active profile and retain direct-table write denial. Authorization and bypass tests passed; these are not unrestricted profile writes.
- Production sculpy-chat v48 ACTIVE; all 17 files read back and matched. Only the shared release facts and product knowledge changed from v47; all 15 newer implementation files were preserved. No model/API credentials changed.
- Fictional visual QA: [desktop](screenshots/welcome-editor-desktop-20261102.jpg), [phone](screenshots/welcome-editor-mobile-20261102.jpg).

No requested development item remains pending. Actual-device JZ/Miranda sign-in and two-device acceptance are still manual checks, separate from deployed code, database tests and fictional browser adapters.

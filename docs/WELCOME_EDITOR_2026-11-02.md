# SCULPY editable account welcomes — 2026-11-02

Status: implemented; production publication pending.

## Behavior

The operations/system-administrator header adds **编辑欢迎语** beside **账户管理**. The inline editor selects an existing account, previews plain text and saves up to 160 characters. Empty text restores “业务工作台”. Existing Miranda wording is migrated into the cloud; it is no longer selected by a hardcoded frontend username. Editing the current account updates its heading immediately; other devices read the saved value after refresh/sign-in.

Only an active operations profile may list/edit welcomes through dedicated RPCs. Existing profile RLS/read scope and account APIs are unchanged. Direct browser profile writes remain revoked. No new API key, dependency or external service is introduced.

The save uses a welcome-specific revision, row lock and the same advisory lock as account role updates. Stale writes fail rather than overwrite another device. Repeating an already-applied value is a no-op, with one audit entry per change. Network uncertainty preserves the exact request for retry. Confirmed saves with failed rereads remain saved, and draft/unconfirmed writes block accidental page exit or logout. Switching accounts or collapsing the panel keeps drafts until saving, cancelling or explicitly reading the latest content.

## Migration and rollback

`20261102123719_editable_account_welcomes.sql` adds two defaulted columns and two narrowly authorized RPCs; existing account RPC signatures, RLS and privileges remain compatible. Its only seed uses the known `sculp_miranda` username and the previously requested greeting. No account role/password or customer business data changes.

Rollback the frontend first, retain the additive columns and saved values, and revoke the two new RPCs if necessary. Dropping the columns would discard greetings and is unnecessary. Preserve the newer production chat implementation when updating release descriptions.

## Verification and publication

Local full-migration database tests passed for active-operations authorization, owner/employee/read-only/inactive/anonymous denial, direct-write rejection, existing profile read scope, length validation, stale revision, idempotent retry, blank/default restoration and audit attribution.

Browser regression includes plain-text/XSS-safe preview and rendering, current-account heading updates, saved greetings after reload, lost acknowledgements, successful saves with failed rereads, retained conflict drafts and 320/390/768px layouts. Browser adapters use fictional data; PostgreSQL CI and live source/schema verification are recorded after publication.

Actual JZ/Miranda sign-in and real two-device greeting acceptance remain manual checks. Passing tests or a merge does not prove publication.

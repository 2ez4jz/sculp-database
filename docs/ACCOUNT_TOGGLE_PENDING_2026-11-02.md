# Account toggle and pending-enquiry marker — 2026-11-02

Status: deployed and verified on 2026-11-02.

Account management now follows the welcome editor’s disclosure behavior: initially collapsed, selected button color while open, and another click collapses the same panel. The mounted forms survive collapse/reopen, preserving draft edits and expanded account rows. Initial account reads are deduplicated; completion of a hidden read does not reopen the panel. Account permissions and mutation APIs are unchanged.

Only a stored enquiry with status `pending` gets a compact muted tag with a 4px dot and the existing “待处理” text. The card background is unchanged. Follow-up/closed records get no pending tag. This is a visual reminder, not a push notification or automatic state change.

Validation extends existing browser regression for desktop/phone toggle state and color, draft retention, no repeat list reads, pending-only labels and phone overflow. Existing chat/multi-step capability checks and publication evidence are recorded after verification. No database migration, new service or credential is needed. Rollback restores the previous frontend; no business data is changed.

## Verification and publication

- PR [#40](https://github.com/2ez4jz/sculp-database/pull/40), checked head `fa0f0749f8f80b5f9c29a755b5693ca3ca30168a`, merged as `f3db936a228b14272c1e13de85e4907046449c48`. Both browser and PostgreSQL jobs passed in [41451708676](https://github.com/2ez4jz/sculp-database/actions/runs/41451708676).
- Existing Pages workflow [41452202361](https://github.com/2ez4jz/sculp-database/actions/runs/41452202361) and built-in Pages run [41452202064](https://github.com/2ez4jz/sculp-database/actions/runs/41452202064) succeeded. Six live frontend files (index, bootstrap, login, workspace, enquiries and polish CSS) returned HTTP 200 and exactly matched released source after publication.
- Desktop and 390px phone visual QA confirms the active button color, second-click collapse and muted pending marker. Existing browser regression additionally verifies retained account drafts, one initial list read, no marker for follow-up enquiries and phone overflow. The color assertion waits for the existing 150ms CSS transition; no failed check was waived. Adapters use fictional data.
- Chat/multi-step capability checks passed 16/16 after release-fact updates. sculpy-chat v49 ACTIVE was read back: all 17 files exactly match the submitted package. Only the shared release-facts file changed from v48; all 16 other runtime files were preserved.
- Fictional screenshots: [desktop](screenshots/account-toggle-pending-desktop-20261102.jpg), [phone](screenshots/account-toggle-pending-mobile-20261102.jpg).

No requested development item remains pending. Final real-account visual acceptance is to refresh JZ’s workspace, click account management twice, and inspect existing pending enquiries. No production customer record, password, role, enquiry state or database schema was changed by this release.

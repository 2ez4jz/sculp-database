# Account toggle and pending-enquiry marker — 2026-11-02

Status: implementation; publication pending.

Account management now follows the welcome editor’s disclosure behavior: initially collapsed, selected button color while open, and another click collapses the same panel. The mounted forms survive collapse/reopen, preserving draft edits and expanded account rows. Initial account reads are deduplicated; completion of a hidden read does not reopen the panel. Account permissions and mutation APIs are unchanged.

Only a stored enquiry with status `pending` gets a compact muted tag with a 4px dot and the existing “待处理” text. The card background is unchanged. Follow-up/closed records get no pending tag. This is a visual reminder, not a push notification or automatic state change.

Validation extends existing browser regression for desktop/phone toggle state and color, draft retention, no repeat list reads, pending-only labels and phone overflow. Existing chat/multi-step capability checks and publication evidence are recorded after verification. No database migration, new service or credential is needed. Rollback restores the previous frontend; no business data is changed.

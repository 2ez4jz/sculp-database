# V2.4 rollback

This migration is additive and does not modify existing business data or policies. Existing clients, bookings, financial events and request ledgers continue using their original functions.

1. Revert the V2.4 frontend commit through GitHub and deploy the previous Pages version. Keep the new communication tables and private bucket so newly recorded customer information is retained.
2. Restore the previous `sculpy-intake` function version (or its pre-V2.4 handler and index from main before this PR). Original order extraction remains available. `sculpy-chat` product knowledge must describe the restored runtime and V2.4 as unavailable.
3. If V2.4 writes must be frozen, revoke execute on the public and private communication command wrappers from authenticated. Context/source/inbox reads can be kept for recovery if appropriate. Do not drop the tables or delete objects during rollback.
4. After deciding to resume, restore explicit grants, deploy the authenticated Edge Function, verify the private bucket is still private and RLS is enabled, then deploy the frontend.

No destructive down migration is supplied. Removing saved originals, confirmed summaries, audit evidence or attachments requires a separately reviewed retention/export decision.

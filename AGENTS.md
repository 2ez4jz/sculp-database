# SCULPY development conventions

Preserve the existing business workflow and confirmation steps unless the user explicitly requests a change. Keep Demo and authenticated business data separate. Use Node.js 24 and the pinned lockfile.

## Runtime product knowledge

`supabase/functions/sculpy-chat/product-knowledge.js` is the shared product knowledge source for the authenticated conversation and Demo SDK paths.

- When adding, changing or removing a user-facing feature or a registered chat tool, update its capability description in the same change. Include the execution scope, required inputs, permissions, confirmation requirements, and evidence needed to call the task complete.
- Keep `latestReleasedUpdate` (the most recent verified user-visible change), the latest included backend update and latest verified business/Demo releases current. Separate included backend code, deployed frontend/database capabilities, and unpublished changes. A Git commit, passing tests or a merge does not prove deployment.
- Every release must update the affected latest-release entry and clear or revise corresponding unpublished entries only after deployment is verified. If deployment is pending, record that state explicitly. On rollback, keep the knowledge consistent with the restored runtime.
- Do not derive capability permissions or published version facts from browser catalogs, user-provided memories or old assistant replies. Actual server-registered tools and authorization checks remain authoritative.
- Keep product knowledge injected into both existing model paths. A Pages-only deployment does not update the chat Edge Function.
- Tool registration/knowledge consistency and role/environment boundaries are exercised by `scripts/chat.test.mjs` and `scripts/agent-multistep.test.mjs`. Run those tests after capability changes and run the appropriate existing regression checks before delivery. Mocked model tests are not live model quality evaluations.

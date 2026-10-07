# Username login and Jz account administration

Login is **sculp_name + password**, e.g. `sculp_jz`, `sculp_miranda`, `sculp_michelle`. Names use 1–26 ASCII letters, digits or underscores; login is case-insensitive and stored in lowercase. The creation form supplies the fixed `sculp_` prefix. Users never provide an email address or receive verification mail. There is no public registration.

Internally Supabase's password provider uses the deterministic reserved identifier `<username>@accounts.sculp.invalid`. This is not a contact address. Auth handles password hashing and verification; plaintext passwords are not written to profiles, logs, audit events, or browser persistence. Session tokens use sessionStorage and automatic refresh. The login verifies getUser and an active profiles row.

The `operations` role is assigned to Jz's real Auth UUID by the project administrator. Display names and usernames grant no privilege by themselves. Jz can list accounts, change display names/roles/active state, create accounts with an initial password, and set a new password for existing accounts. Passwords cannot be retrieved or displayed. Creation/reset uses the `account-admin` Edge Function with server-only service-role credentials; it checks the caller's verified user and current active operations profile. Account creation compensates an unsuccessful profile transaction by removing the Auth user; cleanup failure reports an incomplete account for manual repair. Password-reset audit stores intent/outcome and IDs, never passwords.

Profile updates remain authenticated SQL RPCs. Self-demotion/deactivation is blocked; mutations are serialized and audited. Disabling profiles removes role/assigned-record access, but does not revoke the Auth identity or repair legacy broad authenticated SELECT policies. Password reset is not a promise that every existing access token is immediately revoked. Keep production business data disabled until the review in ARCHITECTURE.md is completed.

## Activation

1. Configure public supabaseUrl/supabasePublishableKey in src/config.js. Never put a service-role key in frontend code.
2. Apply migrations 001–005 after project review. Disable public signup in Supabase Auth.
3. Bootstrap Jz privately through the project administrator: create an Auth user with identifier `sculp_jz@accounts.sculp.invalid`, chosen password and email_confirm=true; insert the matching profiles UUID with username `sculp_jz`, display_name `Jz`, role `operations`, active=true. No default password is supplied in source. Existing email users must have their Auth identifier and profile username explicitly migrated together, preserving UUIDs.
4. Deploy account-admin. Set ACCOUNT_ALLOWED_ORIGINS to an exact comma-separated allowlist of website origins. Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY inside the function. Its gateway JWT check is disabled because the handler explicitly verifies the token with getUser before any privileged operation. Missing origins fail closed.
5. Deploy the static site. Jz then creates employee accounts and sets passwords in the UI. No email is sent. Business orders remain a connection-status screen pending the production data adapter. Demo remains explicitly separate at ?demo=1 and is allowed only in demo configuration.

## Deployment status — 2026-10-07

Migrations 001–005 and the two account-table grant migrations have been applied to the existing sculpy database project. The account-admin function is deployed with an exact GitHub Pages origin default. The frontend publishable key is configured. sculp_jz is provisioned as operations; its random initial password is delivered privately to the owner, never committed. Real password login, active profile read, account listing, password reset, and rejection of unauthenticated admin requests were verified.

The temporary token-protected bootstrap function has been replaced with a permanent 410 response and JWT checking enabled. There is no active bootstrap path. Broad legacy business-table permissions were not changed; business data integration remains pending. Public signup settings still need project-owner review; accounts without an active profile cannot enter the workspace.

SDK: bundled @supabase/supabase-js 2.117.3. Rebuild with esbuild (browser platform, ESM, bundle and minify); license accompanies the bundle.
References: https://supabase.com/docs/reference/javascript/auth-admin-createuser and https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid

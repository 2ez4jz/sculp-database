# Login and account administration

The default entry is an email/password login. `?demo=1` explicitly opens fictional data only while `config.environment === 'demo'`. Demo never receives an authenticated database client. Production does not accept that demo switch. The login uses locally bundled Supabase JS 2.117.3, browser sessionStorage, automatic token refresh, getUser verification and an active profiles row. There is no public signup. Passwords are not stored by application code.

Jz is the `operations` role, assigned to the correct Auth user UUID by the project administrator. Names and email strings do not grant privileges. Account management lists email, name, role and active state, and edits name/role/active via authenticated SQL RPCs. Emails are read-only Auth identifiers; creating accounts, resetting passwords and changing login emails remain project-admin operations in this version. Users cannot disable or demote their own operations account. Mutations are serialized and audited. Disabled profiles lose role/assigned-record access even with an existing JWT. This does not revoke the Auth account or fix all legacy broad authenticated-read policies; production business data must remain disabled pending the review in ARCHITECTURE.md.

## Activation

1. Configure the public `supabaseUrl` and `supabasePublishableKey` in src/config.js (or SCULPY_CONFIG before bootstrap). Never put a service-role/secret key in browser code.
2. Apply migrations 001–004 after project review. Provision invite-only Auth users and matching profiles UUIDs. Assign Jz `operations` and Miranda `owner` deliberately. Disable public signup in Auth settings.
3. Deploy the static site. Real account authentication and account administration then work; business orders remain a connection-status screen until the production data integration is completed.

Missing configuration is shown honestly and fails closed. No live migration or account provisioning is performed by this source change.

SDK source: https://supabase.com/docs/reference/javascript/auth-signinwithpassword
Rebuild bundled vendor module with esbuild from exact @supabase/supabase-js@2.117.3, platform=browser, format=esm, bundle/minify enabled. License is included next to the bundle.

# SCULPY Agents SDK pilot (2026-10-14)
This is an opt-in **fictional demo** integration, NOT a production release.
- Backend adapter: `supabase/functions/sculpy-chat/agent.ts`, OpenAI Agents SDK with one bounded `query_demo_report` read-only tool.
- Existing handler runs the adapter only when `SCULPY_AGENT_DEMO_ENABLED=true`, request `mode=demo` and `agentMode=sdk`; otherwise the previous conversation path remains unchanged.
- Demo client opt-in: open `?demo=1&agent=sdk#sculpy`.
- Supabase Edge Function must be deployed and the environment variable configured before SDK mode can run. If the flag is disabled, the URL uses the legacy path.
- Tool outputs are saved in `demoReportSources` for the existing inline chart renderer.
- No SQL execution, no real customer data, no autonomous writes, no arbitrary account privileges.
- Test commands after checkout: `npm test`, `node --test scripts/agent-sdk-integration.test.mjs`, and real browser tests for demo roles, chart display, invalid periods, empty ranges and 6+ tool calls.
- Do **not** set the environment flag in production without validating deployment, runtime import compatibility, spend/latency limits, data consistency and authorizations.
- Four markdown Skill files are planning instructions, not auto-loaded SDK extensions. The Agent currently has one tightly bounded report tool; finance, growth and capacity tools need separate authorized implementations.

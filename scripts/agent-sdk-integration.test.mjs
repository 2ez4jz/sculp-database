import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const agent=readFileSync(new URL('../supabase/functions/sculpy-chat/agent.ts',import.meta.url),'utf8');
const handler=readFileSync(new URL('../supabase/functions/sculpy-chat/handler.ts',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/services/chat.js',import.meta.url),'utf8');
test('Agent SDK is explicitly opt in and fictional demo only',()=>{
 assert.match(handler,/demo && env\("SCULPY_AGENT_DEMO_ENABLED"\) === "true" && body\.agentMode === "sdk"/);
 assert.match(handler,/await converse\(/);
 assert.match(client,/new URLSearchParams\(location\.search\)\.get\("agent"\) === "sdk"/);
});
test('Agent tools access exact read only reports rather than arbitrary SQL',()=>{
 assert.match(agent,/from "npm:@openai\/agents"/);
 assert.match(agent,/name:"query_demo_report"/);
 assert.match(agent,/demoReport\(args\)/);
 assert.doesNotMatch(agent,/execute_sql|run_sql|eval\(/);
 assert.match(agent,/context\?\.mode!=="fictional_demo"/);
});
test('Analysis turns retain data sources for inline charts',()=>{
 assert.match(agent,/demoReportSources:sources/);
 assert.match(agent,/maxTurns:7/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const agent=readFileSync(new URL('../supabase/functions/sculpy-chat/agent.ts',import.meta.url),'utf8');
const handler=readFileSync(new URL('../supabase/functions/sculpy-chat/handler.ts',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/services/chat.js',import.meta.url),'utf8');
test('Agent SDK defaults on in fictional admin demo; legacy rollback remains available',()=>{
 assert.match(handler,/demo && env\("SCULPY_AGENT_DEMO_ENABLED"\) !== "false" && body\.agentMode === "sdk"/);
 assert.match(handler,/converse\(/);
 assert.match(client,/new URLSearchParams\(location\.search\)\.get\("agent"\) === "legacy"/);
});
test('Agent tools access exact read only reports rather than arbitrary SQL',()=>{
 assert.match(agent,/from "npm:@openai\/agents@0\.20\.0"/);
 assert.match(agent,/name:"query_demo_report"/);
 assert.match(agent,/demoReport\(args\)/);
 assert.doesNotMatch(agent,/execute_sql|run_sql|eval\(/);
 assert.match(agent,/context\?\.mode!=="fictional_demo"/);
});
test('Analysis turns retain data sources for inline charts',()=>{
 assert.match(agent,/demoReportSources:sources\.map\(compactDemoReport\)/);
 assert.match(agent,/maxTurns:7/);
});

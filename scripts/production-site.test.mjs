import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Pages stages the authenticated workspace, including voice and push, without catalogs or backend source', () => {
  const parent=mkdtempSync(join(tmpdir(),'sculp-release-'));
  const out=join(parent,'site');
  try {
    execFileSync('python3',['scripts/build-pages.py',out,'--check-branch-config']);
    const files=readdirSync(out,{recursive:true}).map(String);
    for(const name of ['index.html','offline.html','sw.js','manifest.webmanifest','src/vendor/supabase.js','src/vendor/SUPABASE-LICENSE','src/pages/login/personal-schedule.js','src/pages/login/notification-devices.js','src/pages/sculpy/voice.js','supabase/functions/sculpy-ai/audio-format.js']) assert(files.includes(name),name);
    assert(!files.some(f=>/(^|\/)(demo|fixtures|scripts|docs|migrations)|\.ts$|package-lock|\.sql$|^src\/app\.js$/.test(f)));
    const entry=readFileSync(join(out,'index.html'),'utf8');
    assert(!/demo-template|manifest-demo|i18n\/runtime/.test(entry));
    assert.match(entry,/id="auth-root"/);
  } finally {rmSync(parent,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {parseCsv,mapImportRows,csvTemplate} from '../src/pages/login/os-import-csv.js';
import {mountClientEditor} from '../src/pages/login/os-client-editor.js';
import {mountHistoryImport} from '../src/pages/login/os-import.js';
const tick=()=>new Promise(r=>setTimeout(r,2));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await tick();}assert.fail('UI did not settle');}
test('V3.2 CSV: BOM, CRLF, quoted commas/newlines, literal formulas and original line numbers',()=>{
 const csv=parseCsv('\ufeffdisplay_name,internal_notes,email\r\n"A, B","first\nsecond ""quote""",a+tag@example.test\r\n=1+1,Note,b@example.test');
 assert.equal(csv.rows[0].values.display_name,'A, B');assert.equal(csv.rows[0].values.internal_notes,'first\nsecond "quote"');assert.equal(csv.rows[1].line,4);
 assert.equal(csv.rows[1].values.display_name,'=1+1');
 const mapped=mapImportRows(csv,'clients',{display_name:'display_name',email:'email'});assert.equal(mapped[0].line,2);assert.equal(mapped[0].email,'a+tag@example.test');assert(!('internal_notes' in mapped[0]));
 for(const bad of ['a,a\nx,y','a,b\nx','a\n"unclosed','a\nx"y'])assert.throws(()=>parseCsv(bad));
 assert.match(csvTemplate('orders'),/service_date,start_time,utc_offset/);
});
test('V3.2 CSV: large files are mapped in batches without losing source lines',()=>{
 const csv=parseCsv('display_name\n'+Array.from({length:205},(_,i)=>'Customer '+i).join('\n'));
 const middle=mapImportRows(csv,'clients',{display_name:'display_name'},100,200);assert.equal(middle.length,100);assert.equal(middle[0].line,102);
 assert.equal(mapImportRows(csv,'clients',{display_name:'display_name'},200,300).length,5);
 assert.throws(()=>parseCsv('name\n'+Array(2001).fill('x').join('\n')));
});
function editor(override){
 const dom=new JSDOM('<div id="root"></div>'),root=dom.window.document.querySelector('#root'),calls=[];let saved=0;
 const app=mountClientEditor({root,detail:{revision:'revision1',client:{id:'customer',display_name:'Avery',tags:[]},contact:{phone:'123'}},onSaved:async()=>{saved++;},supabase:{rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});const r=await override?.(name,args);if(r!==undefined)return r;
  if(name==='sculpy_os_client_review')return {data:{revision:'revision1',fields:Object.fromEntries(Object.entries(args.p_fields).map(([k,v])=>[k,v===''?null:v])),possibleDuplicates:[{id:'other',name:'<img src=x>'}]}};
  return {data:{id:args.p_client_id,requestId:args.p_request_id}};
 }}});
 const $=s=>root.querySelector(s),form=$('[data-client-edit-form]');
 const input=(key,value)=>{form.elements[key].value=value;form.elements[key].dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 return {dom,root,calls,app,$,form,input,get saved(){return saved;},submit(){form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));},close(){app.destroy();dom.window.close();}};
}
test('V3.2 customer editor: dirty drafts block navigation, review is required and duplicate text is escaped',async()=>{
 const x=editor();try{
  x.$('[data-client-edit]').click();x.input('phone','+44 20 1234');assert.equal(x.app.canLeave(),false);x.submit();await tick();assert.equal(x.calls.length,0);
  x.$('[data-client-review]').click();await until(()=>!x.$('[data-client-review-panel]').hidden);assert.equal(x.root.querySelector('img'),null);
  x.form.elements.confirmed.checked=true;x.form.elements.confirmed.dispatchEvent(new x.dom.window.Event('input',{bubbles:true}));x.submit();await until(()=>x.saved===1);
  assert.equal(x.app.canLeave(),true);assert.equal(x.calls.at(-1).args.p_fields.phone,'+44 20 1234');
 }finally{x.close();}
});
test('V3.2 customer editor: lost acknowledgment retries identical fields; explicit discard restores navigation',async()=>{
 let writes=0;const x=editor(name=>{if(name==='sculpy_os_update_client'&&++writes===1)throw Error('lost');});
 try{
  x.$('[data-client-edit]').click();x.input('email','a+tag@example.test');x.$('[data-client-review]').click();await until(()=>!x.$('[data-client-review-panel]').hidden);
  x.form.elements.confirmed.checked=true;x.submit();await until(()=>x.$('[data-client-edit-status]').textContent.includes('重试'));assert.equal(x.app.canLeave(),false);assert.equal(x.form.elements.email.disabled,true);
  x.submit();await until(()=>x.saved===1);const writes=x.calls.filter(c=>c.name==='sculpy_os_update_client');assert.deepEqual(writes[0].args,writes[1].args);
 }finally{x.close();}
 const y=editor();try{y.$('[data-client-edit]').click();y.input('phone','changed');y.$('[data-client-discard]').click();assert.equal(y.app.canLeave(),true);assert.equal(y.form.elements.phone.value,'123');}finally{y.close();}
});
test('V3.2 customer editor: conflict keeps the draft and requires a fresh read',async()=>{
 const x=editor(name=>name==='sculpy_os_update_client'?{error:{code:'40001'}}:undefined);try{
  x.$('[data-client-edit]').click();x.input('phone','draft');x.$('[data-client-review]').click();await until(()=>!x.$('[data-client-review-panel]').hidden);x.form.elements.confirmed.checked=true;x.submit();
  await until(()=>!x.$('[data-client-reload]').hidden);assert.equal(x.form.elements.phone.value,'draft');assert.equal(x.app.canLeave(),false);assert.equal(x.saved,0);
 }finally{x.close();}
});
function importer(override){
 const dom=new JSDOM('<div id="root"></div>'),root=dom.window.document.querySelector('#root'),calls=[];let saved=0;
 const app=mountHistoryImport({root,onSaved:async()=>{saved++;},supabase:{rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});const r=await override?.(name,args);if(r!==undefined)return r;
  if(name==='sculpy_os_import_catalog')return {data:{services:[]}};
  if(name==='sculpy_os_import_preview')return {data:{ready:true,planHash:'plan',creates:args.p_rows.length,links:0,skips:0,errors:0,rows:args.p_rows.map(r=>({line:r.line,action:'create',reason:'<img src=x>',normalized:{fields:r}}))}};
  return {data:{id:args.p_request_id,requestId:args.p_request_id,creates:args.p_rows.length,links:0,skips:0,rows:args.p_rows.map(r=>({line:r.line,id:'customer',reason:'Saved'}))}};
 }}});
 const $=s=>root.querySelector(s);
 return {dom,root,calls,app,$,get saved(){return saved;},async file(text){const bytes=new TextEncoder().encode(text);Object.defineProperty($('[data-import-file]'),'files',{configurable:true,value:[{name:'qa.csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer}]});$('[data-import-file]').dispatchEvent(new dom.window.Event('change'));await until(()=>!$('[data-import-mapping]').hidden);},close(){app.destroy();dom.window.close();}};
}
test('V3.2 importer: preview exposes mapped row data, confirmation is required and lost receipt retains the batch',async()=>{
 let writes=0;const x=importer(name=>{if(name==='sculpy_os_import_commit'&&++writes===1)throw Error('lost');});
 try{
  await x.file('display_name,email\nAvery,a@example.test');x.$('[data-import-preview]').click();await until(()=>!x.$('[data-import-review]').hidden);
  assert.match(x.$('[data-import-rows]').textContent,/a@example.test/);assert.equal(x.root.querySelector('img'),null);
  x.$('[data-import-save]').click();await tick();assert.equal(x.calls.filter(c=>c.name==='sculpy_os_import_commit').length,0);
  x.$('[data-import-confirmed]').checked=true;x.$('[data-import-save]').click();await until(()=>x.$('[data-import-status]').textContent.includes('重试同一批次'));
  assert.equal(x.app.canLeave(),false);assert.equal(x.$('[data-import-kind]').disabled,true);x.$('[data-import-save]').click();await until(()=>x.saved===1);
  const calls=x.calls.filter(c=>c.name==='sculpy_os_import_commit');assert.deepEqual(calls[0].args,calls[1].args);assert.equal(x.app.canLeave(),true);assert.equal(x.$('[data-import-save]').disabled,true);
 }finally{x.close();}
});
test('V3.2 importer: exclusions and changed mappings invalidate the confirmed server preview',async()=>{
 const x=importer();try{
  await x.file('display_name,email\nAvery,a@example.test\nOther,b@example.test');x.$('[data-import-preview]').click();await until(()=>!x.$('[data-import-review]').hidden);
  const include=x.$('[data-import-include]');include.checked=false;include.dispatchEvent(new x.dom.window.Event('change',{bubbles:true}));assert.equal(x.$('[data-import-save]').disabled,true);
  x.$('[data-import-preview]').click();await until(()=>x.calls.filter(c=>c.name==='sculpy_os_import_preview').length===2);await tick();assert.equal(x.calls.filter(c=>c.name==='sculpy_os_import_preview').at(-1).args.p_rows.length,1);
  const mapping=x.$('[data-import-field=email]');mapping.value='';mapping.dispatchEvent(new x.dom.window.Event('change',{bubbles:true}));assert.equal(x.$('[data-import-review]').hidden,true);
 }finally{x.close();}
});

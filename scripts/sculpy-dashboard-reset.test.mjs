import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function fixture(){
 const source=(await fs.readFile(new URL('../src/components/analysis/sculpy-dashboard.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/m,'')
  .replace('export function createSculpyDashboard','function createSculpyDashboard');
 let click,markup='',hidden=false;
 const root={
  set innerHTML(v){markup=v;},get innerHTML(){return markup;},
  set hidden(v){hidden=v;},get hidden(){return hidden;},
  querySelector(selector){return selector==='[data-dashboard-reset]'?{addEventListener(_name,fn){click=fn;}}:null;}
 };
 const ctx={document:{getElementById:()=>root},Intl,Date,
  buildAnalysisCharts:()=>[{kind:'default'}],
  renderAnalysisCharts:(charts)=>charts.map(c=>'<span>'+c.kind+'</span>').join('')};
 vm.runInNewContext(source+';globalThis.factory=createSculpyDashboard;',ctx);
 const dashboard=ctx.factory({getBookings:()=>[],isAllowed:()=>true});
 return {dashboard,root,markup:()=>markup,click:()=>click()};
}
test('dashboard defaults render before chat',async()=>{
 const f=await fixture();f.dashboard.render([]);
 assert.match(f.markup(),/default/);
});
test('reset remains on default after same chat turns redraw',async()=>{
 const f=await fixture(),turn={analysisCharts:[{kind:'trend'}]};
 f.dashboard.render([turn]);assert.match(f.markup(),/trend/);
 f.click();assert.doesNotMatch(f.markup(),/trend/);
 f.dashboard.render([turn]);assert.doesNotMatch(f.markup(),/trend/);
 f.dashboard.render([turn,{analysisCharts:[{kind:'donut'}]}]);assert.match(f.markup(),/donut/);
});
test('full reset clears dismissed selection',async()=>{
 const f=await fixture(),turn={analysisCharts:[{kind:'trend'}]};
 f.dashboard.render([turn]);f.click();f.dashboard.reset();
 f.dashboard.render([turn]);assert.match(f.markup(),/trend/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
async function fixture(){
 const source=(await fs.readFile(new URL('../src/components/analysis/sculpy-dashboard.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/m,'').replace(/^export /gm,'');
 let markup='',allowed=true;
 const root={set innerHTML(v){markup=v;},get innerHTML(){return markup;},hidden:false,querySelector:()=>({}),querySelectorAll:()=>[]};
 const ctx={document:{getElementById:()=>root},Intl,Date,
  buildAnalysisCharts:({message})=>[{kind:message}],
  renderAnalysisCharts:charts=>charts.map(c=>'<span>'+c.kind+'</span>').join('')};
 vm.runInNewContext(source+';globalThis.factory=createSculpyDashboard;',ctx);
 const dashboard=ctx.factory({getBookings:()=>[],isAllowed:()=>allowed});
 return {dashboard,root,markup:()=>markup,setAllowed:v=>allowed=v};
}
test('dashboard always displays three fixed overview charts',async()=>{
 const f=await fixture();f.dashboard.render();
 for(const term of ['服务订单占比','各渠道收款金额饼图','化妆师订单占比'])assert.ok(f.markup().includes(term));
});
test('conversation data never replaces fixed dashboard',async()=>{
 const f=await fixture();f.dashboard.render();
 const before=f.markup();f.dashboard.render([{analysisCharts:[{kind:'trend'}]}]);
 assert.equal(f.markup(),before);
 f.dashboard.reset();assert.equal(f.markup(),before);
});
test('restricted roles cannot see dashboard charts',async()=>{
 const f=await fixture();f.dashboard.render();f.setAllowed(false);f.dashboard.render();
 assert.equal(f.root.hidden,true);assert.equal(f.markup(),'');
});

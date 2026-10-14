import test from 'node:test';
import assert from 'node:assert/strict';
import {chartCommentary,renderAnalysisCharts} from '../src/components/analysis/charts.js';
const esc=x=>String(x);
const base={kind:'donut',title:'channel',metric:'records',from:'2026-09-01',to:'2026-09-30',rows:[{label:'google',value:12},{label:'instagram',value:8}]};
test('charts show a grounded leading share and suggested check',()=>{
 const text=chartCommentary(base,false);
 assert.match(text,/60.0%/);
 assert.match(text,/建议/);
 assert.match(renderAnalysisCharts([base],esc,false),/analysis-commentary/);
});
test('financial double-metric chart does not claim a false category share',()=>{
 const text=chartCommentary({...base,title:'finance',paired:true,metric:'cents'},false);
 assert.match(text,/不是利润/);
 assert.doesNotMatch(text,/%/);
});
test('single category, empty and trend cases stay safe',()=>{
 assert.match(chartCommentary({...base,rows:[{label:'google',value:10}]}),/100.0%/);
 assert.match(chartCommentary({...base,rows:[]}),/没有正值/);
 assert.match(chartCommentary({...base,kind:'trend',metric:'cents',rows:[{label:'8月',value:10000},{label:'9月',value:13000}]}),/增加/);
});

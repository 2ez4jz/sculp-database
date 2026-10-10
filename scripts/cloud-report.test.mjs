import test from 'node:test';
import assert from 'node:assert/strict';
import {cadFromCents} from '../src/pages/login/monthly-report.js';
test('cloud report formats integer cents exactly, including values beyond floating point precision',()=>{
  assert.equal(cadFromCents('0'),'CAD 0.00');
  assert.equal(cadFromCents('100030'),'CAD 1,000.30');
  assert.equal(cadFromCents('9007199254740993'),'CAD 90,071,992,547,409.93');
  for(const value of [null,1,'-1','1.2','NaN','<script>'])assert.throws(()=>cadFromCents(value));
});

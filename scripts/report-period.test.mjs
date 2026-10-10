import test from 'node:test';
import assert from 'node:assert/strict';
import {reportMonths,torontoMonth} from '../src/domain/report-period.js';
test('calendar periods use Toronto current month, including empty months and year rollover',()=>{
 assert.equal(torontoMonth(new Date('2026-11-01T02:00:00Z')),'2026-10');
 assert.deepEqual(reportMonths('过去三个月收入','2026-10'),['2026-08','2026-09','2026-10']);
 assert.deepEqual(reportMonths('last 3 months','2026-01'),['2025-11','2025-12','2026-01']);
 assert.deepEqual(reportMonths('上个月收入','2026-01'),['2025-12']);
 assert.deepEqual(reportMonths('本月收入','2026-10'),['2026-10']);
 assert.deepEqual(reportMonths('过去十二个月收入','2026-10').length,12);
 assert.deepEqual(reportMonths('last 24 months','2026-10'),[]);
});
test('explicit months, ranges, years and quarters respect their requested calendar period',()=>{
 assert.deepEqual(reportMonths('2026-03 到 2026-05','2026-10'),['2026-03','2026-04','2026-05']);
 assert.deepEqual(reportMonths('2026-09和2026-11','2026-10'),['2026-09','2026-11']);
 assert.deepEqual(reportMonths('2026年9月收入','2026-10'),['2026-09']);
 assert.deepEqual(reportMonths('September 2026 revenue','2026-10'),['2026-09']);
 assert.equal(reportMonths('全年收入','2026-10').length,12);
 assert.deepEqual(reportMonths('Q2 2026','2026-10'),['2026-04','2026-05','2026-06']);
 assert.deepEqual(reportMonths('上个季度收入','2026-01'),['2025-10','2025-11','2025-12']);
});

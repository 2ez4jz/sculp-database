import test from "node:test";
import assert from "node:assert/strict";
import {renderMonthlyAnalytics} from "../src/pages/insights/monthly.js";
import {bookings} from "../src/data/demo.js";
const esc=v=>String(v);
const money=v=>"$"+v.toLocaleString("en-CA",{minimumFractionDigits:0,maximumFractionDigits:2});
test("monthly analysis shows expected demo September totals",()=>{
 const html=renderMonthlyAnalytics({records:bookings,context:{role:"admin"},esc,money});
 assert.match(html,/data-monthly-analytics/);
 assert.match(html,/2026-09/);
 assert.match(html,/13,230/);
 assert.match(html,/不是实收/);
});
test("artist cannot render global revenue analytics",()=>{
 const html=renderMonthlyAnalytics({records:bookings,context:{role:"artist",artistId:"emily"},esc,money});
 assert.equal(html,"");
});
test("empty dataset has no charts",()=>{
 assert.equal(renderMonthlyAnalytics({records:[],context:{role:"admin"},esc,money}),"");
});

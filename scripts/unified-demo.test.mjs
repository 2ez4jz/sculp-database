import test from 'node:test';
import assert from 'node:assert/strict';
import {bookings,clients,artists,venues} from '../src/data/demo.js';
import {generateAdvisorFixtures,fixtureSummary} from '../src/data/advisor-fixtures.js';
import {advisorRowsFromBookings,advisorSnapshot} from '../src/domain/demo-workspace.js';
import {applyDemoBookingChange} from '../src/domain/demo-orders.js';
import {channelCatalog,channelForBooking,channelSummary} from '../src/domain/channels.js';
import {monthlyStats} from '../src/domain/monthly-stats.js';
import {loadState,resetState,DEMO_STORAGE_KEY} from '../src/services/storage.js';
const context={role:'admin',adminPersona:'jz'};
const b=bookings.find(b=>b.status==='Completed');
const request={id:'edit-1',bookingId:b.id,expectedVersion:0,confirmed:true,reason:'测试300单统一口径',payload:{date:b.date,startTime:b.startTime,endTime:b.endTime,status:b.status,price:'123.45',paidAmount:'50.25',paidDate:'2027-01-10',artistId:b.artistIds[0],venueId:b.venueId,channelId:'google',details:'300单调试'}};
const args={state:{},bookings,clients,artists,venues,channels:channelCatalog({}),context,request};
test('sole 300-order baseline matches advisor fixture and all channel totals',()=>{
 assert.equal(bookings.length,300);assert.equal(clients.length,300);
 const actual=fixtureSummary(advisorRowsFromBookings(bookings)),expected=fixtureSummary(generateAdvisorFixtures());
 for(const key of ['total','completed','completedCents','paidCents'])assert.equal(actual[key],expected[key]);
 assert.equal(channelSummary(bookings,{}).reduce((n,c)=>n+c.count,0),300);
 for(const month of advisorSnapshot(advisorRowsFromBookings(bookings)).byMonth){const ui=monthlyStats(bookings,month.month,context);assert.equal(ui.amountCents,month.completedCents);assert.equal(ui.receivedCents,month.receivedCents);}
});
test('confirmed edits update canonical reporting, actual receipt month, channels; replay and stale edits are safe',()=>{
 const result=applyDemoBookingChange(args);
 const current=bookings.map(row=>row.id===b.id?result.booking:row);
 const rows=advisorRowsFromBookings(current,{channelForBooking:row=>channelForBooking(row,result.state)});
 assert.equal(rows.find(row=>row.id===b.id).amountCents,12345);
 assert.equal(monthlyStats(current,'2027-01',context).receivedCents,5025);
 assert.equal(advisorSnapshot(rows).byMonth.find(row=>row.month==='2027-01').receivedCents,5025);
 assert.equal(channelForBooking(result.booking,result.state),'google');
 assert.equal(applyDemoBookingChange({...args,state:result.state}).replayed,true);
 assert.throws(()=>applyDemoBookingChange({...args,state:result.state,request:{...request,id:'edit-2'}}),/另一窗口/);
 assert.throws(()=>applyDemoBookingChange({...args,context:{role:'artist'}}),/仅管理员/);
 assert.throws(()=>applyDemoBookingChange({...args,request:{...request,confirmed:false}}),/核对/);
});
test('unknown price stays unknown; clearing a source does not restore the old source',()=>{
 const result=applyDemoBookingChange({...args,request:{...request,payload:{...request.payload,price:'',channelId:''}}});
 assert.equal(result.booking.price,null);assert.equal(channelForBooking(result.booking,result.state),null);
 const report=monthlyStats([result.booking],b.date.slice(0,7),context);assert.equal(report.amountCents,0);assert.equal(report.unpriced,1);
 assert.throws(()=>applyDemoBookingChange({...args,request:{...request,payload:{...request.payload,price:'1.234'}}}),/两位/);
 assert.equal(channelSummary([{id:'x',channelId:'custom-old'}],{extraChannels:[{id:'custom-old',name:'Old'}],disabledChannels:['custom-old']}).reduce((n,c)=>n+c.count,0),1);
});
test('old 24-order state and chats are deleted; reset only clears current fictional data',()=>{
 const data=new Map([['sculp-memory-demo-v1','{"demoBookings":[{"id":"old"}]}'],['sculpy-chat-v1:admin','old'],[DEMO_STORAGE_KEY,'{"tour":2}'],['other','keep'],['sculpy-chat-300-v2:admin','new']]);
 globalThis.localStorage={removeItem:k=>data.delete(k),getItem:k=>data.get(k),get length(){return data.size},key:i=>[...data.keys()][i]};
 assert.equal(loadState().tour,2);assert.equal(data.has('sculp-memory-demo-v1'),false);assert.equal(data.has('sculpy-chat-v1:admin'),false);
 resetState();assert.equal(data.has(DEMO_STORAGE_KEY),false);assert.equal(data.has('sculpy-chat-300-v2:admin'),false);assert.equal(data.get('other'),'keep');
});

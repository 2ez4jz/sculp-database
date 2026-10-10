import {validDate} from './intake.js';
const time=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v||'');
export function demoAmountCents(value) {
 if(value==='')return null;
 if(typeof value!=='string'||!/^\d{1,8}(\.\d{1,2})?$/.test(value))throw Error('金额须为非负 CAD 金额，最多两位小数；未知价格留空。');
 const [whole,fraction='']=value.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export function applyDemoBookingChange({state,bookings,clients,artists,venues,channels,context,request}) {
 if(context.role!=='admin')throw Error('仅管理员可修改演示订单。');
 if(typeof request?.id!=='string'||!request.id||!request.payload||typeof request.payload!=='object'||Array.isArray(request.payload))throw Error('修改请求无效。');
 if(!request.confirmed||typeof request.reason!=='string'||!request.reason.trim()||request.reason.length>2000)throw Error('请核对并填写修改原因。');
 const prior=(state.bookingChangeLog||[]).find(x=>x.requestId===request.id);
 if(prior){if(prior.bookingId!==request.bookingId||JSON.stringify(prior.payload)!==JSON.stringify(request.payload))throw Error('同一请求的内容不能变化。');return {state,replayed:true};}
 const base=bookings.find(b=>b.id===request.bookingId);if(!base)throw Error('订单不存在。');
 const current={...base,...(state.bookingOverrides||{})[base.id]};
 if((current.version||0)!==request.expectedVersion)throw Error('另一窗口已修改订单，请刷新并重新核对。');
 const p=request.payload;
 if(Object.keys(p).some(k=>!['date','startTime','endTime','status','price','paidAmount','paidDate','artistId','venueId','channelId','details'].includes(k)))throw Error('不支持的修改字段。');
 if(!validDate(p.date)||!time(p.startTime)||!time(p.endTime)||p.endTime<=p.startTime)throw Error('请选择有效日期和开始/结束时间，结束须晚于开始。');
 if(!['Inquiry','Confirmed','Completed','Cancelled'].includes(p.status))throw Error('订单状态无效。');
 if(current.status==='Inquiry'&&p.status==='Completed')throw Error('咨询订单须先确认才能完成。');
 if(['Completed','Cancelled'].includes(current.status)&&p.status!==current.status&&p.status!=='Inquiry')throw Error('已完成或取消订单须先重新设为咨询中。');
 if(!artists.some(a=>a.id===p.artistId&&a.bookingEligible!==false)||!venues.some(v=>v.id===p.venueId))throw Error('请选择有效化妆师和场地。');
 if(p.channelId&&!channels.some(c=>c.id===p.channelId))throw Error('渠道无效。');
 if(typeof p.details!=='string'||p.details.length>2000)throw Error('服务说明最多2000字。');
 const cents=demoAmountCents(p.price),paidCents=demoAmountCents(p.paidAmount);
 if(paidCents===null)throw Error('到账原额须明确填写，无收款时填0。');
 if(paidCents>0&&!validDate(p.paidDate))throw Error('有收款时须填写实际收款日期。');
 if(bookings.some(b=>b.id!==current.id&&b.clientId===current.clientId&&b.date===p.date&&b.service===current.service))throw Error('该客户当天已有同类订单，请核对重复订单。');
 const patch={date:p.date,startTime:p.startTime,endTime:p.endTime,status:p.status,price:cents===null?null:cents/100,
  paidCents,paidDate:paidCents?p.paidDate:null,artistIds:[p.artistId,...current.artistIds.slice(1).filter(id=>id!==p.artistId)],
  venueId:p.venueId,channelId:p.channelId||null,details:p.details,version:(current.version||0)+1,needsReview:false,
  classSchedule:current.date===p.date&&current.startTime===p.startTime?current.classSchedule:null};
 const change={requestId:request.id,bookingId:current.id,reason:request.reason.trim(),payload:p,before:current,after:{...current,...patch},actor:context.adminPersona||'admin',savedAt:new Date().toISOString()};
 return {state:{...state,bookingOverrides:{...(state.bookingOverrides||{}),[current.id]:patch},channelAssignments:{...(state.channelAssignments||{}),[current.id]:p.channelId||null},bookingChangeLog:[...(state.bookingChangeLog||[]),change]},booking:change.after,replayed:false};
}

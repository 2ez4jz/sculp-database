import {applyDemoBookingChange} from '../../domain/demo-orders.js';
import {loadState,saveState} from '../../services/storage.js';
export function mountDemoOrderEditor({root,booking,data,getContext,onSaved,esc}) {
 let review=null,saving=false;
 const opts=(rows,id)=>rows.map(r=>`<option value="${esc(r.id)}" ${r.id===id?'selected':''}>${esc(r.name)}</option>`).join('');
 root.innerHTML=`<details class="cloud-intake"><summary>修改演示订单</summary><p class="cloud-note">核对后只保存到此浏览器。订单金额与到账原额分别填写；未知价格留空，不作为零金额。</p><form data-demo-edit>
 <div class="intake-fields"><label>服务日期<input name="date" type="date" required value="${esc(booking.date)}"></label>
 <label>开始时间<input name="startTime" type="time" required value="${esc(booking.startTime)}"></label>
 <label>结束时间<input name="endTime" type="time" required value="${esc(booking.endTime)}"></label>
 <label>订单状态<select name="status">${[['Inquiry','咨询中'],['Confirmed','已确认'],['Completed','已完成'],['Cancelled','已取消']].map(([id,label])=>`<option value="${id}" ${id===booking.status?'selected':''}>${label}</option>`).join('')}</select></label>
 <label>订单金额 · CAD<input name="price" inputmode="decimal" value="${booking.price===null?'':esc(booking.price)}"></label>
 <label>到账原额 · CAD<input name="paidAmount" inputmode="decimal" required value="${esc((booking.paidCents||0)/100)}"></label>
 <label>收款日期<input name="paidDate" type="date" value="${esc(booking.paidDate||'')}"></label>
 <label>主化妆师<select name="artistId">${opts(data.artists.filter(a=>a.bookingEligible!==false),booking.artistIds[0])}</select></label>
 <label>场地<select name="venueId">${opts(data.venues,booking.venueId)}</select></label>
 <label>来源渠道<select name="channelId"><option value="">未填写</option>${opts(data.channels,booking.channelId)}</select></label></div>
 <label>服务说明<textarea name="details" maxlength="2000">${esc(booking.details||'')}</textarea></label>
 <label>修改原因<textarea name="reason" required maxlength="2000"></textarea></label><button type="submit">核对修改</button></form>
 <div data-demo-review></div><p data-demo-status role="status" aria-live="polite"></p>
 <p class="cloud-note">到账原额未扣退款；此版本没有成本和退款流水，不能计算利润。</p></details>`;
 const form=root.querySelector('form'),zone=root.querySelector('[data-demo-review]'),status=root.querySelector('[data-demo-status]');
 form.oninput=()=>{review=null;zone.replaceChildren();};
 form.onsubmit=e=>{
  e.preventDefault();if(saving)return;
  const payload=Object.fromEntries(['date','startTime','endTime','status','price','paidAmount','paidDate','artistId','venueId','channelId','details'].map(k=>[k,form.elements[k].value]));
  review={id:crypto.randomUUID(),bookingId:booking.id,expectedVersion:booking.version||0,payload,reason:form.elements.reason.value,confirmed:true};
  const labels={date:'服务日期',startTime:'开始时间',endTime:'结束时间',status:'状态',price:'订单金额 CAD',paidAmount:'到账原额 CAD',paidDate:'收款日期',artistId:'主化妆师',venueId:'场地',channelId:'来源渠道',details:'服务说明'};
  const before={...booking,price:booking.price===null?'':String(booking.price),paidAmount:String((booking.paidCents||0)/100),paidDate:booking.paidDate||'',artistId:booking.artistIds[0],channelId:booking.channelId||'',details:booking.details||''};
  const changed=Object.keys(payload).filter(k=>payload[k]!==before[k]);
  if(!changed.length){review=null;status.textContent='内容没有变化。';return;}
  zone.innerHTML='<h4>核对修改前后内容</h4>'+changed.map(k=>`<p><strong>${labels[k]}</strong>：${esc(before[k]||'未填写')} → ${esc(payload[k]||'未填写')}</p>`).join('')+'<button data-demo-confirm>确认保存修改</button><button data-demo-cancel>取消本次修改</button>';
  root.querySelector('[data-demo-cancel]').onclick=()=>{review=null;zone.replaceChildren();status.textContent='已取消，未保存。';};
  root.querySelector('[data-demo-confirm]').onclick=()=>{
   if(!review||saving)return;saving=true;
   try{
    const result=applyDemoBookingChange({state:loadState(),bookings:data.bookings,...data,context:getContext(),request:review});
    if(!saveState(result.state))throw Error('浏览器保存失败，本次未修改。');
    onSaved(result.state); // Reread canonical data and rerender statistics together.
   }catch(error){status.textContent=error.message;}finally{saving=false;}
  };
  status.textContent='确认后更新此浏览器的订单及分析数据。';
 };
}

// Fictional demo analytics: amounts are completed booking prices, never payments.
import {canViewBusiness} from './permissions.js';
export function monthlyStats(records,month,context){
 if(!canViewBusiness(context||{}))throw Error('Report requires studio management role');
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw RangeError('Use YYYY-MM');
 const result={month,bookings:0,completed:0,confirmed:0,inquiries:0,cancelled:0,amountCents:0,unpriced:0};
 for(const b of records){
  if(!b || typeof b.date!=='string'||b.date.slice(0,7)!==month)continue;
  const d=new Date(b.date+'T00:00:00Z');
  if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==b.date)continue;
  if(b.status==='Cancelled'){result.cancelled++;continue;}
  if(!['Completed','Confirmed','Inquiry'].includes(b.status))continue;
  result.bookings++;
  if(b.status==='Confirmed')result.confirmed++;
  if(b.status==='Inquiry')result.inquiries++;
  if(b.status!=='Completed')continue;
  result.completed++;
  const price=b.price;
  const cents=typeof price==='number' && Number.isFinite(price)&&price>=0?Math.round(price*100):null;
  if(cents===null||!Number.isSafeInteger(cents)||Math.abs(price*100-cents)>1e-6||b.currency&&b.currency!=='CAD')result.unpriced++;
  else result.amountCents+=cents;
 }
 return result;
}

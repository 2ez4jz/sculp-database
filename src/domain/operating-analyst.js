// Read-only operational diagnostics. Values always originate from explicit report fields.
export const delta=(current,prior)=>{
 if(!Number.isSafeInteger(current)||!Number.isSafeInteger(prior))return null;
 const change=current-prior;
 return {current,prior,change,percent:prior===0?null:Math.round(change/prior*10000)/100};
};
export function diagnosePeriods({current,previous,metric='completedAmountCents'}={}){
 const allowed=['records','completed','completedAmountCents','grossReceivedCents'];
 if(!allowed.includes(metric))throw Error('Unsupported metric');
 if(!current||!previous)return {status:'insufficient',reason:'Missing comparable periods',questions:['提供同口径上一周期数据']};
 const comparison=delta(current[metric],previous[metric]);
 if(!comparison)return {status:'insufficient',reason:'Non-integer or missing measure'};
 const warnings=[];
 if((current.unpricedCompleted||previous.unpricedCompleted)&&metric==='completedAmountCents')warnings.push('存在未定价已完成订单，金额变化不完整');
 if(metric==='grossReceivedCents')warnings.push('到账原额未扣除退款，不等于利润或净收款');
 if((current.records??10)<10||(previous.records??10)<10)warnings.push('样本较少，变化可能不稳定');
 return {status:'supported',metric,comparison,warnings,
  hypotheses:['订单数量变化','服务结构或客单价变化','服务时间与收款时间错位'],
  checks:['复核状态及未定价订单','核对渠道和服务类别构成','比较同季节等长周期'],
  recommendation:'先核查变化来源，再决定是否调整渠道、定价或排班',
  certainty:'comparison-only'};
}
export function evaluateRecommendation({evidence,action,expectedMetric,reviewDate}={}){
 if(!evidence||!action||!expectedMetric||!reviewDate)return {ready:false,missing:['证据','行动','衡量指标','复盘日期'].filter((_,i)=>![evidence,action,expectedMetric,reviewDate][i])};
 return {ready:true,proposal:{evidence,action,expectedMetric,reviewDate,status:'pending-approval'}};
}

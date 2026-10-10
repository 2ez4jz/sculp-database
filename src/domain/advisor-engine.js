// Strictly read-only domain analytics. No SQL generation and no writes.
import {fixtureSummary} from '../data/advisor-fixtures.js';
export function advisorMetrics(rows,{service=null,channel=null,month=null}={}) {
  const chosen=rows.filter(r=>(!service||r.service===service)&&(!channel||r.channel===channel)&&(!month||r.month===month));
  const completed=chosen.filter(r=>r.status==='completed');
  const totalCents=completed.reduce((a,r)=>a+r.amountCents,0);
  const paidCents=chosen.reduce((a,r)=>a+r.paidCents,0);
  const cancelled=chosen.filter(r=>r.status==='cancelled').length;
  return {count:chosen.length,completed:completed.length,cancelled,completedCents:totalCents,receivedCents:paidCents,
    averageCompletedCents:completed.length?Math.round(totalCents/completed.length):null,
    warning:chosen.length<10?'LOW_SAMPLE':null, source:'fictional-fixture'};
}
export function advisorInsight(rows) {
  const overall=fixtureSummary(rows);
  const bridal=advisorMetrics(rows,{service:'bridal'});
  const peakCount=overall.bridalByMonth.slice(4,9).reduce((a,b)=>a+b,0);
  return [{kind:'fact',title:'Bridal seasonality',evidence:{peakMonths:'May–September',orders:peakCount,total:overall.counts.bridal},
    explanation:'High seasonal concentration; this does not by itself establish capacity shortages.'},
    {kind:'review',title:'Receivables need checking',evidence:{completedCents:overall.completedCents,receivedCents:overall.paidCents},
    explanation:'The difference is not necessarily overdue debt: timing, billing and refunds need reconciliation.'},
    {kind:'metric',title:'Bridal booking value',evidence:bridal}];
}
export function proposeKnowledge({text,sourceId,actorConfirmed=false}={}) {
  if(typeof text!=='string'||!text.trim()||!sourceId)throw Error('Knowledge requires content and source');
  return {text:text.trim(),sourceId,kind:'candidate',approved:actorConfirmed===true,mayBeUsedAsPolicy:actorConfirmed===true};
}

// Response-backed status only: no background model calls or connectivity claims.
export function modelStatus(state='idle',turn=null,en=false){
 const t=(zh,english)=>en?english:zh;
 const model=typeof turn?.modelProfile?.model==='string'?turn.modelProfile.model.slice(0,120):'';
 const local=turn?.engine==='local'||turn?.engine==='mock';
 if(state==='error')return {state:'error',text:t('AI · 请求失败','AI · Request failed')+(model?' · '+model:''),detail:t('本次请求失败。模型名仅表示上一次响应。','This request failed. Model shown is from the previous response.')};
 if(state==='busy')return {state:'busy',text:t('AI · 请求中','AI · Requesting')+(model?' · '+model:''),detail:t('正在请求；模型名在响应后确认。','Request in progress; model is confirmed after the response.')};
 if(local)return {state:'local',text:turn.engine==='mock'?t('模拟回复 · 未调用模型','Mock reply · No model call'):t('本地计算 · 未调用模型','Local calculation · No model call'),detail:t('本次回答未调用在线模型。','No online model was called for this reply.')};
 if(state==='ready')return {state:model?'ready':'unknown',text:model?t('AI · 最近响应：','AI · Last response: ')+model:t('AI · 已响应，模型未报告','AI · Responded; model not reported'),detail:t('模型来自本次后端响应；指示灯不是持续在线检测。','Model reported by the latest backend response; this is not a continuous health check.')+(turn?.agentFallback?t(' 本次使用兼容路径。',' Compatibility path used.'):'')};
 return {state:'idle',text:model?t('AI · 上次模型：','AI · Previous model: ')+model:t('AI · 待连接','AI · Awaiting request'),detail:t('发送消息后显示本次响应模型；历史记录不代表当前已连接。','Send a message to confirm the model. History does not establish a current connection.')};
}

const defaults={
 environment:'demo',
 aiMode:'mock',
 apiBaseUrl:'https://lztzzdhqghwubygpzcbq.supabase.co/functions/v1/sculpy-ai',
 appName:'Sculpy',
 studioName:'SCULP Studio',
 dataNotice:'客户、订单与合作记录均为虚构测试数据'
};

export const config=Object.freeze({...defaults,...(globalThis.SCULPY_CONFIG||{})});
export const apiUrl=action=>`${config.apiBaseUrl}?action=${encodeURIComponent(action)}`;

const defaults={
 environment:'production',
 cloudIntakeAiEnabled:true,
 supabaseUrl:'https://lztzzdhqghwubygpzcbq.supabase.co',
 supabasePublishableKey:'sb_publishable_WjRIfa_fXiwHuhs57jQ68A_0nAPJtDE',
 aiMode:'openai',
 appName:'Sculpy',
 studioName:'SCULP Studio'
};

export const config=Object.freeze({...defaults,...(globalThis.SCULPY_CONFIG||{})});

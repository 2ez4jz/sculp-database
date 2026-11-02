// Use the maintained RFC Web Push implementation; fetch keeps transport portable to Edge.
export function createPushTransport(webpush,fetchImpl=fetch){
 function request(subscription,payload,keys,topic){
  try{return webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:300,urgency:'normal',topic,contentEncoding:'aes128gcm',
   vapidDetails:{subject:'https://sculpstudio.ca/',publicKey:keys.publicKey,privateKey:keys.privateKey}});}catch{throw Object.assign(Error('Push encoding failed'),{kind:'encoding'});}
 }
 return {
  generateKeys(){
   const keys=webpush.generateVAPIDKeys();
   const client=webpush.generateVAPIDKeys();
   const auth=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
   const check=request({endpoint:'https://fcm.googleapis.com/fcm/send/SCULPY-CRYPTO-SELFTEST',keys:{p256dh:client.publicKey,auth}},{title:'Sculpy 推送测试'},keys,'sculpy-crypto-selftest');
   if(!check.body?.length)throw Error('Push encoding unavailable');
   return keys;
  },
  async sendPush({subscription,payload,keys,topic}){
   const r=request(subscription,payload,keys,topic);
   const response=await fetchImpl(r.endpoint,{method:r.method,headers:r.headers,body:new Uint8Array(r.body),redirect:'error',signal:AbortSignal.timeout(5000)});
   const result={status:response.status,retryAfter:response.headers.get('retry-after')};await response.body?.cancel();return result;
  },
 };
}

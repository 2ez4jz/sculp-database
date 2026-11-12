import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import webpush from 'npm:web-push@3.6.7';
import {notificationHandler} from './handler.js';
import {createPushTransport} from './transport.js';
const url=Deno.env.get('SUPABASE_URL')!;
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options);
Deno.serve(notificationHandler({
 admin,callerFor:(authorization:string)=>createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{...options,global:{headers:{Authorization:authorization}}}),
 allowedOrigins:new Set((Deno.env.get('NOTIFICATION_ALLOWED_ORIGINS')||'https://2ez4jz.github.io').split(',').map(x=>x.trim()).filter(Boolean)),
 ...createPushTransport(webpush),
}));

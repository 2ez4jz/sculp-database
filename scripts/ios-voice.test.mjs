import test from 'node:test';
import assert from 'node:assert/strict';
import {audioUpload,recordingMime} from '../supabase/functions/sculpy-ai/audio-format.js';
import {transcribeAudio} from '../src/services/sculpy.js';
import {createVoiceCapture} from '../src/pages/sculpy/voice.js';
const mp4=new Uint8Array([0,0,0,24,102,116,121,112,77,52,65,32,0,0,0,0]);
test('encoded MP4 overrides a misleading WebM filename and MIME; other containers keep matching extensions',async()=>{
 for(const [bytes,type,name,extension] of [[mp4,'audio/webm','old.webm','mp4'],[mp4,'','old.webm','mp4'],[new Uint8Array([26,69,223,163]),'audio/webm;codecs=opus','x.webm','webm'],[new TextEncoder().encode('OggS0000'),'audio/ogg','x.ogg','ogg'],[new TextEncoder().encode('RIFF0000WAVE'),'audio/wav','x.wav','wav']]){
  const result=await audioUpload(new File([bytes],name,{type}));
  assert.equal(result.extension,extension);assert.equal(result.name,'sculpy.'+extension);
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),bytes);
 }
 await assert.rejects(()=>audioUpload(new Blob([])),/没有录到/);
 await assert.rejects(()=>audioUpload(new Blob(['unknown'])),/无法识别/);
 assert.equal(recordingMime({isTypeSupported:m=>m==='audio/mp4'}),'audio/mp4');
 assert.equal(recordingMime({isTypeSupported:m=>m==='audio/webm;codecs=opus'}),'audio/webm;codecs=opus');
});
test('client upload and server forwarding repair old Safari uploads without changing bytes',async()=>{
 globalThis.Deno={env:{get:k=>k==='OPENAI_API_KEY'?'test-key':undefined}};
 const {transcribe}=await import('../supabase/functions/sculpy-ai/transcribe.ts');
 const previous=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{
   const file=options.body.get('audio');assert.match(file.name,/\.mp4$/);assert.equal(file.type,'audio/mp4');
   return Response.json({text:'synthetic client test'});
  };
  assert.equal((await transcribeAudio(new Blob([mp4],{type:'audio/mp4'}))).text,'synthetic client test');
  globalThis.fetch=async(url,options)=>{
   const file=options.body.get('file');assert.equal(file.name,'sculpy.mp4');assert.equal(file.type,'audio/mp4');
   assert.deepEqual(new Uint8Array(await file.arrayBuffer()),mp4);
   return Response.json({text:'synthetic server test'});
  };
  const form=new FormData();form.append('audio',new File([mp4],'cached-client.webm',{type:'audio/webm'}));
  const response=await transcribe(new Request('https://example.test',{method:'POST',body:form}),'http://localhost:4173');
  assert.equal(response.status,200);assert.equal((await response.json()).text,'synthetic server test');
 }finally{globalThis.fetch=previous;}
});
test('Safari-like recorder negotiates MP4, uses the actual final chunk type and retains the draft',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldRecorder=globalThis.MediaRecorder;
 const elements={'#voice-button':{textContent:'语音输入'},'#voice-status':{textContent:'Ready'},'#sculpy-text':{value:'原来的草稿',dispatchEvent(){}}};
 let stopped=0,upload;
 class Recorder{
  static isTypeSupported(mime){return mime==='audio/mp4';}
  constructor(stream,options){assert.equal(options.mimeType,'audio/mp4');this.mimeType='';this.state='inactive';}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([mp4],{type:'audio/mp4'})});void this.onstop?.();}
 }
 try{
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}}});
  globalThis.MediaRecorder=Recorder;
  const voice=createVoiceCapture({$:s=>elements[s],config:{aiMode:'openai'},transcribeAudio:async blob=>{upload=await audioUpload(blob);return {text:'测试语音'};}});
  await voice.toggle();assert.equal(elements['#voice-button'].textContent,'结束录音');await voice.toggle();
  for(let i=0;i<10&&!elements['#sculpy-text'].value.includes('测试语音');i++)await new Promise(r=>setTimeout(r,0));
  assert.equal(upload.extension,'mp4');assert.equal(elements['#sculpy-text'].value,'原来的草稿\n测试语音');assert(stopped>0);
  voice.dispose();
 }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;globalThis.MediaRecorder=oldRecorder;}
});

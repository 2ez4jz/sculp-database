// Keep the encoded container, MIME type and upload extension in agreement.
// In particular, Safari's MP4/AAC bytes must never be sent as a .webm file.
const formats={mp4:{mime:'audio/mp4',extension:'mp4'},webm:{mime:'audio/webm',extension:'webm'},ogg:{mime:'audio/ogg',extension:'ogg'},wav:{mime:'audio/wav',extension:'wav'},mp3:{mime:'audio/mpeg',extension:'mp3'}};
export async function audioUpload(blob,stem='sculpy'){
 if(!blob?.size)throw Error('没有录到声音，请重新录制。');
 const bytes=new Uint8Array(await blob.slice(0,64).arrayBuffer());
 const text=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
 let kind;
 if(text(4,8)==='ftyp')kind='mp4';
 else if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)kind='webm';
 else if(text(0,4)==='OggS')kind='ogg';
 else if(text(0,4)==='RIFF'&&text(8,12)==='WAVE')kind='wav';
 else if(text(0,3)==='ID3')kind='mp3';
 const mime=(blob.type||'').split(';')[0].trim().toLowerCase();
 kind??=({'audio/mp4':'mp4','video/mp4':'mp4','audio/x-m4a':'mp4','audio/m4a':'mp4','audio/webm':'webm','video/webm':'webm','audio/ogg':'ogg','application/ogg':'ogg','audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/mp3':'mp3'})[mime];
 if(!kind){const ext=String(blob.name||'').split('.').at(-1)?.toLowerCase();kind=({m4a:'mp4',mp4:'mp4',webm:'webm',ogg:'ogg',wav:'wav',mp3:'mp3',mpga:'mp3',mpeg:'mp3'})[ext];}
 if(!kind)throw Error('暂时无法识别这段录音格式，请重新录制或用 Safari 打开后再试。');
 const format=formats[kind];
 return {blob:new Blob([blob],{type:format.mime}),name:stem+'.'+format.extension,...format};
}

export function recordingMime(Recorder){
 if(typeof Recorder.isTypeSupported!=='function')return '';
 return ['audio/webm;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(mime=>Recorder.isTypeSupported(mime))||'';
}

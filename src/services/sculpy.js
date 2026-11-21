import {config} from '../config.js';
import {audioUpload} from '../../supabase/functions/sculpy-ai/audio-format.js';

export async function transcribeAudio(blob, supabase) {
  const {data, error} = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw Error('请先登录再使用语音。');
  const upload = await audioUpload(blob, `sculpy-${Date.now()}`);
  const form = new FormData();
  form.append('audio', upload.blob, upload.name);
  const response = await fetch(`${config.supabaseUrl}/functions/v1/sculpy-ai?action=transcribe`, {
    method: 'POST',
    headers: {authorization: `Bearer ${data.session.access_token}`, apikey: config.supabasePublishableKey},
    body: form,
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || '录音转写失败，请重试。');
  return result;
}

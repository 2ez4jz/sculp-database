import {recordingMime} from '../../../supabase/functions/sculpy-ai/audio-format.js';
// One capture session per mounted Sculpy page. Disposal never transcribes.
export function createVoiceCapture({ $, transcribeAudio, config }) {
  let recorder = null;
  let stream = null;
  let version = 0;
  let busy = false;
  let initialLabel = null, initialStatus = null;

  function dispose() {
    version++;
    busy = false;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      if (recorder.state !== "inactive") recorder.stop();
      recorder = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const button = $("#voice-button"), status = $("#voice-status");
    if (button && initialLabel) button.textContent = initialLabel;
    if (status && initialStatus !== null) status.textContent = initialStatus;
  }

  async function toggle() {
    const button = $("#voice-button"),
      status = $("#voice-status");
    if (!button || !status) return;
    initialLabel ||= button.textContent;
    initialStatus ??= status.textContent;
    if (recorder?.state === "recording") {
      busy = true;
      recorder.stop();
      button.textContent = initialLabel;
      status.textContent = "正在转写……";
      return;
    }
    if (busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      status.textContent = "当前浏览器不支持录音，可以先用文字输入。";
      return;
    }
    const current = ++version;
    busy = true;
    let acquired = null;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== version) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      const mimeType=recordingMime(MediaRecorder);
      let capture;
      try { capture=new MediaRecorder(acquired,mimeType?{mimeType}:undefined); }
      catch(error){if(error.name!=='NotSupportedError')throw error;capture=new MediaRecorder(acquired);}
      const chunks = [];
      recorder = capture;
      capture.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      capture.onerror = () => {
        capture.onstop=null;
        acquired.getTracks().forEach(track=>track.stop());
        if(current!==version)return;
        recorder=null;stream=null;busy=false;button.textContent=initialLabel;
        status.textContent='录音中断了，请重新录制。原来的文字仍保留。';
      };
      capture.onstop = async () => {
        acquired.getTracks().forEach((track) => track.stop());
        if (current !== version) return;
        recorder = null;
        stream = null;
        try {
          const transcript = await transcribeAudio(
            new Blob(chunks, { type: chunks.find(chunk=>chunk.type)?.type || capture.mimeType || '' }),
          );
          if (current !== version) return;
          const input = $("#sculpy-text");
          if (!input) return;
          input.value = [input.value.trim(), transcript.text || transcript]
            .filter(Boolean)
            .join("\n");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          status.textContent =
            config.aiMode === "mock"
              ? "Mock 转写完成 · 正式语音接口已预留"
              : "语音转写完成";
        } catch (error) {
          if (current === version)
            status.textContent = "转写失败：" + error.message;
        } finally {
          if (current === version) busy = false;
        }
      };
      capture.start();
      busy = false;
      button.textContent = "结束录音";
      status.textContent = "正在聆听…说完后点“结束录音”。";
    } catch (error) {
      acquired?.getTracks().forEach((track) => track.stop());
      if (current === version) {
        recorder = null;
        stream = null;
        busy = false;
        status.textContent = "无法使用麦克风：" + error.message;
      }
    }
  }
  return { toggle, dispose };
}

import {renderFollowups} from "./followups.js?v=guided-20261015";
import {modelStatus} from "./model-status.js";
import {renderChatAnswer} from "./answer-view.js?v=guided-20261015";
import {createOperatingMemory} from "./operating-memory.js";
import { createVoiceCapture } from "../../pages/sculpy/voice.js?v=ios-audio-20261015";
import { transcribeAudio } from "../../services/sculpy.js?v=ios-audio-20261015";
import { config } from "../../config.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function createChatPanel({
  adapter,
  getScope = () => ({ id: "global", label: "全局工作助手" }),
  onReference,
  renderSupplement = () => "",
  onTurnsChanged = () => {},
}) {
  const host = document.createElement("div");
  host.className = "chat-host";
  document.body.append(host);
  host.innerHTML = `<button class="chat-launcher" aria-label="与 Sculpy 连续聊天"><img src="assets/sculpy.webp" alt=""><span>聊一聊<small>Sculpy 助手</small></span></button><dialog class="chat-dialog" aria-labelledby="chat-title"><header class="chat-header"><img src="assets/sculpy.webp" alt=""><div><span>SCULPY · YOUR AI COMPANION</span><h2 id="chat-title">Sculpy</h2><p class="chat-scope"></p><div class="chat-model-status" data-i18n-ignore data-ai-state="idle" role="status" aria-live="polite"><i aria-hidden="true"></i><span>AI · 待连接</span></div></div><button type="button" data-chat-menu aria-label="聊天设置" aria-expanded="false">•••</button><button data-close aria-label="关闭聊天">✕</button></header><details class="chat-preferences"><summary>回复偏好</summary><label>回复详略<select data-verbosity><option value="brief">简洁</option><option value="balanced">适中</option><option value="detailed">详细解释</option></select></label><label>希望 Sculpy 如何配合你<textarea data-instructions maxlength="1000" rows="2" placeholder="例如：先列待处理事项，给建议时说明原因。"></textarea></label><button data-save-preferences>保存我的偏好</button><small>这一版保存你明确设置的偏好，经营政策可由管理员在经营记忆面板提交并确认。</small></details><div class="chat-messages" role="log" aria-live="polite"></div><div class="chat-status" role="status" aria-live="polite"></div><form class="chat-composer"><label class="sr-only" for="chat-input">发送给 Sculpy</label><textarea id="chat-input" maxlength="4000" rows="3" placeholder="问一件事，补充一个细节，或接着刚才聊……"></textarea><div><button type="button" id="chat-voice">语音输入</button><span class="chat-storage"></span><button type="submit" class="primary" data-send>发送消息 ↗</button></div><small id="chat-voice-status">语音先转成文字，检查后发送。</small><small class="chat-keyboard-hint">Enter 发送，Shift + Enter 换行。</small></form></dialog>`;
  createOperatingMemory(host.querySelector(".chat-preferences"), adapter.memory);
  const dialog = host.querySelector("dialog"),
    $ = (s) => host.querySelector(s);
  let scope,
    identity,
    version = 0,
    turns = [],
    busy = false,
    requestId = null,
    disposed = false,
    inline = false,
    pendingMessage = "";
  let lastModelTurn=null;
  function showModel(state,turn=lastModelTurn){
    if(turn)lastModelTurn=turn;
    const view=modelStatus(state,turn,adapter.mode==='demo'&&window.DemoI18n?.language!=='zh');
    const indicator=$(".chat-model-status");indicator.dataset.aiState=view.state;indicator.title=view.detail;
    indicator.querySelector('span').textContent=view.text;
  }
  const drafts = new Map();
  const mobile=()=>window.matchMedia('(max-width: 600px)').matches;
  const preferences=$('.chat-preferences');
  $('[data-chat-menu]').onclick=()=>{
    preferences.open=!preferences.open;
    $('[data-chat-menu]').setAttribute('aria-expanded',String(preferences.open));
  };
  preferences.addEventListener('toggle',()=>{$('[data-chat-menu]').setAttribute('aria-expanded',String(preferences.open));});
  const desktopPlaceholder=$('#chat-input').placeholder;
  function resizeInput(){
    const input=$('#chat-input');
    input.placeholder=mobile()?(window.DemoI18n?.language==='en'?'Message or record…':'发消息，或录音…'):desktopPlaceholder;
    input.style.height=mobile()?'0px':'';
    if(mobile())input.style.height=Math.min(128,Math.max(44,input.scrollHeight))+'px';
  }
  function viewportChanged(){
    const messages=$('.chat-messages');
    const atBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<60;
    const viewport=window.visualViewport;
    host.style.setProperty('--chat-viewport-height',(viewport?.height||window.innerHeight)+'px');
    host.style.setProperty('--chat-viewport-top',(viewport?.offsetTop||0)+'px');
    if(inline)document.body.style.setProperty('--mobile-chat-top',(viewport?.offsetTop||0)+'px');
    resizeInput();
    if(atBottom)requestAnimationFrame(()=>{if(!disposed)messages.scrollTop=messages.scrollHeight;});
  }
  window.visualViewport?.addEventListener('resize',viewportChanged);
  window.visualViewport?.addEventListener('scroll',viewportChanged);
  window.addEventListener('resize',viewportChanged);
  viewportChanged();
  const voice = createVoiceCapture({
    $: (s) =>
      $(
        {
          "#voice-button": "#chat-voice",
          "#voice-status": "#chat-voice-status",
          "#sculpy-text": "#chat-input",
        }[s] || s,
      ),
    transcribeAudio,
    config,
  });
  const voiceStateObserver=new MutationObserver(()=>{
    const button=$('#chat-voice'),active=/结束录音|stop recording/i.test(button.textContent);
    button.classList.toggle('is-recording',active);
    button.setAttribute('aria-pressed',String(active));
  });
  voiceStateObserver.observe($('#chat-voice'),{childList:true,subtree:true,characterData:true});
  const status = (text, error = false) => {
    $(".chat-status").textContent = text;
    $(".chat-status").classList.toggle("error", error);
  };
  const lock = (value) => {
    busy = value;
    $("[data-send]").disabled = value;
    $("[data-save-preferences]").disabled = value;
    $("#chat-voice").disabled = value;
    $("#chat-input").disabled = value;
    host.querySelectorAll("[data-followup]").forEach(button=>button.disabled=value);
  };
  function draw() {
    const expanded = new Set([...host.querySelectorAll("details[data-response-id][open]")].map(el=>el.dataset.responseId));
    $(".chat-messages").innerHTML = turns.length
      ? turns
          .map(
            (t, i) =>
              `<article class="chat-user"><small>你</small><div>${esc(t.user)}</div></article><article class="chat-assistant"><small>SCULPY</small>${renderChatAnswer(t,renderSupplement(t),{expanded:expanded.has(String(t.id||i)),key:String(t.id||i)})}<div class="chat-references">${(t.references || []).map((r) => `<button data-reference="${esc(r.id)}">${esc(r.label)} ↗</button>`).join("")}</div>${(t.proposals || []).map((p, j) => `<section class="chat-proposal"><strong>${p.kind === "change" ? "待确认的变更建议" : p.kind === "task" ? "待办记录" : "订单备注"} · ${esc(p.label)}</strong><p>${esc(p.text)}</p><small>${p.kind === "change" ? "仅保存建议，不修改正式日期、金额或付款字段。" : "核对后将内容保存到此订单。"}</small><button data-save="${i}:${j}" ${p.saved ? "disabled" : ""}>${p.saved ? "已保存" : p.kind === "change" ? "确认提交建议" : "确认保存到此订单"}</button></section>`).join("")}${i===turns.length-1?renderFollowups(t,{en:!/\p{Script=Han}/u.test(t.answer||''),previousTurns:turns.slice(0,i)}):''}</article>`,
          )
          .join("")
      : `<div class="chat-welcome"><img class="chat-welcome-avatar" src="assets/sculpy.webp" alt=""><span>YOUR STUDIO COMPANION</span><h3>今天想聊点什么？</h3><p>${scope?.id === "global" ? "可以聊想法、问问题、写点东西，也可以一起看看工作室的数据。" : "可以聊这笔订单，也可以换个话题。需要记录时，我会请你确认。"}</p><div><button data-example="最近工作室有哪些值得留意的变化？先用大白话说说。">看看最近的情况</button><button data-example="帮我想几个让老客人愿意推荐朋友的小点子。">找点灵感</button><button data-example="今天有点累，随便聊聊。">随便聊聊</button></div></div>`;
    if (pendingMessage) $(".chat-messages").insertAdjacentHTML("beforeend", `<article class="chat-user"><small>你</small><div>${esc(pendingMessage)}</div></article><article class="chat-assistant chat-thinking"><small>SCULPY</small><span>正在想一想…</span></article>`);
    $(".chat-messages").scrollTop = $(".chat-messages").scrollHeight;
    onTurnsChanged(turns, scope);
  }
  async function open(next = getScope()) {
    voice.dispose();
    preferences.open=false;
    version++;
    const mine = version;
    if (scope) drafts.set(`${identity}:${scope.id}`, $("#chat-input").value);
    scope = next;
    host.dataset.scope=next.id==='global'?'global':'booking';
    identity = adapter.identity();
    lastModelTurn=null;showModel("idle");
    requestId = null;
    turns = [];
    pendingMessage = "";
    draw();
    lock(true);
    status("正在读取订单、对话和个人偏好…");
    $(".chat-scope").textContent = next.label;
    $(".chat-storage").textContent =
      adapter.mode === "cloud" ? "云端私人对话" : "虚构演示 · 仅本机保存";
    $("#chat-input").value = drafts.get(`${identity}:${scope.id}`) || "";
    if (inline) dialog.setAttribute("open", "");
    else if (!dialog.open) dialog.showModal();
    try {
      const result = await adapter.load(scope.id);
      if (mine !== version || disposed) return;
      turns = result.turns || [];
      showModel("idle",turns.at(-1));
      $("[data-verbosity]").value = result.preferences?.verbosity || "detailed";
      $("[data-instructions]").value = result.preferences?.instructions || "";
      draw();
      status("");
      lock(false);
      resizeInput();
      if(!mobile())$("#chat-input").focus();
    } catch (error) {
      if (mine === version) {
        status(error.message, true);
        showModel("error");
        lock(true);
      }
    }
  }
  function close() {
    if (scope) drafts.set(`${identity}:${scope.id}`, $("#chat-input").value);
    version++;
    voice.dispose();
    dialog.close();
    pendingMessage = "";
  }
  async function send(event) {
    event.preventDefault();
    if (busy) return;
    const message = $("#chat-input").value.trim();
    if (!message) return;
    voice.dispose();
    const mine = version;
    const current = scope.id;
    requestId ||= crypto.randomUUID();
    const id = requestId;
    pendingMessage = message;
    draw();
    lock(true);
    status("正在读取业务记录并整理回答…");
    showModel("busy");
    try {
      const turn = await adapter.send(current, { message, requestId: id });
      if (mine !== version) return;
      pendingMessage = "";
      turns.push(turn);
      showModel("ready",turn);
      requestId = null;
      $("#chat-input").value = "";
      drafts.delete(`${identity}:${current}`);
      draw();
      status("");
    } catch (error) {
      if (mine === version) {
        pendingMessage = "";
        draw();
        status(error.message + " 原话仍保留，可重试。", true);
        showModel("error");
      }
    } finally {
      if (mine === version) {
        lock(false);
        resizeInput();
        if(!mobile())$("#chat-input").focus();
      }
    }
  }
  $(".chat-composer").onsubmit = send;
  $("#chat-input").oninput = () => {
    resizeInput();
    requestId = null;
  };
  $("#chat-input").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      $(".chat-composer").requestSubmit();
    }
  };
  $(".chat-launcher").onclick = () => open();
  $("[data-close]").onclick = close;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  host.addEventListener("click", async (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    if(button.dataset.followup){
      if(busy)return;
      const input=$("#chat-input");
      if(input.value.trim()){status("输入框中还有你的草稿，请先发送或清空，再选择继续提问。");input.focus();return;}
      input.value=button.dataset.followup;
      $(".chat-composer").requestSubmit();return;
    }
    if (button.id === "chat-voice" && !busy) voice.toggle();
    if (button.dataset.example) {
      $("#chat-input").value = window.DemoI18n?.text(button.dataset.example) || button.dataset.example;
      resizeInput();
      $("#chat-input").focus();
    }
    if (button.dataset.reference) {
      const id = button.dataset.reference;
      close();
      if (onReference) onReference(id);
      else location.hash = `bookings/${encodeURIComponent(id)}`;
    }
    if (button.hasAttribute("data-save-preferences")) {
      const mine = version;
      button.disabled = true;
      try {
        await adapter.preferences({
          verbosity: $("[data-verbosity]").value,
          instructions: $("[data-instructions]").value.trim(),
        });
        if (mine === version) status("已保存你的回复偏好，下次对话会使用。");
      } catch (error) {
        if (mine === version) status(error.message, true);
      } finally {
        if (mine === version) button.disabled = false;
      }
    }
    if (button.dataset.save && !busy) {
      const [i, j] = button.dataset.save.split(":").map(Number),
        turn = turns[i],
        proposal = turn.proposals[j],
        mine = version;
      lock(true);
      button.disabled = true;
      status("正在保存，请稍候…");
      try {
        await adapter.save(proposal, turn);
        proposal.saved = true;
        if (mine === version) {
          draw();
          status(
            proposal.kind === "change"
              ? "变更建议已保存，正式订单字段尚未修改。"
              : adapter.mode === "cloud"
                ? "已保存到对应订单。"
                : "已保存到此浏览器的演示订单。",
          );
        }
      } catch (error) {
        if (mine === version) {
          button.disabled = false;
          status(error.message, true);
        }
      } finally {
        if (mine === version) lock(false);
      }
    }
  });
  return {
    open,
    close,
    mount(target) {
      close();
      inline = true;
      host.classList.add("chat-inline");
      target.append(host);
      viewportChanged();
      return open();
    },
    detach() {
      if (!inline) return;
      close();
      inline = false;
      document.body.style.removeProperty('--mobile-chat-top');
      host.classList.remove("chat-inline");
      document.body.append(host);
    },
    sync() {
      if (
        dialog.open &&
        (identity !== adapter.identity() || scope.id !== getScope().id)
      )
        close();
    },
    destroy() {
      disposed = true;
      version++;
      voice.dispose();
      voiceStateObserver.disconnect();
      window.visualViewport?.removeEventListener('resize',viewportChanged);
      window.visualViewport?.removeEventListener('scroll',viewportChanged);
      window.removeEventListener('resize',viewportChanged);
      host.remove();
    },
  };
}

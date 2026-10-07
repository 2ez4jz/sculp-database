import { createVoiceCapture } from "../../pages/sculpy/voice.js";
import { transcribeAudio } from "../../services/sculpy.js";
import { config } from "../../config.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Escape first; render only a tiny safe subset of Markdown, never model HTML/URLs.
const format = (value) =>
  esc(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/^#{1,4}\s+(.+)$/gm, "<strong>$1</strong>");
export function createChatPanel({
  adapter,
  getScope = () => ({ id: "global", label: "全局工作助手" }),
  onReference,
}) {
  const host = document.createElement("div");
  host.className = "chat-host";
  document.body.append(host);
  host.innerHTML = `<button class="chat-launcher" aria-label="与 Sculpy 连续聊天"><img src="assets/sculpy.webp" alt=""><span>聊一聊<small>Sculpy 助手</small></span></button><dialog class="chat-dialog" aria-labelledby="chat-title"><header class="chat-header"><img src="assets/sculpy.webp" alt=""><div><span>SCULPY · YOUR WORK COMPANION</span><h2 id="chat-title">一起把工作理清楚</h2><p class="chat-scope"></p></div><button data-close aria-label="关闭聊天">✕</button></header><details class="chat-preferences"><summary>我的偏好 · 每个账号独立记忆</summary><label>回复详略<select data-verbosity><option value="brief">简洁</option><option value="balanced">适中</option><option value="detailed">详细解释</option></select></label><label>希望 Sculpy 如何配合你<textarea data-instructions maxlength="1000" rows="2" placeholder="例如：先列待处理事项，给建议时说明原因。"></textarea></label><button data-save-preferences>保存我的偏好</button><small>这一版保存你明确设置的偏好，自动长期记忆整理尚未开启。</small></details><div class="chat-messages" role="log" aria-live="polite"></div><div class="chat-status" role="status" aria-live="polite"></div><form class="chat-composer"><label class="sr-only" for="chat-input">发送给 Sculpy</label><textarea id="chat-input" maxlength="4000" rows="3" placeholder="问一件事，补充一个细节，或接着刚才聊……"></textarea><div><button type="button" id="chat-voice">语音输入</button><span class="chat-storage"></span><button type="submit" class="primary" data-send>发送消息 ↗</button></div><small id="chat-voice-status">语音先转成文字，检查后发送。Enter 发送，Shift + Enter 换行。</small></form></dialog>`;
  const dialog = host.querySelector("dialog"),
    $ = (s) => host.querySelector(s);
  let scope,
    identity,
    version = 0,
    turns = [],
    busy = false,
    requestId = null,
    disposed = false;
  const drafts = new Map();
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
  };
  function draw() {
    $(".chat-messages").innerHTML = turns.length
      ? turns
          .map(
            (t, i) =>
              `<article class="chat-user"><small>你</small><div>${esc(t.user)}</div></article><article class="chat-assistant"><small>SCULPY</small><div class="chat-answer">${format(t.answer)}</div><div class="chat-references">${(t.references || []).map((r) => `<button data-reference="${esc(r.id)}">${esc(r.label)} ↗</button>`).join("")}</div>${(t.proposals || []).map((p, j) => `<section class="chat-proposal"><strong>${p.kind === "change" ? "待确认的变更建议" : p.kind === "task" ? "待办记录" : "订单备注"} · ${esc(p.label)}</strong><p>${esc(p.text)}</p><small>${p.kind === "change" ? "仅保存建议，不修改正式日期、金额或付款字段。" : "核对后将内容保存到此订单。"}</small><button data-save="${i}:${j}" ${p.saved ? "disabled" : ""}>${p.saved ? "已保存" : p.kind === "change" ? "确认提交建议" : "确认保存到此订单"}</button></section>`).join("")}</article>`,
          )
          .join("")
      : `<div class="chat-welcome"><span>有上下文的对话，从这里开始。</span><h3>查询、讨论，或者记下一点细节。</h3><p>我会先读取${scope?.id === "global" ? "你有权限查看的订单" : "当前订单"}，需要时再查其他相关记录。</p><div><button data-example="这${scope?.id === "global" ? "些" : "个"}订单有哪些信息还需要确认？">检查待确认事项</button><button data-example="帮我整理一下目前的安排，并解释需要注意的地方。">一起看一下安排</button></div></div>`;
    $(".chat-messages").scrollTop = $(".chat-messages").scrollHeight;
  }
  async function open(next = getScope()) {
    voice.dispose();
    version++;
    const mine = version;
    if (scope) drafts.set(`${identity}:${scope.id}`, $("#chat-input").value);
    scope = next;
    identity = adapter.identity();
    requestId = null;
    turns = [];
    draw();
    lock(true);
    status("正在读取订单、对话和个人偏好…");
    $(".chat-scope").textContent = next.label;
    $(".chat-storage").textContent =
      adapter.mode === "cloud" ? "云端私人对话" : "虚构演示 · 仅本机保存";
    $("#chat-input").value = drafts.get(`${identity}:${scope.id}`) || "";
    if (!dialog.open) dialog.showModal();
    try {
      const result = await adapter.load(scope.id);
      if (mine !== version || disposed) return;
      turns = result.turns || [];
      $("[data-verbosity]").value = result.preferences?.verbosity || "detailed";
      $("[data-instructions]").value = result.preferences?.instructions || "";
      draw();
      status("");
      lock(false);
      $("#chat-input").focus();
    } catch (error) {
      if (mine === version) {
        status(error.message, true);
        lock(true);
      }
    }
  }
  function close() {
    if (scope) drafts.set(`${identity}:${scope.id}`, $("#chat-input").value);
    version++;
    voice.dispose();
    dialog.close();
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
    lock(true);
    status("正在读取业务记录并整理回答…");
    try {
      const turn = await adapter.send(current, { message, requestId: id });
      if (mine !== version) return;
      turns.push(turn);
      requestId = null;
      $("#chat-input").value = "";
      drafts.delete(`${identity}:${current}`);
      draw();
      status("");
    } catch (error) {
      if (mine === version)
        status(error.message + " 原话仍保留，可重试。", true);
    } finally {
      if (mine === version) {
        lock(false);
        $("#chat-input").focus();
      }
    }
  }
  $(".chat-composer").onsubmit = send;
  $("#chat-input").oninput = () => {
    requestId = null;
  };
  $("#chat-input").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
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
    if (button.id === "chat-voice" && !busy) voice.toggle();
    if (button.dataset.example) {
      $("#chat-input").value = button.dataset.example;
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
      host.remove();
    },
  };
}

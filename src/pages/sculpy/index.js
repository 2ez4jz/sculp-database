import { searchCatalog, searchLinks } from "../../domain/sculpy.js";
import {
  transcribeAudio,
  extractMemory,
  searchMemory,
  sculpyExample,
} from "../../services/sculpy.js";
import { createVoiceCapture } from "./voice.js";
import { wantsRevenueChart } from "../insights/chart.js";

export function createSculpyPage({
  getContext,
  available,
  isGlobal,
  head,
  esc,
  date,
  serviceName,
  config,
  client,
  artists,
  partners,
  bookings,
  notes,
  get,
  $,
  toast,
  persist,
  serviceRevenueChart,
}) {
  let draft = null,
    prepareVersion = 0,
    searchVersion = 0;
  const voice = createVoiceCapture({ $, transcribeAudio, config });
  function invalidateDraft() {
    draft = null;
    prepareVersion++;
  }
  function dispose() {
    invalidateDraft();
    searchVersion++;
    voice.dispose();
  }
  const example = sculpyExample;
  function sculpy(id) {
    const list = available(),
      b =
        list.find((b) => b.id === id) ||
        list.find((b) => b.date === "2026-10-02") ||
        list[0];
    return (
      head("sculpy", "记录、搜索，也帮助团队做下一步决定。") +
      `<div class="demo-notice"><strong>V1 PREVIEW · ${config.aiMode === "mock" ? "MOCK AI" : "ONLINE AI"}</strong>　语音、整理和搜索已接入统一接口；当前客户与订单仍为虚构测试数据。</div><section class="panel sculpy-search-panel"><div class="sculpy-ask-title"><div class="eyebrow">ASK SCULPY</div><h2>问 Sculpy</h2><p class="small muted">可以问客户、场次、收入、团队与合作记录，也可以直接让它生成图表。</p></div><div class="sculpy-search"><input id="sculpy-search" type="search" placeholder="问一件关于工作室的事……" aria-label="问 Sculpy 一个问题"><button class="primary" data-action="sculpy-search">发送</button></div><div class="quick-queries"><button data-sculpy-query="Mango">Mango 合作记录</button><button data-sculpy-query="十二月 晚宴">十二月机会</button><button data-sculpy-query="Wedding">婚礼经验</button>${isGlobal() ? '<button data-sculpy-query="过去一个月各种服务收入的饼图">近一个月收入饼图</button>' : ""}</div><div id="sculpy-search-results" aria-live="polite"></div></section><div class="sculpy-layout"><section class="panel sculpy-input-panel"><div class="sculpy-welcome"><img class="sculpy-scene" src="assets/sculpy.webp" alt="Sculpy，奶油瓷感的 3D 小精灵"><div class="sculpy-greeting"><div class="eyebrow">YOUR STUDIO COMPANION</div><div class="sculpy-intro">今天的工作<br>怎么样？</div><p>喜欢的、不喜欢的，<br>我都陪你记下来。</p></div></div><p class="small muted">喜欢的、不喜欢的、你观察到的小细节，都可以记下来。</p><div class="field"><label for="sculpy-booking">记录到哪一场</label><select id="sculpy-booking">${list.map((x) => `<option value="${x.id}" ${x.id === b.id ? "selected" : ""}>${x.date} · ${esc(client(x.clientId).name)} · ${serviceName[x.service]}</option>`).join("")}</select></div><div class="field"><label for="sculpy-text">你的原话</label><textarea id="sculpy-text" placeholder="例如：她最喜欢底妆，睫毛后来换了更轻的一副……"></textarea></div><div class="actions"><button class="primary" data-action="prepare">告诉 Sculpy</button><button data-action="example">试试发布会示例</button><button id="voice-button" data-action="voice">开始语音记录</button></div><span class="voice-status" id="voice-status">语音会先转成文字，再由你确认。</span><div id="sculpy-message" aria-live="polite"></div></section><section class="panel" id="sculpy-review"><div class="eyebrow">A LITTLE MEMORY</div><h2>记录会被这样留下来</h2><div class="timeline"><p>完整保留你的原话<small>以后可以随时回看</small></p><p>确认整理后的摘要<small>AI 只生成草稿，由员工确认</small></p><p>放进正确的场次<small>与作品和参与团队一起保存</small></p></div><div class="divider"></div><p class="summary">一年以后，你能找回的，<br>不只是照片。<br>还有你认真完成过的每一场工作。</p></section></div>`
    );
  }
  async function prepare() {
    const raw = $("#sculpy-text").value.trim(),
      bookingId = $("#sculpy-booking").value;
    if (!raw) {
      toast("先说说今天的工作吧。");
      $("#sculpy-text").focus();
      return;
    }
    const b = available().find((b) => b.id === bookingId);
    if (!b) return;
    const version = ++prepareVersion;
    draft = null;
    $("#sculpy-message").innerHTML =
      '<div class="message">Sculpy 正在整理这段工作记忆……</div>';
    try {
      const result = await extractMemory({
        bookingId,
        rawText: raw,
        pageContext: { clientId: b.clientId, artistIds: b.artistIds },
      });
      if (version !== prepareVersion) return;
      draft = {
        bookingId,
        rawText: raw,
        aiSummary: result.summary || "",
        preferences: (result.preferences || []).join("；"),
        opportunities: (result.opportunities || []).join("；"),
      };
      $("#sculpy-message").innerHTML =
        '<div class="message">我记下来了。原话会完整保留。<br>看看右边，确认后就放进这一场。</div>';
      $("#sculpy-review").innerHTML =
        `<div class="eyebrow">REVIEW / ${esc(client(b.clientId).name)}</div><h2>确认这份工作记忆</h2><p class="small muted">${date(b.date)} · ${serviceName[b.service]}</p><p class="fake-note">${result.provider === "mock" ? "Mock AI 整理 · 正式接口已预留" : "在线 AI 整理"} · 置信度 ${Math.round((result.confidence || 0) * 100)}%</p><div class="review-field"><label for="draft-summary">工作摘要</label><input id="draft-summary" value="${esc(draft.aiSummary)}" placeholder="可选：用一句话记下关键反馈"></div><div class="review-field"><label for="draft-preferences">服务偏好（用分号分开）</label><input id="draft-preferences" value="${esc(draft.preferences)}" placeholder="例如：喜欢轻薄底妆"></div>${getContext().role === "admin" ? `<div class="review-field"><label for="draft-opportunities">后续机会 · 仅管理员可见</label><input id="draft-opportunities" value="${esc(draft.opportunities)}" placeholder="可选：下次活动、转介绍等"></div>` : ""}<details style="margin:18px 0"><summary>回看原话</summary><div class="raw">${esc(raw)}</div></details><div class="actions"><button class="primary" data-action="save-note">确认并保存到场次</button><button data-action="cancel-note">返回修改</button></div>`;
    } catch (error) {
      if (version !== prepareVersion) return;
      $("#sculpy-message").innerHTML =
        `<div class="message error">整理失败：${esc(error.message)}。原话还在，可以稍后重试。</div>`;
    }
  }
  async function runSculpySearch(query) {
    const version = ++searchVersion;
    const input = $("#sculpy-search"),
      target = $("#sculpy-search-results"),
      q = (query || input.value).trim();
    if (!q) {
      input.focus();
      return;
    }
    input.value = q;
    if (wantsRevenueChart(q) && !isGlobal()) {
      target.innerHTML =
        '<div class="message error">收入与全局经营数据仅对 Jz 和 Miranda 开放。</div>';
      return;
    }
    target.innerHTML =
      '<div class="sculpy-thinking"><span class="assistant-avatar">S.</span><div><strong>Sculpy</strong><p>正在查找工作室记录……</p></div></div>';
    try {
      const catalog = searchCatalog({
          bookings: available(),
          artists,
          partners,
          notes: [...notes, ...getContext().state.notes],
          client,
          serviceName,
          context: getContext(),
        }),
        result = await searchMemory(q, catalog),
        answer = wantsRevenueChart(q)
          ? "我按服务整理了最近 30 天已完成场次的收入。金额来自工作室记录，图表与明细会保持一致。"
          : result.answer;
      if (version !== searchVersion) return;
      result.results = searchLinks(result.results, catalog);
      target.innerHTML = `<div class="search-answer"><div class="assistant-message"><span class="assistant-avatar">S.</span><div class="assistant-body"><div class="assistant-byline"><strong>Sculpy</strong><span>工作室数据库助手</span></div><p>${esc(answer)}</p>${
        wantsRevenueChart(q)
          ? serviceRevenueChart()
          : result.results.length
            ? `<div class="search-result-list">${result.results
                .slice(0, 6)
                .map((x) => {
                  return `<a href="${esc(x.href)}">${esc(x.label || x.title || x.name || x.id)}<small>${esc(x.reason || x.meta || "相关记录")}</small></a>`;
                })
                .join("")}</div>`
            : '<p class="small muted">换一个名字、服务或合作方试试。</p>'
      }<div class="assistant-source">${result.provider === "mock" ? "本地 Mock 搜索" : "在线 AI · 数据库结果"}</div></div></div></div>`;
    } catch (error) {
      if (version !== searchVersion) return;
      target.innerHTML = `<div class="message error">搜索失败：${esc(error.message)}</div>`;
    }
  }

  function handleAction(b) {
    const action = b.dataset.action;
    if (action === "voice") voice.toggle();
    if (action === "sculpy-search") runSculpySearch();
    if (b.dataset.sculpyQuery) runSculpySearch(b.dataset.sculpyQuery);
    if (action === "example") {
      const b0 = available().find((b) => b.id === "b0");
      if (b0) $("#sculpy-booking").value = "b0";
      $("#sculpy-text").value = example;
      prepare();
    }
    if (action === "prepare") prepare();
    if (action === "cancel-note") {
      invalidateDraft();
      $("#sculpy-review").innerHTML =
        '<h2>继续修改原话</h2><p class="muted small">修改后再点“告诉 Sculpy”。</p>';
    }
    if (action === "save-note" && draft) {
      const bookingId = draft.bookingId;
      if (!available().some((x) => x.id === bookingId)) return;
      getContext().state.notes.push({
        id: "local-" + crypto.randomUUID(),
        entityType: "booking",
        entityId: bookingId,
        rawText: draft.rawText,
        aiSummary: $("#draft-summary").value.trim(),
        structuredData: {
          preferences: $("#draft-preferences")
            .value.split(/[；;]/)
            .map((x) => x.trim())
            .filter(Boolean),
          opportunities:
            getContext().role === "admin"
              ? $("#draft-opportunities").value.trim()
                ? [$("#draft-opportunities").value.trim()]
                : []
              : [],
        },
        createdBy:
          getContext().role === "artist"
            ? getContext().artistId
            : get(bookings, bookingId).artistIds[0],
        createdAt: new Date().toISOString(),
        source: "sculpy_text",
        summarySource: "user_confirmed",
      });
      persist();
      draft = null;
      location.hash = "bookings/" + bookingId;
      toast("这份工作记忆已保存到当前浏览器。");
    }
  }
  function handleInput(target) {
    if (target.id === "sculpy-text" || target.id === "sculpy-booking") {
      invalidateDraft();
      $("#sculpy-review").innerHTML =
        '<h2>继续修改原话</h2><p class="muted small">修改后再点“告诉 Sculpy”。</p>';
    }
  }
  return { render: sculpy, handleAction, handleInput, dispose };
}

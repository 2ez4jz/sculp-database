import {
  memoryTargets,
  relatedTargets,
  routeTarget,
  keyOf,
  entityNames,
  kindNames,
  routes,
  normalizeProposal,
  validateMemory,
  visibleMemories,
} from "../../domain/memory.js";
import {
  extractContextMemory,
  transcribeAudio,
  transcribeImage,
} from "../../services/sculpy.js";
import { createVoiceCapture } from "../../pages/sculpy/voice.js";
import { storeAttachments, removeAttachments, getAttachment } from "../../services/attachments.js";

export function createMemoryPanel({
  data,
  getContext,
  repository,
  onSaved,
  esc,
  config,
}) {
  const host = document.createElement("div");
  host.id = "memory-host";
  document.body.append(host);
  host.innerHTML = `<dialog class="memory-dialog" aria-labelledby="memory-title"><header class="memory-header"><div class="memory-brand"><img src="assets/sculpy.webp" alt=""><div><span class="eyebrow">SCULPY / A LITTLE MEMORY</span><h2 id="memory-title">把这件事记下来</h2></div></div><button data-memory-close aria-label="关闭记录面板">✕</button></header><div class="memory-body"></div><footer class="memory-footer"></footer></dialog>`;
  const dialog = host.querySelector("dialog"),
    body = host.querySelector(".memory-body"),
    footer = host.querySelector(".memory-footer");
  const $ = (selector) => dialog.querySelector(selector);
  let root = null,
    items = [],
    rawText = "",
    polishedText = "",
    recordedAt = "",
    pendingImages = [],
    inputType = "text",
    draftId = "",
    version = 0,
    busy = false,
    saving = false,
    identityKey = "",
    success = false,
    opener = null;
  const drafts = new Map();
  const targets = () => memoryTargets(data, getContext());
  const related = () => relatedTargets(root, targets(), data);
  const assignees = () =>
    getContext().role === "admin"
      ? data.artists.filter((a) => a.bookingEligible !== false)
      : data.artists.filter((a) => a.id === getContext().artistId);
  const voice = createVoiceCapture({
    $: (selector) =>
      $(
        {
          "#voice-button": "#memory-voice",
          "#voice-status": "#memory-voice-status",
          "#sculpy-text": "#memory-text",
        }[selector] || selector,
      ),
    transcribeAudio,
    config,
  });
  function status(message, error = false) {
    const el = $("#memory-message");
    if (el) {
      el.textContent = message;
      el.classList.toggle("error", error);
    }
  }
  function capture() {
    if ($("#memory-text")) rawText = $("#memory-text").value;
  }
  function stash() {
    capture();
    if (root && !success) drafts.set(keyOf(root), rawText);
  }
  function stop() {
    version++;
    voice.dispose();
    busy = false;
  }
  function setBusy(value) {
    busy = value;
    if (saving || !value)
      dialog
        .querySelectorAll("input,textarea,select")
        .forEach((el) => (el.disabled = value));
    dialog
      .querySelectorAll(
        "[data-memory-prepare],[data-memory-save],#memory-target,#memory-voice,[data-memory-add]",
      )
      .forEach((b) => (b.disabled = value));
  }
  function itemMarkup(item, index) {
    const dest = related().find((t) => keyOf(t) === item.target),
      pending = item.kind === "change" || dest?.proposalOnly;
    return `<article class="memory-card-review" data-card="${index}"><div class="memory-card-top"><label><input type="checkbox" data-item="${index}" data-field="selected" ${item.selected ? "checked" : ""}>${esc(kindNames[item.kind])}</label><span class="memory-kind ${pending ? "review" : ""}">${pending ? "提交管理员确认" : "确认后添加"}</span></div><div class="memory-destination">保存到 · ${esc(entityNames[dest?.type] || "")} / ${esc(dest?.label || "请选择位置")}</div><label class="sr-only" for="memory-item-${index}">第 ${index + 1} 项内容</label><textarea id="memory-item-${index}" maxlength="4000" data-item="${index}" data-field="text" rows="2">${esc(item.text)}</textarea>${
      item.kind === "task"
        ? `<div class="memory-task-fields"><label>负责人<select data-item="${index}" data-field="assigneeId"><option value="">待分配</option>${assignees()
            .map(
              (a) =>
                `<option value="${esc(a.id)}" ${item.assigneeId === a.id ? "selected" : ""}>${esc(a.name)}</option>`,
            )
            .join(
              "",
            )}</select></label><label>跟进日期<input type="date" data-item="${index}" data-field="dueDate" value="${esc(item.dueDate)}"></label></div><small>日期留空会保存为“待定日期”，不会自动推算“下周”。</small>`
        : ""
    }</article>`;
  }
  function review() {
    const zone = $("#memory-review");
    if (!zone) return;
    zone.innerHTML = items.length
      ? `<div class="memory-review-heading"><div><span class="eyebrow">REVIEW & SAVE</span><h3>确认内容和保存位置</h3></div><span>${items.length} 项建议</span></div>${items.map(itemMarkup).join("")}<details class="memory-add"><summary>＋ 添加保存项</summary><div class="memory-task-fields"><label>内容类型<select id="memory-add-kind">${Object.entries(
          kindNames,
        )
          .map(([k, v]) => `<option value="${k}">${v}</option>`)
          .join(
            "",
          )}</select></label><label>保存位置<select id="memory-add-target">${related()
          .map(
            (t) =>
              `<option value="${esc(keyOf(t))}">${esc(entityNames[t.type])} · ${esc(t.label)}</option>`,
          )
          .join(
            "",
          )}</select></label></div><button data-memory-add>添加一项</button></details>`
      : "";
    updateFooter();
  }
  function updateFooter() {
    const count = items.filter((i) => i.selected).length;
    footer.innerHTML = success
      ? ""
      : `<div><strong>${repository.mode === "cloud" ? "保存至工作室云端" : "演示模式 · 保存到此浏览器"}</strong><small>${repository.mode === "cloud" ? "只有保存成功后才会显示确认。" : "不会同步到其他设备；请勿录入真实客户资料。"}</small></div><button class="primary" data-memory-save ${!count || busy ? "disabled" : ""}>确认保存${count ? " " + count + " 项" : ""}</button>`;
  }
  function editor() {
    success = false;
    body.innerHTML = `<section class="memory-context"><label for="memory-target">记录到</label><select id="memory-target"><option value="">请选择一条订单或档案</option>${targets()
      .map(
        (t) =>
          `<option value="${esc(keyOf(t))}" ${root && keyOf(root) === keyOf(t) ? "selected" : ""}>${esc(entityNames[t.type])} · ${esc(t.label)}</option>`,
      )
      .join(
        "",
      )}</select><p>默认跟随当前页面。跨对象的内容会列出保存位置，由你确认。</p></section><section class="memory-composer"><div class="memory-input-heading"><label for="memory-text">原始输入 · 完整保留</label><time id="memory-recorded-at">${esc(recordedAt ? new Date(recordedAt).toLocaleString("zh-CN",{hour12:false}) : "尚未开始")}</time></div><div class="memory-input-modes" role="group" aria-label="录入方式"><span>⌨ 文字</span><span>🎙 语音</span><button type="button" data-image-upload>▧ 上传图片</button><input id="memory-image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><small>也可在输入框粘贴截图或拖入图片</small></div><textarea id="memory-text" rows="5" maxlength="4000" placeholder="说说工作反馈、客户偏好，或下一次需要记得的事……">${esc(rawText)}</textarea><div class="memory-compose-actions"><button id="memory-voice" class="memory-record">开始语音记录</button><button class="primary" data-memory-prepare>整理记录 <span aria-hidden="true">↗</span></button></div><p id="memory-voice-status">语音先转为文字，你可以修改后再整理。</p></section><div id="memory-message" role="status" aria-live="polite"></div><section id="memory-polished" class="memory-polished" hidden><div class="memory-input-heading"><strong>AI 整理全文</strong><small>原始全文不变 · 请与原话对照</small></div><p id="memory-polished-text"></p></section><div id="memory-review"></div>`;
    review();
  }
  function open() {
    if (dialog.open) return;
    opener = document.activeElement;
    stop();
    saving = false;
    root = routeTarget(location.hash, targets());
    items = [];
    rawText = root ? drafts.get(keyOf(root)) || "" : "";
    inputType = "text";
    pendingImages = [];
    polishedText = "";
    recordedAt = new Date().toISOString();
    draftId = "";
    editor();
    dialog.showModal();
    if (root) $("#memory-text").focus();
    else $("#memory-target").focus();
  }
  function close({ restore = true } = {}) {
    if (saving) return;
    stash();
    stop();
    dialog.close();
    if (restore && opener?.isConnected) opener.focus();
  }
  async function ingestImage(file) {
    if (busy || saving || !file) return;
    if (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 4_000_000) {
      status("请选择小于 4MB 的 PNG、JPEG 或 WebP 图片。", true);
      return;
    }
    const current = ++version;
    setBusy(true);
    status("正在识别图片全文，不会自动保存到数据库……");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
      const result = await transcribeImage(dataUrl);
      if (current !== version || !dialog.open) return;
      const editor = $("#memory-text");
      editor.value = [editor.value.trim(), `[图片：${file.name} · 识别文字]\n${result.text}`].filter(Boolean).join("\n\n").slice(0,4000);
      rawText = editor.value;
      pendingImages.push({file, capturedAt: new Date().toISOString()});
      inputType = "image";
      polishedText = "";
      items = [];
      review();
      status("图片文字已添加到原文区。请核对识别内容后点击「整理记录」。确认后图片原件也会保存在此浏览器的本地归档中，不会同步设备。");
    } catch (error) {
      if (current === version) status("图片识别失败：" + error.message + "；请改用文字输入。", true);
    } finally {
      if (current === version) { setBusy(false); updateFooter(); }
    }
  }
  async function prepare() {
    if (busy || saving) return;
    capture();
    if (!root) {
      status("请先选择记录到哪一条订单或档案。", true);
      $("#memory-target").focus();
      return;
    }
    if (!rawText.trim()) {
      status("先写下或说出你想记录的内容。", true);
      $("#memory-text").focus();
      return;
    }
    voice.dispose();
    const current = ++version;
    items = [];
    polishedText = "";
    $("#memory-polished").hidden = true;
    review();
    setBusy(true);
    status("Sculpy 正在整理，请稍候……");
    try {
      const result = await extractContextMemory({
        rawText,
        entity: { type: root.type, id: root.id, label: root.label },
        related: related().map(({ type, id, label }) => ({ type, id, label })),
      });
      if (current !== version || !dialog.open) return;
      const proposal = normalizeProposal(result, root, related(), rawText);
      items = proposal.items;
      polishedText = String(result.polishedText || result.summary || rawText).trim();
      $("#memory-polished-text").textContent = polishedText;
      $("#memory-polished").hidden = false;
      draftId = crypto.randomUUID();
      review();
      const warning = proposal.warnings.join(" ");
      status(
        warning ||
          "请核对每项内容和保存位置。金额、日期、人员及状态变更仅作为申请记录，不会直接修改订单。",
      );
    } catch (error) {
      if (current === version)
        status("整理失败：" + error.message + " 原话仍保留，可以重试。", true);
    } finally {
      if (current === version) {
        setBusy(false);
        updateFooter();
      }
    }
  }
  async function save() {
    if (busy || saving || success) return;
    try {
      capture();
      const chosen = validateMemory(
        { root, rawText, items },
        targets(),
        related(),
        getContext(),
        assignees(),
      );
      const identity = getContext();
      const batch = {
        id: draftId || crypto.randomUUID(),
        entityType: root.type,
        entityId: root.id,
        rawText: rawText.trim(),
        polishedText,
        recordedAt,
        attachments: pendingImages.map(({file,capturedAt},i)=>({id:`${draftId || "pending"}:${i}`,name:file.name,type:file.type,size:file.size,capturedAt})),
        inputType,
        createdBy:
          identity.role === "admin"
            ? identity.adminPersona || "jz"
            : identity.artistId,
        createdAt: new Date().toISOString(),
        items: chosen,
      };
      saving = true;
      setBusy(true);
      status("正在保存，请稍候……");
      if (pendingImages.length && repository.mode !== "demo") throw Error("云端图片原件存储尚未启用，不能提交可能丢失图片的记录。");
      let archived = false;
      try {
        if (pendingImages.length) {
          batch.attachments = await storeAttachments(batch.id, pendingImages);
          archived = true;
        }
        await repository.save(batch);
      } catch (error) {
        if (archived) await removeAttachments(batch.id).catch(() => {});
        throw error;
      }
      success = true;
      pendingImages = [];
      drafts.delete(keyOf(root));
      body.innerHTML = `<section class="memory-success"><span class="memory-success-mark">✓</span><div class="eyebrow">MEMORY SAVED</div><h3>这件事，记下来了。</h3><p>${repository.mode === "cloud" ? "已保存到工作室云端。" : "已保存到此浏览器，刷新后仍可查看。"}</p><div class="memory-saved-items">${chosen
        .map((i) => {
          const dest = related().find(
              (t) => t.type === i.entityType && t.id === i.entityId,
            ),
            canOpen = targets().some(
              (t) => t.type === i.entityType && t.id === i.entityId,
            );
          return `<div><strong>${esc(kindNames[i.kind])}${i.status === "pending_review" ? " · 待管理员确认" : ""}</strong><span>${esc(dest?.label)}</span>${canOpen ? `<a href="#${routes[i.entityType]}/${encodeURIComponent(i.entityId)}" data-memory-view>查看记录 ↗</a>` : ""}</div>`;
        })
        .join("")}</div><button data-memory-close>完成</button></section>`;
      footer.innerHTML = "";
      onSaved();
    } catch (error) {
      status(error.message || "保存失败，内容已保留，请重试。", true);
    } finally {
      saving = false;
      setBusy(false);
      if (!success) updateFooter();
    }
  }
  function sync() {
    const nextIdentity = JSON.stringify([
      getContext().role,
      getContext().adminPersona,
      getContext().artistId,
    ]);
    if (identityKey && nextIdentity !== identityKey) {
      drafts.clear();
      if (dialog.open) {
        stop();
        dialog.close();
        rawText = "";
        pendingImages = [];
        items = [];
      }
    }
    identityKey = nextIdentity;
    // Repainting after a save keeps the success receipt. Navigation invalidates work.
    if (dialog.open && !success && !saving) close({ restore: false });
    const target = routeTarget(location.hash, targets());
    renderRecords(target);
  }
  function renderRecords(target) {
    document.querySelector("#context-memories")?.remove();
    if (!target) return;
    const records = visibleMemories(
      getContext().state.memories || [],
      target,
      getContext(),
    );
    const section = document.createElement("section");
    section.id = "context-memories";
    section.className = "panel contextual-records";
    section.innerHTML = `<div class="section-head"><div><div class="eyebrow">SCULPY / CONTEXT MEMORY</div><h2>${target.type === "booking" ? "补充记录与待办" : "Sculpy 记录"}</h2></div><button data-memory-open>＋ 告诉 Sculpy</button></div>${records.length ? records.map(({ batch, item }) => `<article class="context-memory-entry"><div class="context-memory-meta"><span class="tag">${esc(kindNames[item.kind])}</span>${item.status === "pending_review" ? '<span class="memory-kind review">待管理员确认</span>' : ""}<time title="保存时间">${esc(new Date(batch.createdAt).toLocaleString("zh-CN",{hour12:false}))}</time></div><p>${esc(item.text)}</p>${item.kind === "task" ? `<div class="memory-task-meta">负责人：${esc(data.artists.find((a) => a.id === item.assigneeId)?.name || "待分配")} · 日期：${esc(item.dueDate || "待定日期")}</div>` : ""}<details><summary>查看原话与来源</summary><p class="raw">${esc(batch.rawText)}</p><small class="memory-source-stamp">原始记录时间：${esc(new Date(batch.recordedAt || batch.createdAt).toLocaleString("zh-CN",{hour12:false}))} · 保存时间：${esc(new Date(batch.createdAt).toLocaleString("zh-CN",{hour12:false}))}</small>${batch.polishedText ? `<p class="memory-organized">整理全文：${esc(batch.polishedText)}</p>` : ""}${(batch.attachments || []).map(a=>`<button type="button" data-memory-image="${esc(a.id)}">查看原图 · ${esc(a.name)}</button>`).join("")}<span class="small muted">${esc(batch.createdBy)} · ${batch.inputType === "voice" ? "语音记录" : "文字记录"}</span>${targets().some((t) => t.type === batch.entityType && t.id === batch.entityId) ? ` · <a class="link" href="#${routes[batch.entityType]}/${encodeURIComponent(batch.entityId)}">原始记录位置</a>` : ""}</details></article>`).join("") : '<p class="memory-empty">把这次沟通、服务偏好或下次要做的事留在这里。</p>'}`;
    const stack = document.querySelector("#main > .two-col > .stack");
    if (stack) stack.prepend(section);
    else document.querySelector("#main").append(section);
  }
  host.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-memory-open")) open();
    if (button.hasAttribute("data-memory-close")) close();
    if (button.hasAttribute("data-image-upload")) $("#memory-image-file")?.click();
    if (button.hasAttribute("data-memory-image")) {
      getAttachment(button.dataset.memoryImage).then(record => {
        if (!record?.blob) return alert("本浏览器找不到原图片，可能已清除网站数据。");
        const url = URL.createObjectURL(record.blob);
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }).catch(error => alert("读取图片失败：" + error.message));
    }
    if (button.hasAttribute("data-memory-prepare")) prepare();
    if (button.hasAttribute("data-memory-save")) save();
    if (button.id === "memory-voice") {
      inputType = "voice";
      voice.toggle();
    }
    if (button.hasAttribute("data-memory-add")) {
      const kind = $("#memory-add-kind").value,
        target = $("#memory-add-target").value;
      if (kind === "preference" && !target.startsWith("client:")) {
        status("客户偏好只能保存到客户，请选择对应客户。", true);
        return;
      }
      if (items.length >= 16) {
        status("一次最多添加 16 项。", true);
        return;
      }
      draftId = crypto.randomUUID();
      items.push({
        kind,
        target,
        text: "",
        selected: true,
        dueDate: "",
        assigneeId: "",
      });
      review();
      $(`#memory-item-${items.length - 1}`).focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (
      !host.contains(event.target) &&
      event.target.closest("[data-memory-open]")
    )
      open();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
    if (event.target.closest("[data-memory-view]")) close();
  });
  dialog.addEventListener("input", (event) => {
    if (saving) return;
    const el = event.target;
    if (el.id === "memory-text") {
      rawText = el.value;
      if (busy || items.length) {
        version++;
        items = [];
        polishedText = "";
        $("#memory-polished").hidden = true;
        review();
        setBusy(false);
        status("原话已修改，请重新整理后保存。");
      }
    }
    if (el.dataset.item !== undefined) {
      const item = items[Number(el.dataset.item)];
      draftId = crypto.randomUUID();
      if (item)
        item[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
      updateFooter();
    }
  });
  dialog.addEventListener("change", (event) => {
    if (event.target.id === "memory-image-file") { const file = event.target.files?.[0]; ingestImage(file); event.target.value = ""; return; }
    if (event.target.id === "memory-target") {
      stash();
      stop();
      root = targets().find((t) => keyOf(t) === event.target.value) || null;
      rawText = root ? drafts.get(keyOf(root)) || "" : "";
      items = [];
      pendingImages = [];
      inputType = "text";
      pendingImages = [];
      polishedText = "";
      recordedAt = new Date().toISOString();
      editor();
    }
  });
  dialog.addEventListener("paste", (event) => {
    const image = [...(event.clipboardData?.files || [])].find((file) => file.type.startsWith("image/"));
    if (image) { event.preventDefault(); ingestImage(image); }
  });
  dialog.addEventListener("dragover", (event) => {
    if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault();
  });
  dialog.addEventListener("drop", (event) => {
    const image = [...(event.dataTransfer?.files || [])].find((file) => file.type.startsWith("image/"));
    if (image) { event.preventDefault(); ingestImage(image); }
  });
  window.addEventListener("hashchange", () => {
    if (dialog.open) close({ restore: false });
  });
  window.addEventListener("pagehide", () => {
    stash();
    stop();
  });
  return { sync, open };
}

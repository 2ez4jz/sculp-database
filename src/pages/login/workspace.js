import { mountCloudIntake } from './intake.js';
import { createChatPanel } from "../../components/chat/panel.js";
import { cloudChatAdapter } from "../../services/chat.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function mountCloudWorkspace({ root, supabase, profile }) {
  let destroyed = false,
    version = 0,
    offset = 0,
    current = { id: "global", label: "全局工作助手" };
  const panel = createChatPanel({
    adapter: cloudChatAdapter(supabase, profile),
    getScope: () => current,
    onReference: (id) => { void openOrder(id).catch(()=>{}); },
  });
  root.innerHTML = `<div data-intake-root></div><section data-order-detail hidden></section><button class="auth-primary" data-global>与 Sculpy 聊一聊 ↗</button><section class="cloud-orders"><h3>我的订单</h3><p class="cloud-note">仅显示当前账户有权限查看的云端订单。</p><form data-search><input aria-label="搜索云端订单" placeholder="客户、日期、场地或化妆师"><button class="auth-secondary">查找订单</button></form><p data-order-status role="status"></p><div data-orders></div><div><button data-prev>上一页</button> <button data-next>下一页</button></div></section>${["operations", "owner"].includes(profile.role) ? '<details class="company-rules"><summary>公司角色与工作规则</summary><p class="cloud-note">所有人的对话都会读取；请勿填写密码或限制共享的资料。</p><textarea maxlength="8000" aria-label="公司角色与工作规则"></textarea><button data-save-rules>保存公司规则</button><p data-rules-status role="status"></p></details>' : ""}`;
  const $ = (s) => root.querySelector(s);
  $("[data-global]").onclick = () => {
    current = { id: "global", label: "全局工作助手" };
    panel.open();
  };
  let detailVersion = 0;
  async function openOrder(id) {
    const mine = ++detailVersion;
    const detail = $("[data-order-detail]");
    detail.hidden = false;
    detail.textContent = "正在重新读取订单…";
    const {data,error} = await supabase.rpc("sculpy_order_detail", {p_booking_id:id});
    if(destroyed || mine !== detailVersion) return;
    if(error || !data?.bookings?.length){detail.textContent="订单读取失败或权限已变化，请重新查询。";throw Error("Order read failed");}
    const b=data.bookings[0];
    current={id,label:b.client+" · "+b.service};
    detail.innerHTML=`<h3>${esc(b.client)} · ${esc(b.service)}</h3><p>${esc(new Date(b.starts_at).toLocaleString('zh-CN',{timeZone:'America/Toronto'}))} · 多伦多时间</p><p>${esc(b.venue||'地点待定')} · ${esc(b.artists.join(' / ')||'人员待定')}</p><p>服务需求：${esc(b.service_details||'待补充')}</p>${['operations','owner'].includes(profile.role)?`<p>预算：${b.budget_cad==null?'未填写':esc(b.budget_cad)+' CAD'} · 成交价：${b.price_cad==null?'未确定':esc(b.price_cad)+' CAD'}</p>`:''}<p>状态：${esc({inquiry:'待确认需求',confirmed:'已确认',completed:'已完成',cancelled:'已取消'}[b.status]||b.status)}</p>${data.intake?`<details><summary>查看原始记录与时间</summary><p>录入：${esc(new Date(data.intake.recordedAt).toLocaleString('zh-CN'))} · 保存：${esc(new Date(data.intake.savedAt).toLocaleString('zh-CN'))}</p><pre>${esc(data.intake.rawText)}</pre></details>`:''}<button type="button" data-discuss>与 Sculpy 讨论这笔订单</button>`;
    detail.querySelector('[data-discuss]').onclick=()=>{current={id,label:b.client+" · "+b.service};panel.open()};
  }
  const intake = ["operations","owner"].includes(profile.role) ? mountCloudIntake({root:$("[data-intake-root]"),supabase,onSaved:async id=>{await load();await openOrder(id)}}) : null;
  async function load() {
    const mine = ++version;
    $("[data-order-status]").textContent = "正在读取订单…";
    const { data, error } = await supabase.rpc("sculpy_context", {
      p_booking_id: null,
      p_query: $("[data-search] input").value.trim(),
      p_offset: offset,
    });
    if (destroyed || mine !== version) return;
    if (error) {
      $("[data-order-status]").textContent = "订单读取失败，请稍后重试。";
      return;
    }
    $("[data-order-status]").textContent = data.total
      ? `找到 ${data.total} 个订单`
      : "暂无可查看的云端订单。管理员需要先录入订单并分配化妆师。";
    $("[data-orders]").innerHTML = data.bookings
      .map(
        (b) =>
          `<button class="cloud-order" data-booking="${esc(b.id)}"><strong>${esc(b.client)} · ${esc(b.service || "服务待定")}</strong><small>${esc(new Date(b.starts_at).toLocaleString("zh-CN", { timeZone: "America/Toronto" }))} · ${esc(b.venue || "地点待定")}</small><small>${esc(b.artists.join(" / ") || "人员待定")} · 点击查看与讨论 ↗</small></button>`,
      )
      .join("");
    $("[data-prev]").disabled = offset === 0;
    $("[data-next]").disabled = offset + 30 >= data.total;
    root.querySelectorAll("[data-booking]").forEach(
      (button) =>
        (button.onclick = () => {
          void openOrder(button.dataset.booking).catch(()=>{});
        }),
    );
  }
  $("[data-search]").onsubmit = (e) => {
    e.preventDefault();
    offset = 0;
    void load().catch(() => { if(!destroyed) $("[data-order-status]").textContent="网络异常，请重新查询。"; });
  };
  $("[data-prev]").onclick = () => {
    offset = Math.max(0, offset - 30);
    void load().catch(() => { if(!destroyed) $("[data-order-status]").textContent="网络异常，请重新查询。"; });
  };
  $("[data-next]").onclick = () => {
    offset += 30;
    void load().catch(() => { if(!destroyed) $("[data-order-status]").textContent="网络异常，请重新查询。"; });
  };
  if ($(".company-rules")) {
    supabase
      .from("sculpy_company_rules")
      .select("content")
      .eq("id", true)
      .single()
      .then(({ data, error }) => {
        if (destroyed) return;
        if (error) $("[data-rules-status]").textContent = "公司规则读取失败。";
        else $(".company-rules textarea").value = data.content;
      });
    $("[data-save-rules]").onclick = async () => {
      const button = $("[data-save-rules]");
      button.disabled = true;
      const { data, error } = await supabase
        .from("sculpy_company_rules")
        .update({
          content: $(".company-rules textarea").value,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true)
        .select("id");
      if (destroyed) return;
      $("[data-rules-status]").textContent =
        error || !data?.length
          ? "保存失败，请重试。"
          : "已保存，下次对话开始使用。";
      button.disabled = false;
    };
  }
  void load().catch(() => {
    if (!destroyed)
      $("[data-order-status]").textContent = "网络异常，请重新查询。";
  });
  return {
    destroy() {
      destroyed = true;
      version++;
      detailVersion++;
      intake?.destroy();
      panel.destroy();
    },
  };
}

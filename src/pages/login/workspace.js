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
    onReference: (id) => openOrder(id),
  });
  root.innerHTML = `<button class="auth-primary" data-global>与 Sculpy 聊一聊 ↗</button><section class="cloud-orders"><h3>我的订单</h3><p class="cloud-note">仅显示当前账户有权限查看的云端订单。</p><form data-search><input aria-label="搜索云端订单" placeholder="客户、日期、场地或化妆师"><button class="auth-secondary">查找订单</button></form><p data-order-status role="status"></p><div data-orders></div><div><button data-prev>上一页</button> <button data-next>下一页</button></div></section>${["operations", "owner"].includes(profile.role) ? '<details class="company-rules"><summary>公司角色与工作规则</summary><p class="cloud-note">所有人的对话都会读取；请勿填写密码或限制共享的资料。</p><textarea maxlength="8000" aria-label="公司角色与工作规则"></textarea><button data-save-rules>保存公司规则</button><p data-rules-status role="status"></p></details>' : ""}`;
  const $ = (s) => root.querySelector(s);
  $("[data-global]").onclick = () => {
    current = { id: "global", label: "全局工作助手" };
    panel.open();
  };
  async function openOrder(id) {
    current = { id, label: "订单对话" };
    panel.open();
  }
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
          current = {
            id: button.dataset.booking,
            label: button.querySelector("strong").textContent,
          };
          panel.open();
        }),
    );
  }
  $("[data-search]").onsubmit = (e) => {
    e.preventDefault();
    offset = 0;
    void load();
  };
  $("[data-prev]").onclick = () => {
    offset = Math.max(0, offset - 30);
    void load();
  };
  $("[data-next]").onclick = () => {
    offset += 30;
    void load();
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
      panel.destroy();
    },
  };
}

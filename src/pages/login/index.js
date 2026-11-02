import { mountCloudWorkspace } from "./workspace.js?v=241";
import { accountIdentifier, normalizeUsername, accountRoles } from "../../domain/accounts.js?v=roles-20261102";
import { mountWelcomeEditor } from "./welcome-editor.js?v=20261102";
import { config } from "../../config.js";
import {
  authConfigured,
  getAuthClient,
  verifiedProfile,
} from "../../services/auth.js?v=welcome-20261102";
const root = document.querySelector("#auth-root");
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const roles = accountRoles;
let supabase, subscription, workspace, welcomeEditor;
function frame(content) {
  root.innerHTML = `<div class="auth-layout"><section class="auth-story"><a class="auth-brand" href="./">Sculpy<span>SCULP STUDIO COMPANION</span></a><div class="auth-story-copy"><span class="auth-eyebrow">YOUR STUDIO, REMEMBERED.</span><h1>每一场工作，<br>都值得被记住。</h1><p>让订单、灵感与每一个细节，<br>在同一个工作空间里相遇。</p><img src="assets/sculpy.webp" alt="Sculpy 工作室助手"></div><small>SCULP STUDIO · 团队工作空间</small></section><section class="auth-content">${content}</section></div>`;
}
function message(text) {
  root.querySelector(".auth-status").textContent = text;
}
export async function showLogin() {
  workspace?.destroy();
  welcomeEditor?.destroy();
  welcomeEditor = null;
  workspace = null;
  document.title = "登录 · Sculpy";
  frame(
    `<div class="auth-card"><span class="auth-eyebrow">WELCOME BACK</span><h2>欢迎回到工作室</h2><p class="auth-muted">使用你的团队账户登录 Sculpy。</p><form id="login-form"><label for="username">账号</label><input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="例如 sculp_jz" required minlength="7" maxlength="32" pattern="[sS][cC][uU][lL][pP]_[a-zA-Z0-9][a-zA-Z0-9_]{0,25}"><label for="password">密码</label><div class="auth-password"><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="button" id="toggle-password" aria-label="显示密码" aria-pressed="false">显示</button></div><p role="status" aria-live="polite" class="auth-status"></p><button class="auth-primary" id="login-submit" type="submit">登录工作空间 <span>↗</span></button></form><p class="auth-help">需要开通账号或重置密码？请联系系统管理员 Jz。</p>${config.environment === "demo" ? '<div class="auth-divider"></div><a class="auth-demo" href="?demo=1#bookings">先浏览演示空间 →</a><p class="auth-muted auth-small">演示使用虚构数据，记录仅保存在当前浏览器。</p>' : ""}</div><small class="auth-footer">SCULP STUDIO · 仅供团队成员使用</small>`,
  );
  const form = root.querySelector("form");
  const button = root.querySelector("#login-submit");
  if (!authConfigured()) message("登录服务准备中。账户开通后即可在这里登录。");
  root.querySelector("#toggle-password").onclick = (event) => {
    const input = root.querySelector("#password");
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    event.currentTarget.textContent = visible ? "隐藏" : "显示";
    event.currentTarget.setAttribute("aria-pressed", String(visible));
    event.currentTarget.setAttribute(
      "aria-label",
      visible ? "隐藏密码" : "显示密码",
    );
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    button.disabled = true;
    message("正在验证账户…");
    try {
      supabase = await getAuthClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: accountIdentifier(form.username.value),
        password: form.password.value,
      });
      form.password.value = "";
      if (error) throw new Error("登录失败，请检查账号和密码，或稍后重试。");
      await showWorkspace();
    } catch (error) {
      message(error.message);
    } finally {
      button.disabled = false;
    }
  };
}
async function showWorkspace() {
  let profile;
  try {
    profile = await verifiedProfile(supabase);
  } catch (error) {
    await supabase.auth.signOut({ scope: "local" });
    await showLogin();
    message(error.message);
    return;
  }
  document.title = "工作台 · Sculpy";
  const personalWelcome = Boolean(profile.welcome_message?.trim());
  const heading = profile.welcome_message?.trim() || "业务工作台";
  frame(
    `<div class="auth-card auth-workspace"><header class="studio-page-header"><div><span class="auth-eyebrow">SCULP STUDIO</span><h2${personalWelcome ? ' class="studio-personal-welcome"' : ""}>${esc(heading)}</h2><p class="auth-muted">${esc(profile.display_name)} <span>·</span> ${esc(roles[profile.role] || "团队成员")}</p></div>${profile.role === "operations" ? '<div class="studio-header-actions"><button class="auth-secondary" id="manage-accounts">账户管理 <span>↗</span></button><button type="button" class="auth-secondary" id="edit-welcome" aria-expanded="false" aria-controls="welcome-editor">编辑欢迎语</button></div>' : ""}</header>${profile.role === "operations" ? '<section id="welcome-editor" aria-label="欢迎语设置" hidden></section><section id="account-list" aria-label="团队账户"></section>' : ""}<div id="cloud-workspace"></div><p role="status" aria-live="polite" class="auth-status"></p><button class="auth-secondary" id="logout">退出登录</button></div>`,
  );
  workspace?.destroy();
  welcomeEditor?.destroy();
  welcomeEditor = null;
  const layout=root.querySelector('.auth-layout');
  layout.className='studio-layout';
  const story=layout.querySelector('.auth-story');
  story.className='studio-sidebar';
  story.innerHTML=`<a class="auth-brand" href="./">Sculpy<span>SCULP STUDIO</span></a><p class="studio-sidebar-label">团队工作空间</p><nav aria-label="工作区导航">${['owner','operations'].includes(profile.role)?'<button type="button" data-studio-nav="#website-enquiries" aria-current="page">客户询盘</button><button type="button" data-studio-nav="[data-orders-section]">订单管理</button><button type="button" data-studio-nav=".comm-inbox">待整理记录</button><button type="button" data-studio-nav=".w23-dashboard">经营概览</button>':'<button type="button" data-studio-nav="[data-orders-section]" aria-current="page">我的订单</button>'}</nav><small>SCULP Studio 团队工作区<br>SCULPY V2.4.1</small>`;
  layout.querySelector('.auth-content').classList.add('studio-content');
  root.querySelectorAll('[data-studio-nav]').forEach(button=>button.onclick=()=>{root.querySelectorAll('[data-studio-nav]').forEach(b=>b.removeAttribute('aria-current'));button.setAttribute('aria-current','page');root.querySelector(button.dataset.studioNav)?.scrollIntoView({behavior:'smooth',block:'start'});});
  workspace = mountCloudWorkspace({
    root: root.querySelector("#cloud-workspace"),
    supabase,
    profile,
  });
  root.querySelector("#edit-welcome")?.addEventListener("click", event => {
    const editorRoot = root.querySelector("#welcome-editor");
    editorRoot.hidden = !editorRoot.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!editorRoot.hidden));
    if (!welcomeEditor) welcomeEditor = mountWelcomeEditor({
      root: editorRoot, supabase, profile,
      onCurrentChange(value) {
        profile.welcome_message = value;
        const title = root.querySelector(".studio-page-header h2");
        title.textContent = value.trim() || "业务工作台";
        title.classList.toggle("studio-personal-welcome", Boolean(value.trim()));
      },
    });
  });
  root.querySelector("#logout").onclick = async () => {
    if (welcomeEditor && !welcomeEditor.canLeave()) {
      message("欢迎语尚未保存或正在保存，请先保存或取消修改。");
      return;
    }
    if(workspace && !workspace.canLeave()) {
      message('操作仍在保存或尚未收到确认，请先重试同一笔操作，再退出登录。');
      return;
    }
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      message("退出失败，请检查网络后重试。");
      return;
    }
    await showLogin();
  };
  root
    .querySelector("#manage-accounts")
    ?.addEventListener("click", () => loadAccounts(profile));
  if (!subscription)
    subscription = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") void showLogin();
    }).data.subscription;
}
async function loadAccounts(profile) {
  const container = root.querySelector("#account-list");
  message("正在读取账户…");
  const { data, error } = await supabase.rpc("list_managed_accounts");
  if (error) {
    message("无法读取账户。请确认管理员权限及账户服务已部署。");
    return;
  }
  message("");
  container.innerHTML =
    `<div class="account-section-heading"><div><h3>团队账户</h3><p>管理成员访问权限与登录信息</p></div><span class="account-count">${data.length} 位成员</span></div><div class="account-table-heading"><span>成员 / 账号</span><span>角色</span><span>状态</span><span>操作</span></div>` +
    data
      .map(
        (account) =>
          `<details class="account-entry"><summary class="account-summary"><span class="account-member"><span class="account-avatar" aria-hidden="true">${esc(account.display_name?.slice(0,1)||"S")}</span><span><strong>${esc(account.display_name)}</strong><small>${esc(account.username || "尚未绑定账号")}${account.id===profile.id?" · 当前账号":""}</small></span></span><span class="account-role-badge">${esc(roles[account.role]||"团队成员")}</span><span class="account-state ${account.active?"is-active":""}">${account.active?"已启用":"已停用"}</span><span class="account-manage-label">管理 <span aria-hidden="true">⌄</span></span></summary><form class="account-form" data-id="${esc(account.id)}"><label>姓名<input name="displayName" value="${esc(account.display_name)}" required maxlength="80"></label><label>角色<select name="role" ${account.id === profile.id ? "disabled" : ""}>${Object.entries(
            roles,
          )
            .map(
              ([value, label]) =>
                `<option value="${value}" ${value === account.role ? "selected" : ""}>${esc(label)}</option>`,
            )
            .join(
              "",
            )}</select></label><p class="auth-muted">负责人可查看经营看板并编辑业务；系统管理员另可管理账号、权限和密码。</p><label class="account-active"><input type="checkbox" name="active" ${account.active ? "checked" : ""} ${account.id === profile.id ? "disabled" : ""}>账户启用${account.id === profile.id ? "（当前账户）" : ""}</label><button class="auth-secondary" type="submit">保存修改</button><p class="account-result" role="status"></p><details class="password-reset"><summary>设置新密码</summary><label>新密码<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="至少 8 位"></label><button type="button" class="auth-secondary reset-password">确认重置密码</button><p class="password-result" role="status"></p></details></form></details>`,
      )
      .join("");
  container.querySelectorAll(".account-form").forEach(
    (form) =>
      (form.onsubmit = async (event) => {
        event.preventDefault();
        const button = form.querySelector("button");
        const result = form.querySelector(".account-result");
        button.disabled = true;
        result.textContent = "正在保存…";
        try {
          const { error } = await supabase.rpc("update_managed_account", {
            p_id: form.dataset.id,
            p_display_name: form.elements.displayName.value.trim(),
            p_role: form.elements.role.value,
            p_active: form.elements.active.checked,
          });
          result.textContent = error
            ? "保存失败，请检查权限或重新登录。"
            : "已保存";
        } catch {
          result.textContent = "网络异常，请重试。";
        } finally {
          button.disabled = false;
        }
      }),
  );
  container.insertAdjacentHTML(
    "afterbegin",
    `<details class="account-create"><summary>＋ 新建账户</summary><form id="create-account"><label>账号<div class="username-prefix"><span>sculp_</span><input name="username" aria-label="账号名字" required minlength="1" maxlength="26" pattern="[a-zA-Z0-9][a-zA-Z0-9_]{0,25}" autocapitalize="none" autocomplete="off" placeholder="例如 michelle"></div></label><label>姓名<input name="displayName" required maxlength="80"></label><label>初始密码<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="至少 8 位"></label><label>角色<select name="role">${Object.entries(
      roles,
    )
      .map(
        ([value, label]) =>
          `<option value="${value}" ${value === "artist" ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join(
        "",
      )}</select></label><p class="auth-muted">负责人可查看经营看板并编辑业务；系统管理员另可管理账号、权限和密码。</p><button class="auth-primary" type="submit">创建账户</button><p role="status" class="create-result"></p></form></details>`,
  );
  container.querySelector('.account-section-heading').after(container.querySelector('.account-create'));
  const create = container.querySelector("#create-account");
  create.onsubmit = async (event) => {
    event.preventDefault();
    const button = create.querySelector("button"),
      result = create.querySelector(".create-result");
    button.disabled = true;
    result.textContent = "正在创建…";
    try {
      const data = await manageCredentials({
        action: "create",
        username: normalizeUsername(
          "sculp_" + create.elements.username.value.trim(),
        ),
        displayName: create.elements.displayName.value.trim(),
        role: create.elements.role.value,
        password: create.elements.password.value,
      });
      create.elements.password.value = "";
      if (data.ok) {
        await loadAccounts(profile);
        message("账户已创建。请将账号和设置的密码告知员工。");
      }
    } catch (error) {
      result.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  container.querySelectorAll(".reset-password").forEach(
    (button) =>
      (button.onclick = async () => {
        const form = button.closest("form"),
          input = form.elements.newPassword,
          result = form.querySelector(".password-result");
        if (input.value.length < 8 || input.value.length > 128) {
          result.textContent = "密码需为 8–128 位。";
          return;
        }
        button.disabled = true;
        result.textContent = "正在重置…";
        try {
          const data = await manageCredentials({
            action: "reset-password",
            id: form.dataset.id,
            password: input.value,
          });
          input.value = "";
          result.textContent =
            data.warning || "密码已重置，今后请使用新密码登录。";
        } catch (error) {
          result.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      }),
  );
}
async function manageCredentials(body) {
  const { data, error } = await supabase.functions.invoke("account-admin", {
    body,
  });
  if (error) {
    let detail;
    try {
      detail = await error.context?.json();
    } catch {}
    throw new Error(
      detail?.error || "操作失败，请确认账户服务已部署且你具有管理员权限。",
    );
  }
  if (!data?.ok) throw new Error(data?.error || "操作未完成，请重试。");
  return data;
}
await showLogin();
if (authConfigured()) {
  try {
    supabase = await getAuthClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) await showWorkspace();
  } catch {
    message("登录服务暂时不可用，请稍后重试。");
  }
}

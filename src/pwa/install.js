export function setupWebApp({demo}) {
  let deferredPrompt = null, installed = false, opener = null, scheduled = false;
  const displayMode = matchMedia('(display-mode: standalone)');
  const standalone = () => installed || displayMode.matches || navigator.standalone === true;
  const english = () => window.DemoI18n?.language === 'en' || new URLSearchParams(location.search).get('lang') === 'en';
  const text = (zh,en) => english() ? en : zh;
  const host = document.createElement('div');
  host.id = 'pwa-install-host';
  host.dataset.i18nIgnore = '';
  host.innerHTML = `<dialog class="pwa-install-dialog" aria-labelledby="pwa-install-title"><button type="button" class="pwa-close" data-pwa-close aria-label="关闭安装说明">✕</button><img class="pwa-icon" src="assets/sculpy-icon-192.png" alt="Sculpy"><h2 id="pwa-install-title"></h2><p data-pwa-intro></p><ol data-pwa-steps></ol><p class="pwa-install-note" data-pwa-note></p><div class="pwa-install-actions"><button type="button" class="primary" data-pwa-confirm hidden></button><button type="button" data-pwa-close>知道了</button></div><p role="status" aria-live="polite" data-pwa-status></p></dialog>`;
  document.body.append(host);
  const dialog = host.querySelector('dialog');
  const $ = selector => host.querySelector(selector);
  function guide() {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const embedded = /MicroMessenger|FBAN|FBAV|Instagram|Line\//i.test(ua);
    let steps;
    if (embedded) steps = [text('先点右上角菜单，选择用 Safari 或系统浏览器打开。','Open the browser menu and choose Safari or your system browser.'),text('在系统浏览器中，再点「添加到桌面」查看安装方式。','Then select Add to home screen here for installation instructions.')];
    else if (ios) steps = [text('点浏览器的「分享」按钮。','Tap the browser Share button.'),text('选择「添加到主屏幕」。','Choose Add to Home Screen.'),text('如有「作为网页 App 打开」，请开启，再点「添加」。','Enable Open as Web App if shown, then tap Add.')];
    else if (/Android/i.test(ua)) steps = [text('点下方「安装 Sculpy」；没有按钮时，打开浏览器右上角菜单。','Choose Install Sculpy below, or open the browser menu.'),text('选择「安装应用」或「添加到主屏幕」，按提示确认。','Choose Install app or Add to Home screen and confirm.')];
    else if (/Mac/.test(navigator.platform) && /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) steps = [text('打开 Safari 的「文件」菜单。','Open the Safari File menu.'),text('选择「添加到程序坞」，确认名称后添加。','Choose Add to Dock and confirm the name.')];
    else steps = [text('在 Chrome 或 Edge 中，点地址栏右侧的安装图标。','In Chrome or Edge, select the install icon at the right of the address bar.'),text('也可以打开浏览器菜单，选择「安装应用」或「将此页面安装为应用」。','Alternatively, choose Install app or Install this page as an app from the browser menu.')];
    $('#pwa-install-title').textContent = text('把 Sculpy 放到桌面','Add Sculpy to your desktop');
    $('[data-pwa-intro]').textContent = demo ? text('当前安装的是演示空间，点图标仍会打开演示订单。','This installs the demo workspace. Its icon will reopen the fictional bookings.') : text('从桌面图标一键打开团队工作空间。','Open your team workspace directly from its app icon.');
    $('[data-pwa-steps]').replaceChildren(...steps.map(step => {const li=document.createElement('li');li.textContent=step;return li;}));
    $('[data-pwa-note]').textContent = demo ? text('需要联网使用。桌面应用可能使用独立存储，现有演示记录和图片不会自动迁移。','An internet connection is required. The installed app may have separate storage; existing demo records and photos do not transfer automatically.') : text('需要联网使用。安装不会改变账户权限。','An internet connection is required. Installation does not change account permissions.');
    $('[data-pwa-confirm]').textContent = text('安装 Sculpy','Install Sculpy');
    $('.pwa-install-actions [data-pwa-close]').textContent = text('知道了','Got it');
    $('.pwa-close').setAttribute('aria-label',text('关闭安装说明','Close installation instructions'));
    $('[data-pwa-confirm]').hidden = !deferredPrompt || embedded || ios;
    $('[data-pwa-status]').textContent = '';
  }
  function mountEntries() {
    const active = standalone();
    for (const target of [document.querySelector('.sidebar-end'), document.querySelector('.auth-content')].filter(Boolean)) {
      let entry = target.querySelector('[data-pwa-open]');
      if (!entry) {
        entry = document.createElement('button');entry.type='button';entry.dataset.pwaOpen='';entry.className='pwa-install-link';
        target.prepend(entry);
      }
      entry.hidden = active;
      const label = text('添加到桌面','Add to home screen');
      if (entry.textContent !== label) entry.textContent = label;
    }
    const settings = document.querySelector('#main[data-page="settings"]');
    if (settings && !settings.querySelector('[data-pwa-card]') && !active) {
      const card=document.createElement('section');card.className='panel pwa-settings-card';card.dataset.pwaCard='';
      const title=document.createElement('h2');title.textContent=text('桌面应用','Desktop app');
      const description=document.createElement('p');description.textContent=text('把 Sculpy 放到手机或电脑桌面，用独立窗口打开。','Add Sculpy to your phone or computer and open it in its own window.');
      const button=document.createElement('button');button.type='button';button.className='primary';button.dataset.pwaOpen='';button.textContent=text('添加到桌面','Add to home screen');
      card.append(title,description,button);settings.append(card);
    }
    if (active) document.querySelector('[data-pwa-card]')?.remove();
  }
  const observer = new MutationObserver(() => {
    if (scheduled) return;scheduled=true;
    requestAnimationFrame(() => {scheduled=false;mountEntries();});
  });
  observer.observe(document.body,{childList:true,subtree:true});
  mountEntries();
  document.addEventListener('click',event => {
    if (event.target.closest('[data-pwa-open]') && !standalone()) {
      opener=document.activeElement;guide();if(!dialog.open)dialog.showModal();
    }
    if (event.target.closest('[data-pwa-close]')) dialog.close();
  });
  dialog.addEventListener('click',event => {if (event.target===dialog) dialog.close();});
  dialog.addEventListener('close',() => {if (opener?.isConnected)opener.focus();});
  $('[data-pwa-confirm]').onclick = async () => {
    if (!deferredPrompt) return;
    const prompt=deferredPrompt;deferredPrompt=null;
    const button=$('[data-pwa-confirm]');button.disabled=true;
    try {
      await prompt.prompt();const choice=await prompt.userChoice;
      $('[data-pwa-status]').textContent = choice.outcome==='accepted' ? text('已提交安装，请在桌面查看 Sculpy 图标。','Installation requested. Look for Sculpy on your desktop.') : text('已取消安装，仍可继续使用网页版。','Installation cancelled. You can continue using the website.');
    } catch {$('[data-pwa-status]').textContent=text('浏览器未能打开安装窗口，请按上方步骤从菜单添加。','Unable to open installation. Follow the browser menu instructions above.');}
    finally {button.disabled=false;button.hidden=true;}
  };
  window.addEventListener('beforeinstallprompt',event => {event.preventDefault();deferredPrompt=event;if(dialog.open)guide();});
  window.addEventListener('appinstalled',() => {installed=true;deferredPrompt=null;dialog.close();mountEntries();});
  displayMode.addEventListener('change',() => {if(standalone())dialog.close();mountEntries();});
  window.addEventListener('demo-language-change',()=>{mountEntries();if(dialog.open)guide();});
  if ('serviceWorker' in navigator && isSecureContext) {
    const register = () => navigator.serviceWorker.register(new URL('../../sw.js',import.meta.url),{updateViaCache:'none'}).catch(()=>{});
    if (document.readyState==='complete') void register();
    else window.addEventListener('load',register,{once:true});
  }
}

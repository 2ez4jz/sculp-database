/* Presentation-only bilingual adapter for the existing demos.
 * Catalog translations never mutate records, identifiers, option values or drafts.
 */
(() => {
  'use strict';
  if (document.currentScript?.hasAttribute('data-demo-only') && new URLSearchParams(location.search).get('demo') !== '1') {
    document.documentElement.lang = 'zh-CN';
    return;
  }
  const catalog = window.DEMO_TRANSLATIONS || {};
  const native = window.DEMO_NATIVE_TRANSLATIONS || {};
  const key = 'memora-demo-language';
  const query = new URLSearchParams(location.search).get('lang');
  let language = query === 'zh' || query === 'en' ? query : 'en';
  if (!query) { try { language = localStorage.getItem(key) === 'zh' ? 'zh' : 'en'; } catch {} }
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = Object.keys(catalog).filter(Boolean).sort((a,b) => b.length-a.length);
  const pattern = new RegExp(keys.map(escape).join('|'), 'g');
  const nativeKeys = Object.keys(native).filter(k => k.length < 65).sort((a,b) => b.length-a.length);
  const nativePattern = new RegExp('(?<![A-Za-z])(?:'+nativeKeys.map(escape).join('|')+')(?![A-Za-z])','g');
  function text(value, lang = language) {
    const source = String(value ?? '');
    if (lang === 'zh') return native[source.trim()] ? source.replace(source.trim(), native[source.trim()]) : source.replace(nativePattern, match=>native[match]);
    if (catalog[source]) return catalog[source];
    return source.replace(pattern, match => catalog[match]);
  }
  const sources = new WeakMap();
  const attributes = new WeakMap();
  const skipped = 'script,style,textarea,[data-i18n-ignore],.chat-user div,.chat-assistant .chat-answer,.message.user';
  const observer = new MutationObserver(records => {
    observer.disconnect();
    const roots = new Set();
    for (const record of records) {
      if (record.type === 'characterData') roots.add(record.target);
      else if (record.type === 'attributes') roots.add(record.target);
      else for (const node of record.addedNodes) roots.add(node);
    }
    for (const node of roots) localize(node);
    mount();
    observe();
  });
  function localize(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || node.parentElement.closest(skipped)) return;
      const previous = sources.get(node);
      const source = previous && node.data === previous.output ? previous.source : node.data;
      // Preserve implicit option values before changing visible option labels.
      if (node.parentElement.tagName === 'OPTION' && !node.parentElement.hasAttribute('value')) node.parentElement.value = node.parentElement.value;
      const output = text(source);
      sources.set(node, {source, output});
      if (node.data !== output) node.data = output;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.matches('script,style,[data-i18n-ignore],.chat-user div,.chat-assistant .chat-answer,.message.user')) return;
      const saved = attributes.get(node) || {};
      for (const attribute of ['placeholder','aria-label','title','alt']) {
        if (!node.hasAttribute(attribute)) continue;
        const current = node.getAttribute(attribute), previous = saved[attribute];
        const source = previous && current === previous.output ? previous.source : current;
        const output = text(source);
        saved[attribute] = {source, output};
        if (current !== output) node.setAttribute(attribute, output);
      }
      attributes.set(node, saved);
      if (node.tagName === 'TEXTAREA') return;
    }
    for (const child of node.childNodes) localize(child);
  }
  function observe() {
    observer.observe(document.documentElement, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['placeholder','aria-label','title','alt','open']});
  }
  let control;
  function mount() {
    if (!document.body) return;
    if (!control) {
      control = document.createElement('div');
      control.className = 'demo-language-switch';
      control.dataset.i18nIgnore = '';
      control.setAttribute('role','group');
      control.setAttribute('aria-label','Language / 语言');
      for (const [lang, label] of [['en','English'],['zh','中文']]) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label; button.lang = lang === 'zh' ? 'zh-CN' : 'en';
        button.dataset.language = lang;
        button.addEventListener('click', () => setLanguage(lang));
        control.append(button);
      }
      const style = document.createElement('style');
      style.textContent = '.demo-language-switch{display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid #cad5d0;border-radius:9px;background:#fff;flex-shrink:0;z-index:20}.demo-language-switch button{font:600 12px/1.3 system-ui,sans-serif;border:0;border-radius:6px;padding:7px 9px;cursor:pointer;background:transparent;color:#486057;white-space:nowrap}.demo-language-switch button[aria-pressed="true"]{background:#203d36;color:white}.demo-language-switch button:focus-visible{outline:2px solid #328b71;outline-offset:2px}.demo-language-switch.in-dialog{display:flex;width:max-content;margin:12px 12px 0 auto}.demo-language-switch.floating{position:fixed;top:14px;right:18px}.topbar{height:auto!important;min-height:72px;flex-wrap:wrap;padding-top:12px!important;padding-bottom:12px!important;gap:12px!important}.top-actions{flex-wrap:wrap!important}.topbar small{max-width:100%}html[lang="en"] .kv{grid-template-columns:minmax(130px,.5fr) 1fr}html[lang="en"] .stats{grid-template-columns:repeat(auto-fit,minmax(145px,1fr))}html[lang="en"] .chat-header p{max-width:60vw}@media(max-width:800px){.shell{grid-template-columns:minmax(0,1fr)!important}.shell>.sidebar{min-width:0}.shell>.sidebar nav{min-width:0;overflow-x:auto}.shell .grid>.panel{min-width:0}}@media(max-width:600px){.demo-language-switch.in-dialog{display:flex;width:max-content;margin:12px 12px 0 auto}.demo-language-switch.floating{top:8px;right:8px}.demo-language-switch button{padding:6px 7px}.topbar{align-items:flex-start!important}.top-actions{gap:7px!important}html[lang="en"] h1{overflow-wrap:break-word}}';
      document.head.append(style);
    }
    const host = document.querySelector('.top-actions') || document.querySelector('.topbar');
    const modal = document.querySelector('dialog[open]:not(.chat-inline dialog)');
    const target = modal || host || document.body;
    if (control.parentElement !== target) { if (modal) target.prepend(control); else target.append(control); }
    control.classList.toggle('floating', !host && !modal);
    control.classList.toggle('in-dialog', Boolean(modal));
    for (const button of control.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.language === language));
  }
  function apply() {
    observer.disconnect();
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    localize(document.documentElement);
    mount();
    observe();
  }
  function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'zh') return;
    language = lang;
    try { localStorage.setItem(key, lang); } catch {}
    apply();
    window.dispatchEvent(new CustomEvent('demo-language-change', {detail:{language:lang}}));
  }
  window.DemoI18n = {text,apply,setLanguage,get language(){return language},get locale(){return language==='zh'?'zh-CN':'en-CA'}};
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',apply,{once:true}); else apply();
})();

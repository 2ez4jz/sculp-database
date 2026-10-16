import {getAttachment, storeAttachments, removeAttachments, removeAttachment} from '../../services/attachments.js?v=orders-album-20261016';
import {saveState} from '../../services/storage.js';

// Demo originals live in IndexedDB; only their metadata is kept in localStorage.
export function mountArtistAlbum({root, artistId, artistName, getContext, getState, setState, esc}) {
  let disposed = false, busy = false, revision = 0;
  const urls = new Set();
  const allowed = () => {
    const context = getContext();
    return !disposed && (context.role === 'admin' || (context.role === 'artist' && context.artistId === artistId));
  };
  const photos = () => (getState().artistPhotos || []).filter(photo => photo.artistId === artistId);
  root.innerHTML = `<div class="section-head"><h2>个人作品图库</h2><span data-album-count></span></div>
    <div class="artist-photo-drop" data-album-drop>
      <strong>把作品图片拖到这里</strong><p>支持多张拖入，也可以点击选择图片。</p>
      <button type="button" class="primary" data-album-choose>选择图片</button>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-album-files>
      <small>JPG、PNG、WebP · 每张最多 10 MB · 每次最多 20 张</small>
    </div><p class="small muted">演示图库仅保存在当前浏览器，刷新后保留；不会同步到其他设备。</p>
    <p data-album-status role="status" aria-live="polite"></p><div class="artist-photo-grid" data-album-gallery></div>
    <dialog data-album-preview><button type="button" data-album-close aria-label="关闭作品预览">关闭</button><img alt=""><p></p></dialog>`;
  const $ = selector => root.querySelector(selector);
  const status = message => {if (!disposed) $('[data-album-status]').textContent = message;};
  function revokeUrls() {for (const url of urls) URL.revokeObjectURL(url);urls.clear();}
  function controls() {
    if (disposed) return;
    root.querySelectorAll('button,input').forEach(button => {button.disabled = busy || !allowed();});
    $('[data-album-drop]').setAttribute('aria-busy', String(busy));
  }
  async function refresh() {
    if (!allowed()) return;
    const current = ++revision;
    revokeUrls();
    const list = photos();
    $('[data-album-count]').textContent = `${list.length} 张作品`;
    const gallery = $('[data-album-gallery]');
    gallery.innerHTML = list.length ? '' : '<p class="small muted">还没有上传作品。拖入第一张图片，存入这位化妆师的个人图库。</p>';
    for (const photo of list) {
      try {
        const record = await getAttachment(photo.id);
        if (!allowed() || current !== revision) return;
        const card = document.createElement('article');
        card.className = 'artist-photo-card';
        if (record?.blob) {
          const url = URL.createObjectURL(record.blob);urls.add(url);
          card.innerHTML = `<button type="button" class="photo-button" data-album-view><img loading="lazy" src="${url}" alt="${esc(photo.name)}"></button><div class="artist-photo-caption"><span>${esc(photo.name)}</span><a href="${url}" download="${esc(photo.name)}">下载原图</a><button type="button" data-album-remove="${esc(photo.id)}">移除</button></div>`;
          card.querySelector('[data-album-view]').onclick = () => {
            if (!allowed()) return;
            const preview = $('[data-album-preview]');
            preview.querySelector('img').src = url;
            preview.querySelector('img').alt = photo.name;
            preview.querySelector('p').textContent = `${artistName} · ${photo.name}`;
            preview.showModal();
          };
        } else {
          card.innerHTML = `<p>原图不可用：${esc(photo.name)}</p><button type="button" data-album-remove="${esc(photo.id)}">移除</button>`;
        }
        gallery.append(card);
      } catch {
        if (allowed() && current === revision) status('本地图片读取失败，请检查浏览器存储设置后刷新重试。');
      }
    }
    controls();
  }
  async function addFiles(fileList) {
    if (busy || !allowed()) return;
    const files = [...fileList];
    if (!files.length) return;
    if (files.length > 20) return status('每次最多选择 20 张图片，请分批上传。');
    if (files.some(file => !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10_000_000 || !file.size))
      return status('请选择有效的 JPG、PNG 或 WebP 图片，每张不超过 10 MB。本次尚未保存。');
    if (files.reduce((sum,file) => sum + file.size,0) > 100_000_000) return status('本次图片总大小不能超过 100 MB，请分批上传。');
    busy = true;controls();status('正在保存作品原图…');
    const batchId = `artist-photo-${crypto.randomUUID()}`;
    let archived = false, committed = false;
    try {
      // Check actual image bytes before archiving a file with an image MIME label.
      for (const file of files) {
        const url = URL.createObjectURL(file);
        try {const image = new Image();image.src = url;await image.decode();}
        catch {throw Error(`无法读取图片：${file.name}。本次尚未保存。`);}
        finally {URL.revokeObjectURL(url);}
      }
      if (!allowed()) return;
      const stored = await storeAttachments(batchId, files.map(file => ({file,capturedAt:new Date().toISOString()})));
      archived = true;
      if (!allowed()) {await removeAttachments(batchId);return;}
      const latest = getState();
      const next = {...latest,artistPhotos:[...(latest.artistPhotos || []),...stored.map(photo => ({...photo,artistId}))]};
      if (!saveState(next)) throw Error('图片信息保存失败，请释放浏览器存储空间后重试。');
      setState(next);
      committed = true;
      await refresh();
      status(`已保存 ${stored.length} 张作品到 ${artistName} 的个人图库，刷新后仍可查看。`);
    } catch(error) {
      if (archived && !committed) await removeAttachments(batchId).catch(()=>{});
      status(error.message || '保存失败，请释放浏览器存储空间后重试。');
    } finally {busy = false;controls();}
  }
  $('[data-album-choose]').onclick = () => {if (allowed()) $('[data-album-files]').click();};
  $('[data-album-files]').onchange = event => {void addFiles(event.target.files);event.target.value = '';};
  const drop = $('[data-album-drop]');
  drop.ondragover = event => {
    if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
    event.preventDefault();event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
    if (!busy && allowed()) drop.classList.add('dragging');
  };
  drop.ondragleave = event => {if (!drop.contains(event.relatedTarget)) drop.classList.remove('dragging');};
  drop.ondrop = event => {event.preventDefault();drop.classList.remove('dragging');void addFiles(event.dataTransfer?.files || []);};
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-album-remove]');
    if (!button || busy || !allowed()) return;
    const photo = photos().find(item => item.id === button.dataset.albumRemove);
    if (!photo || !confirm('从个人图库移除这张作品？')) return;
    const latest = getState(), next = {...latest,artistPhotos:(latest.artistPhotos || []).filter(item => item.id !== photo.id)};
    if (!saveState(next)) return status('移除失败，请重试。');
    setState(next);busy = true;controls();
    try {await removeAttachment(photo.id);await refresh();status('作品已移除。');}
    catch {await refresh();status('作品已移除，浏览器中的原图清理失败。');}
    finally {busy = false;controls();}
  });
  $('[data-album-close]').onclick = () => $('[data-album-preview]').close();
  $('[data-album-preview]').onclick = event => {if (event.target === $('[data-album-preview]')) event.target.close();};
  void refresh();
  return {destroy(){disposed = true;revision++;$('[data-album-preview]').close();revokeUrls();}};
}

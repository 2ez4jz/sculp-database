// Demo-only local binary archive. IndexedDB holds bytes; localStorage holds textual memory.
const DB = "sculp-demo-input-attachments-v1";
export function openAttachmentStore() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(Error("此浏览器不支持本地图片归档。"));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
export async function storeAttachments(batchId, files) {
  if (!files.length) return [];
  const db = await openAttachmentStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      const records = files.map(({file, capturedAt}, index) => ({
        id: `${batchId}:${index}`, batchId, name:file.name,
        type:file.type, size:file.size, capturedAt, blob:file
      }));
      tx.oncomplete = () => resolve(records.map(({blob,...meta}) => meta));
      tx.onerror = () => reject(tx.error || Error("图片归档失败"));
      tx.onabort = () => reject(tx.error || Error("图片归档取消"));
      for (const record of records) tx.objectStore("images").put(record);
    });
  } finally { db.close(); }
}
export async function removeAttachments(batchId) {
  const db = await openAttachmentStore();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      const store = tx.objectStore("images");
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) { if (c.value.batchId === batchId) c.delete(); c.continue(); }
      };
    });
  } finally { db.close(); }
}
export async function getAttachment(id) {
  const db = await openAttachmentStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("images", "readonly");
      const r = tx.objectStore("images").get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}

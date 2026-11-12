// Installation is manual through the browser menu on every device.
// Keep the manifest/icon/offline integration without injecting buttons or dialogs.
export function setupWebApp() {
  window.addEventListener('beforeinstallprompt', event => event.preventDefault());
  if ('serviceWorker' in navigator && isSecureContext) {
    const register = () => navigator.serviceWorker.register(new URL('../../sw.js',import.meta.url),{updateViaCache:'none'}).catch(()=>{});
    if (document.readyState==='complete') void register();
    else window.addEventListener('load',register,{once:true});
  }
}

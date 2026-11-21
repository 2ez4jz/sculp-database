import {setupWebApp} from './pwa/install.js?v=manual-install-20261102';

const url = new URL(location.href);
if (url.searchParams.has('demo')) {
  url.searchParams.delete('demo');
  url.searchParams.delete('agent');
  url.hash = '';
  history.replaceState(history.state, '', url);
}
setupWebApp();
await import('./pages/login/index.js?v=team-20261121');

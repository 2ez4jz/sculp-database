// Select a stable entry before installation metadata is read. Demo installation
// must never silently become a production login (or vice versa).
if (new URLSearchParams(location.search).get('demo') === '1') {
  document.querySelector('link[rel="manifest"]').href = 'manifest-demo.webmanifest';
  document.querySelector('meta[name="apple-mobile-web-app-title"]').content = 'Sculpy Demo';
}

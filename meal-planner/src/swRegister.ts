// Registers the service worker (production builds only) and tells the app
// when a new version is ready.

type Listener = (apply: () => void) => void;
let listener: Listener | null = null;
let pending: (() => void) | null = null;

export function onUpdateReady(cb: Listener) {
  listener = cb;
  if (pending) cb(pending);
}

let updateRequested = false;

function announce(worker: ServiceWorker) {
  const apply = () => {
    updateRequested = true;
    worker.postMessage('skipWaiting');
  };
  pending = apply;
  listener?.(apply);
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  let reloading = false;
  // Reload only when you asked for the update. On the first visit the
  // service worker also takes control, and no reload is needed then.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !updateRequested) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (e) {
      console.warn('Service worker registration failed', e);
    }
  });
}

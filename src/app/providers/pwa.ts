import { APP_NAME } from './../../app-identity';
export function registerPwa() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const register = () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        const warmLoadedAssets = () => {
          const urls = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((url) => /\.(js|css)(?:\?|$)/.test(url));
          // Cache only resources that this browser already requested, including lazy chunks.
          registration.active?.postMessage({ type: 'CACHE_LOADED_ASSETS', urls });
        };
        warmLoadedAssets();
        if ('PerformanceObserver' in window) {
          const observer = new PerformanceObserver(warmLoadedAssets);
          observer.observe({ type: 'resource', buffered: true });
          window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
        }
      })
      .catch((error) =>
        console.warn(`${APP_NAME} could not register its offline app shell.`, error),
      );
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

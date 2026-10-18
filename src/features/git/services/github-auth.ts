import type { GitAuthentication } from './git-credentials';

export function githubServiceUrl() {
  const configured = String(import.meta.env.VITE_GITHUB_SERVICE_URL || '').trim();
  if (!configured) return '';
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('The GitHub service must use a public HTTPS URL.');
  return url.href.replace(/\/$/, '');
}

/** Credentials remain in memory until the repository settings are explicitly saved. */
export function authorizeGitHub(signal: AbortSignal): Promise<GitAuthentication> {
  const service = githubServiceUrl();
  if (!service) throw new Error('GitHub sign-in is not configured for this deployment.');
  const state = crypto.randomUUID();
  const url = new URL(`${service}/auth/start`);
  url.searchParams.set('state', state);
  const popup = window.open(url, 'laplace-github', 'popup,width=640,height=760');
  if (!popup) throw new Error('Allow popups to connect to GitHub.');
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setInterval>;
    const finish = (error?: Error, result?: GitAuthentication) => {
      clearInterval(timer);
      window.removeEventListener('message', receive);
      signal.removeEventListener('abort', cancel);
      popup.close();
      if (error) reject(error);
      else resolve(result!);
    };
    const cancel = () => finish(new DOMException('GitHub sign-in cancelled.', 'AbortError'));
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== new URL(service).origin ||
        event.source !== popup ||
        event.data?.type !== 'laplace-github-auth' ||
        event.data.state !== state
      )
        return;
      if (typeof event.data.token === 'string' && event.data.token)
        finish(undefined, { username: 'x-access-token', token: event.data.token });
      else finish(new Error('GitHub authorization was denied or expired. Try again.'));
    };
    window.addEventListener('message', receive);
    signal.addEventListener('abort', cancel, { once: true });
    const deadline = Date.now() + 10 * 60_000;
    timer = setInterval(() => {
      if (popup.closed || Date.now() > deadline) cancel();
    }, 500);
    if (signal.aborted) cancel();
  });
}

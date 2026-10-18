import { githubServiceUrl } from './github-auth';

export function localGitProxy(
  repository: string,
  origin = typeof globalThis.location === 'undefined' ? '' : globalThis.location.origin,
  development = import.meta.env.DEV,
) {
  if (!development || !origin) return '';
  try {
    const remote = new URL(repository);
    const app = new URL(origin);
    if (
      remote.protocol === 'https:' &&
      remote.hostname === 'github.com' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname)
    )
      return `${app.origin}/api/git-proxy`;
  } catch {
    // URL validation is handled by the Git client.
  }
  return '';
}

export function connectionProxy(repository: string, configuredProxy: string) {
  if (configuredProxy.trim()) return configuredProxy.trim().replace(/\/+$/, '');
  const local = localGitProxy(repository);
  if (local) return local;
  const service = githubServiceUrl();
  if (service && new URL(repository).hostname === 'github.com') return `${service}/git-proxy`;
  if (typeof globalThis.location !== 'undefined' && new URL(repository).hostname === 'github.com')
    throw new Error(
      'GitHub requires a CORS proxy in the browser. Enter a trusted proxy URL in Repository settings.',
    );
  return '';
}

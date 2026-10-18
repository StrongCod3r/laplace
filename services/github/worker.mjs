// Deploy separately from the static SPA. Secrets never belong in VITE_* variables.
const encoder = new TextEncoder();
const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const cookieName = '__Host-laplace-github';

async function signature(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function reply(data, status = 200, headers = {}) {
  return new Response(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function popupResult(appOrigin, state, token) {
  const message = JSON.stringify({
    type: 'laplace-github-auth',
    state,
    ...(token ? { token } : {}),
  }).replaceAll('<', '\\u003c');
  const nonce = random();
  return reply(
    `<!doctype html><meta charset="utf-8"><title>GitHub authorization</title>
<p>Authorization finished. You can close this window.</p><script nonce="${nonce}">
window.opener?.postMessage(${message}, ${JSON.stringify(appOrigin)}); window.close();</script>`,
    200,
    {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`,
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  );
}

export async function handleRequest(request, env, upstream = fetch) {
  if (!env.APP_ORIGIN || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET)
    return reply('The GitHub service is not configured.', 503);
  const appOrigin = new URL(env.APP_ORIGIN).origin;
  const url = new URL(request.url);
  const callback = `${url.origin}/auth/callback`;
  if (url.pathname === '/auth/start' && request.method === 'GET') {
    const state = url.searchParams.get('state');
    if (!state || !/^[a-zA-Z0-9-]{16,128}$/.test(state)) return reply('Invalid state.', 400);
    const session = { state, nonce: random(), verifier: random(), expires: Date.now() + 600_000 };
    const payload = base64url(encoder.encode(JSON.stringify(session)));
    const signed = `${payload}.${await signature(payload, env.SESSION_SECRET)}`;
    const target = new URL('https://github.com/login/oauth/authorize');
    target.search = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: callback,
      scope: 'repo',
      state: session.nonce,
      code_challenge_method: 'S256',
      code_challenge: base64url(
        await crypto.subtle.digest('SHA-256', encoder.encode(session.verifier)),
      ),
    }).toString();
    return reply(null, 302, {
      Location: target.href,
      'Set-Cookie': `${cookieName}=${signed}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'Referrer-Policy': 'no-referrer',
    });
  }
  if (url.pathname === '/auth/callback' && request.method === 'GET') {
    const cookie = request.headers
      .get('Cookie')
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    try {
      const [payload, mac] = (cookie || '').split('.');
      if (!payload || mac !== (await signature(payload, env.SESSION_SECRET)))
        return reply('Invalid authorization session. Start again from Laplace.', 400);
      const session = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')));
      if (session.expires < Date.now() || url.searchParams.get('state') !== session.nonce)
        return reply('Expired or invalid authorization state. Start again from Laplace.', 400);
      const code = url.searchParams.get('code');
      if (!code || url.searchParams.has('error')) return popupResult(appOrigin, session.state);
      const response = await upstream('https://github.com/login/oauth/access_token', {
        signal: AbortSignal.timeout(15_000),
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: callback,
          code_verifier: session.verifier,
        }),
      });
      const result = await response.json();
      return popupResult(
        appOrigin,
        session.state,
        response.ok && typeof result.access_token === 'string' ? result.access_token : undefined,
      );
    } catch {
      return reply('GitHub authorization failed. Start again from Laplace.', 502);
    }
  }
  if (url.pathname.startsWith('/git-proxy/')) {
    const cors = {
      'Access-Control-Allow-Origin': appOrigin,
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Git-Protocol',
      'Access-Control-Expose-Headers': 'Content-Type',
    };
    if (request.headers.get('Origin') !== appOrigin) return reply('Origin denied.', 403);
    const target = url.pathname.slice('/git-proxy/'.length) + url.search;
    const match =
      /^github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/(info\/refs\?service=git-(?:upload|receive)-pack|git-(?:upload|receive)-pack)$/.exec(
        target,
      );
    if (!match || ['.', '..'].includes(match[2])) return reply('Invalid Git endpoint.', 400, cors);
    if (request.method === 'OPTIONS') return reply(null, 204, cors);
    const discovery = match[3].startsWith('info/refs');
    if (request.method !== (discovery ? 'GET' : 'POST')) return reply('Method denied.', 405, cors);
    const service = match[3].includes('receive-pack') ? 'receive-pack' : 'upload-pack';
    if (
      !discovery &&
      request.headers.get('Content-Type') !== `application/x-git-${service}-request`
    )
      return reply('Invalid Git content type.', 400, cors);
    const headers = new Headers({ 'User-Agent': 'Laplace-Git', Accept: '*/*' });
    for (const name of ['Authorization', 'Content-Type', 'Git-Protocol']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      const response = await upstream(`https://${target}`, {
        method: request.method,
        headers,
        body: discovery ? undefined : request.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status >= 300 && response.status < 400)
        return reply('Use the canonical GitHub repository URL.', 502, cors);
      return reply(response.body, response.status, {
        ...cors,
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      });
    } catch {
      return reply('Unable to reach GitHub.', 502, cors);
    }
  }
  return reply('Not found.', 404);
}

export default { fetch: (request, env) => handleRequest(request, env) };

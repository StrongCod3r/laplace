import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleRequest } from '../../services/github/worker.mjs';

const env = {
  APP_ORIGIN: 'https://notes.example',
  GITHUB_CLIENT_ID: 'client',
  GITHUB_CLIENT_SECRET: 'server-secret',
  SESSION_SECRET: 'a-long-session-secret-for-tests',
};
const base = 'https://github-service.example';

async function start() {
  const response = await handleRequest(
    new Request(`${base}/auth/start?state=client-state-123456789`),
    env,
  );
  assert.equal(response.status, 302);
  const target = new URL(response.headers.get('Location'));
  assert.equal(target.origin, 'https://github.com');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(target.searchParams.get('redirect_uri'), `${base}/auth/callback`);
  assert.ok(!target.href.includes(env.GITHUB_CLIENT_SECRET));
  const cookie = response.headers.get('Set-Cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  return { cookie: cookie.split(';')[0], target };
}

test('OAuth uses a signed browser session, PKCE, and a fixed popup destination', async () => {
  const { cookie, target } = await start();
  let exchanges = 0;
  const result = await handleRequest(
    new Request(`${base}/auth/callback?code=code&state=${target.searchParams.get('state')}`, {
      headers: { Cookie: cookie },
    }),
    env,
    async (url, options) => {
      exchanges++;
      assert.equal(url, 'https://github.com/login/oauth/access_token');
      const body = JSON.parse(options.body);
      assert.equal(body.client_secret, env.GITHUB_CLIENT_SECRET);
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(body.code_verifier),
      );
      assert.equal(
        Buffer.from(digest).toString('base64url'),
        target.searchParams.get('code_challenge'),
      );
      return Response.json({ access_token: 'oauth-test-credential' });
    },
  );
  assert.equal(exchanges, 1);
  const html = await result.text();
  assert.match(html, /oauth-test-credential/);
  assert.match(html, /client-state-123456789/);
  assert.match(html, /https:\/\/notes.example/);
  assert.ok(!html.includes(env.GITHUB_CLIENT_SECRET));
  assert.match(result.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.match(result.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});

test('OAuth rejects missing cookies, tampering, and wrong state before token exchange', async () => {
  const { cookie } = await start();
  for (const value of ['', cookie, `${cookie}tampered`]) {
    const response = await handleRequest(
      new Request(`${base}/auth/callback?code=code&state=wrong`, { headers: { Cookie: value } }),
      env,
      () => {
        throw new Error('Must not exchange');
      },
    );
    assert.equal(response.status, 400);
  }
});

test('denied OAuth returns a credential-free failure to the original popup state', async () => {
  const { cookie, target } = await start();
  const response = await handleRequest(
    new Request(
      `${base}/auth/callback?error=access_denied&state=${target.searchParams.get('state')}`,
      { headers: { Cookie: cookie } },
    ),
    env,
  );
  const html = await response.text();
  assert.match(html, /client-state-123456789/);
  assert.ok(!html.includes('"token"'));
});

test('Git proxy rejects arbitrary hosts, paths, methods, and cross-origin requests', async () => {
  for (const [path, method, origin, status] of [
    ['/git-proxy/evil.example/a/b/git-upload-pack', 'POST', env.APP_ORIGIN, 400],
    ['/git-proxy/github.com/a/b/issues', 'GET', env.APP_ORIGIN, 400],
    ['/git-proxy/github.com/a/b/git-upload-pack', 'GET', env.APP_ORIGIN, 405],
    [
      '/git-proxy/github.com/a/b/info/refs?service=git-upload-pack',
      'GET',
      'https://evil.example',
      403,
    ],
  ]) {
    const response = await handleRequest(
      new Request(base + path, { method, headers: { Origin: origin } }),
      env,
      () => {
        throw new Error('Must not forward');
      },
    );
    assert.equal(response.status, status);
  }
});

test('Git proxy supports preflight, forwards credentials only to GitHub, and preserves errors', async () => {
  const path = '/git-proxy/github.com/owner/notes.git/info/refs?service=git-upload-pack';
  const preflight = await handleRequest(
    new Request(base + path, { method: 'OPTIONS', headers: { Origin: env.APP_ORIGIN } }),
    env,
  );
  assert.equal(preflight.status, 204);
  const response = await handleRequest(
    new Request(base + path, {
      headers: {
        Origin: env.APP_ORIGIN,
        Authorization: 'Basic test',
        Cookie: 'private=secret',
      },
    }),
    env,
    async (url, options) => {
      assert.equal(url, 'https://github.com/owner/notes.git/info/refs?service=git-upload-pack');
      assert.equal(options.headers.get('Authorization'), 'Basic test');
      assert.equal(options.headers.get('Cookie'), null);
      assert.equal(options.redirect, 'manual');
      return new Response('denied', { status: 401 });
    },
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.APP_ORIGIN);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

import { APP_NAME, APP_ID } from '../src/app-identity';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';

const prefix = '/api/git-proxy/';

/** Same-origin development gateway, restricted to GitHub's Git smart HTTP endpoints. */
export function createGitProxy(request = httpsRequest): Connect.NextHandleFunction {
  return (incoming: IncomingMessage, outgoing: ServerResponse, next) => {
    if (!incoming.url?.startsWith(prefix)) return next();
    const reject = (status: number, message: string) => {
      outgoing.writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      outgoing.end(message);
    };
    const host = incoming.headers.host || '';
    try {
      const protocol =
        'encrypted' in incoming.socket && incoming.socket.encrypted ? 'https' : 'http';
      const app = new URL(`${protocol}://${host}`);
      const origin = incoming.headers.origin ? new URL(incoming.headers.origin) : null;
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(app.hostname) ||
        (origin && origin.origin !== app.origin) ||
        incoming.headers['sec-fetch-site'] === 'cross-site'
      ) {
        reject(403, 'The Git proxy only accepts requests from the local application.');
        return;
      }
    } catch {
      reject(403, 'Invalid application origin.');
      return;
    }
    const rawTarget = incoming.url.slice(prefix.length);
    // Reject encoded paths, credentials, ports, traversal and arbitrary remote hosts.
    const match =
      /^github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/(info\/refs\?service=git-(?:upload|receive)-pack|git-(?:upload|receive)-pack)$/.exec(
        rawTarget,
      );
    if (!match || match[2] === '.' || match[2] === '..') {
      reject(400, 'Only GitHub repository Git endpoints are supported by the local proxy.');
      return;
    }
    const discovery = match[3].startsWith('info/refs');
    if (incoming.method !== (discovery ? 'GET' : 'POST')) {
      reject(405, 'Unsupported Git request method.');
      return;
    }
    const service = match[3].includes('receive-pack') ? 'receive-pack' : 'upload-pack';
    if (!discovery && incoming.headers['content-type'] !== `application/x-git-${service}-request`) {
      reject(400, 'Invalid Git request content type.');
      return;
    }
    const headers: Record<string, string> = { 'User-Agent': `${APP_NAME}-Git`, Accept: '*/*' };
    for (const name of ['authorization', 'content-type', 'content-length', 'git-protocol']) {
      const value = incoming.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    const upstream = request(
      `https://${rawTarget}`,
      { method: incoming.method, headers },
      (response) => {
        const status = response.statusCode || 502;
        if (status >= 300 && status < 400) {
          response.resume();
          reject(
            502,
            'GitHub redirected the request. Use the canonical repository URL ending in .git.',
          );
          return;
        }
        outgoing.statusCode = status;
        outgoing.setHeader('Cache-Control', 'no-store');
        // Keep Git's 401 status so isomorphic-git can retry with the configured token,
        // without triggering the browser's native same-origin Basic Auth dialog.
        for (const name of ['content-type', 'content-encoding']) {
          const value = response.headers[name];
          if (value) outgoing.setHeader(name, value);
        }
        response.on('error', () => outgoing.destroy());
        response.pipe(outgoing);
      },
    );
    upstream.setTimeout(60_000, () => upstream.destroy(new Error('Git request timed out.')));
    upstream.on('error', () => {
      if (!outgoing.headersSent) reject(502, 'Unable to reach GitHub through the local proxy.');
      else outgoing.destroy();
    });
    incoming.on('aborted', () => upstream.destroy());
    outgoing.on('close', () => {
      if (!outgoing.writableFinished) upstream.destroy();
    });
    incoming.pipe(upstream);
  };
}

export function gitProxyPlugin(): Plugin {
  return {
    name: `${APP_ID}-local-git-proxy`,
    configureServer(server) {
      server.middlewares.use(createGitProxy());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createGitProxy());
    },
  };
}

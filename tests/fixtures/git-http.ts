import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

/** A real native Git remote for browser integration tests, with explicit local CORS. */
export async function createGitRemote(directory: string, authentication?: string) {
  const bare = path.join(directory, 'remote.git');
  execFileSync('git', ['init', '--bare', '--initial-branch=main', bare], { windowsHide: true });
  execFileSync('git', ['--git-dir', bare, 'config', 'http.receivepack', 'true'], {
    windowsHide: true,
  });
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4175');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Git-Protocol');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (
      authentication &&
      request.headers.authorization !== `Basic ${Buffer.from(authentication).toString('base64')}`
    ) {
      response.writeHead(401);
      response.end('Authentication required');
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = new URL(request.url!, 'http://localhost');
    const child = spawn('git', ['http-backend'], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: directory.replaceAll('\\', '/'),
        GIT_HTTP_EXPORT_ALL: '1',
        REQUEST_METHOD: request.method,
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search.slice(1),
        CONTENT_TYPE: request.headers['content-type'] || '',
        CONTENT_LENGTH: String(body.length),
      },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.resume();
    child.on('error', () => {
      response.writeHead(500);
      response.end();
    });
    child.on('close', () => {
      const result = Buffer.concat(output);
      const index = result.indexOf('\r\n\r\n');
      if (index < 0) {
        response.writeHead(500);
        response.end();
        return;
      }
      for (const header of result.subarray(0, index).toString().split('\r\n')) {
        const [name, ...value] = header.split(':');
        if (name.toLowerCase() === 'status')
          response.statusCode = Number.parseInt(value.join(':').trim(), 10);
        else response.setHeader(name, value.join(':').trim());
      }
      response.end(result.subarray(index + 4));
    });
    child.stdin.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP test server');
  return {
    bare,
    url: `http://127.0.0.1:${address.port}/remote.git`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

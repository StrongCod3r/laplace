import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer as createHttpServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import git from 'isomorphic-git';

const root = path.join(os.tmpdir(), 'laplace-git-tests');

async function fixture(t) {
  await fs.promises.mkdir(root, { recursive: true });
  const directory = await fs.promises.mkdtemp(path.join(root, 'git-'));
  t.after(async () => {
    assert.ok(directory.startsWith(root + path.sep));
    await fs.promises.rm(directory, { recursive: true, force: true });
  });
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  t.after(() => server.close());
  const { WorkspaceGitClient, validateGitUrl, testGitConnection } = await server.ssrLoadModule(
    '/src/features/git/services/git-client.ts',
  );
  const { createDirectoryFs } = await server.ssrLoadModule(
    '/src/features/git/services/directory-fs.ts',
  );
  const { createGitProxy } = await server.ssrLoadModule('/scripts/git-proxy.ts');
  const { localGitProxy, connectionProxy } = await server.ssrLoadModule(
    '/src/features/git/services/git-connection.ts',
  );
  const { diffLines, splitDiffRows } = await server.ssrLoadModule(
    '/src/features/git/services/line-diff.ts',
  );
  return {
    directory,
    WorkspaceGitClient,
    validateGitUrl,
    testGitConnection,
    createDirectoryFs,
    createGitProxy,
    localGitProxy,
    connectionProxy,
    diffLines,
    splitDiffRows,
  };
}

function directoryHandle(directory) {
  const handle = (target, kind) => ({
    name: path.basename(target),
    kind,
    async getDirectoryHandle(name, options) {
      const child = path.join(target, name);
      if (options?.create) await fs.promises.mkdir(child, { recursive: true });
      try {
        if (!(await fs.promises.stat(child)).isDirectory())
          throw new DOMException('File', 'TypeMismatchError');
      } catch (error) {
        if (error.code === 'ENOENT') throw new DOMException('Missing', 'NotFoundError');
        throw error;
      }
      return handle(child, 'directory');
    },
    async getFileHandle(name, options) {
      const child = path.join(target, name);
      if (options?.create) await fs.promises.appendFile(child, '');
      try {
        if (!(await fs.promises.stat(child)).isFile())
          throw new DOMException('Directory', 'TypeMismatchError');
      } catch (error) {
        if (error.code === 'ENOENT') throw new DOMException('Missing', 'NotFoundError');
        throw error;
      }
      return handle(child, 'file');
    },
    async *entries() {
      for (const entry of await fs.promises.readdir(target, { withFileTypes: true }))
        yield [
          entry.name,
          handle(path.join(target, entry.name), entry.isDirectory() ? 'directory' : 'file'),
        ];
    },
    async removeEntry(name) {
      try {
        const child = path.join(target, name);
        if ((await fs.promises.stat(child)).isDirectory()) await fs.promises.rmdir(child);
        else await fs.promises.unlink(child);
      } catch (error) {
        if (error.code === 'ENOTEMPTY')
          throw new DOMException('Not empty', 'InvalidModificationError');
        throw error;
      }
    },
    async getFile() {
      const stat = await fs.promises.stat(target);
      return new File([await fs.promises.readFile(target)], path.basename(target), {
        lastModified: stat.mtimeMs,
      });
    },
    async createWritable() {
      let data;
      return {
        async write(value) {
          data = value;
        },
        async close() {
          await fs.promises.writeFile(target, data);
        },
        async abort() {},
      };
    },
  });
  return handle(directory, 'directory');
}

async function serveGit(t, directory, authentication) {
  const bare = path.join(directory, 'remote.git');
  await git.init({ fs, dir: bare, bare: true, defaultBranch: 'main' });
  execFileSync('git', ['--git-dir', bare, 'config', 'http.receivepack', 'true']);
  const server = createHttpServer(async (request, response) => {
    if (
      authentication &&
      request.headers.authorization !== `Basic ${Buffer.from(authentication).toString('base64')}`
    ) {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Git test"' });
      response.end('Authentication required');
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = new URL(request.url, 'http://localhost');
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
    const output = [];
    child.stdout.on('data', (chunk) => output.push(chunk));
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
        response.end(result);
        return;
      }
      const headers = result.subarray(0, index).toString().split('\r\n');
      for (const header of headers) {
        const [name, ...value] = header.split(':');
        if (name.toLowerCase() === 'status')
          response.statusCode = Number.parseInt(value.join(':').trim(), 10);
        else response.setHeader(name, value.join(':').trim());
      }
      response.end(result.subarray(index + 4));
    });
    child.stdin.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}/remote.git`, bare };
}

test('Git directory adapter creates real commits, previews text and stages deletions', async (t) => {
  const { directory, WorkspaceGitClient, createDirectoryFs, validateGitUrl } = await fixture(t);
  const adapter = createDirectoryFs(directoryHandle(directory));
  const client = new WorkspaceGitClient(adapter);
  assert.equal((await client.status()).initialized, false);
  await client.initialize();
  await client.configure({
    url: 'https://example.com/notes.git',
    corsProxy: '',
    name: 'Test',
    email: 'test@example.com',
  });
  client.authenticate('test-user', 'secret-unit-token');
  await fs.promises.mkdir(path.join(directory, '.laplace'));
  await fs.promises.writeFile(path.join(directory, '.laplace', 'app.json'), '{}');
  await fs.promises.writeFile(path.join(directory, 'Nota española.md'), 'Texto inicial\n');
  const first = await client.commit('Initial workspace');
  assert.ok(first);
  assert.equal((await client.status()).changes.length, 0);
  const native = await git.readCommit({ fs, dir: directory, oid: first });
  assert.equal(native.commit.author.name, 'Test');
  assert.equal(await git.getConfig({ fs, dir: directory, path: 'branch.main.remote' }), 'origin');
  const indexBefore = await fs.promises.readFile(path.join(directory, '.git', 'index'));
  assert.deepEqual(await git.listFiles({ fs, dir: directory }), [
    '.gitignore',
    '.laplace/app.json',
    'Nota española.md',
  ]);
  await fs.promises.writeFile(path.join(directory, 'Nota española.md'), 'Texto modificado\n');
  await client.status();
  assert.deepEqual(await fs.promises.readFile(path.join(directory, '.git', 'index')), indexBefore);
  assert.deepEqual(await client.preview('Nota española.md'), {
    binary: false,
    before: 'Texto inicial\n',
    after: 'Texto modificado\n',
  });
  await client.commit('Modify note');
  await fs.promises.unlink(path.join(directory, 'Nota española.md'));
  assert.deepEqual((await client.status()).changes, [
    { path: 'Nota española.md', kind: 'deleted' },
  ]);
  await client.commit('Remove note');
  assert.equal((await client.status()).changes.length, 0);
  assert.deepEqual(await git.listFiles({ fs, dir: directory }), [
    '.gitignore',
    '.laplace/app.json',
  ]);
  await assert.rejects(adapter.promises.readFile('/../outside'), { code: 'EINVAL' });
  await assert.rejects(adapter.promises.readFile('/.git/../../outside'), { code: 'EINVAL' });
  await assert.rejects(adapter.promises.readFile('/.git/missing'), { code: 'ENOENT' });
  assert.throws(() => validateGitUrl('https://user:secret@example.com/repo.git'), /credentials/);
  assert.throws(() => validateGitUrl('ssh://example.com/repo.git'), /HTTPS/);
  const config = await fs.promises.readFile(path.join(directory, '.git', 'config'), 'utf8');
  assert.ok(!config.includes('app.json'));
  assert.ok(!config.includes('secret-unit-token'));
  await fs.promises.writeFile(path.join(directory, '.git', 'MERGE_HEAD'), first + '\n');
  await assert.rejects(
    client.commit('Do not complete an unfinished merge'),
    /Git integration in progress/,
  );
});

test('automatic commit settings persist in each repository without storing credentials', async (t) => {
  const { directory, WorkspaceGitClient } = await fixture(t);
  const client = new WorkspaceGitClient(fs, directory);
  await client.initialize();
  await client.configure({
    url: 'https://example.com/repo.git',
    corsProxy: '',
    name: 'Local author',
    email: 'local@example.com',
  });
  assert.equal(await client.loadAutoCommitSettings(), null);
  client.authenticate('user', 'private-token');
  const settings = {
    enabled: true,
    autoPush: true,
    intervalMinutes: 7,
    messageFormat: 'Sync {workspace}: "{branch}" # {date} {time}',
  };
  await client.saveAutoCommitSettings(settings);
  const reopened = new WorkspaceGitClient(fs, directory);
  assert.deepEqual(await reopened.loadAutoCommitSettings(), settings);
  const configBefore = await fs.promises.readFile(path.join(directory, '.git/config'), 'utf8');
  assert.ok(!configBefore.includes('private-token'));
  assert.equal(await git.getConfig({ fs, dir: directory, path: 'user.name' }), 'Local author');
  await assert.rejects(
    reopened.saveAutoCommitSettings({ ...settings, intervalMinutes: 0 }),
    /interval/,
  );
  assert.equal(
    await fs.promises.readFile(path.join(directory, '.git/config'), 'utf8'),
    configBefore,
  );
  await reopened.saveAutoCommitSettings({ ...settings, enabled: false, autoPush: false });
  assert.deepEqual(await new WorkspaceGitClient(fs, directory).loadAutoCommitSettings(), {
    ...settings,
    enabled: false,
    autoPush: false,
  });
  const otherDir = path.join(directory, 'other');
  await fs.promises.mkdir(otherDir);
  const other = new WorkspaceGitClient(fs, otherDir);
  await other.initialize();
  assert.equal(await other.loadAutoCommitSettings(), null);
});

test('connection tests discover empty and populated remotes using draft credentials without writing files', async (t) => {
  const { directory, testGitConnection } = await fixture(t);
  const { url, bare } = await serveGit(t, directory, 'draft-user:draft-secret');
  const settings = { url, corsProxy: '' };
  const authentication = { username: 'draft-user', token: 'draft-secret' };
  const before = await fs.promises.readdir(directory, { recursive: true });
  await testGitConnection(settings, authentication);
  assert.deepEqual(await fs.promises.readdir(directory, { recursive: true }), before);
  await assert.rejects(
    testGitConnection(settings, { username: 'draft-user', token: 'wrong' }),
    /Access denied/,
  );
  const local = path.join(directory, 'local');
  execFileSync('git', ['init', '--initial-branch=main', local], { windowsHide: true });
  await fs.promises.writeFile(path.join(local, 'Note.md'), 'Unchanged by connection tests\n');
  execFileSync('git', ['-C', local, 'add', '.'], { windowsHide: true });
  execFileSync(
    'git',
    [
      '-C',
      local,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'Initial',
    ],
    { windowsHide: true },
  );
  execFileSync('git', ['-C', local, 'push', bare, 'main'], { windowsHide: true });
  const config = await fs.promises.readFile(path.join(local, '.git', 'config'));
  const head = await git.resolveRef({ fs, dir: bare, gitdir: bare, ref: 'main' });
  await testGitConnection(settings, authentication);
  assert.deepEqual(await fs.promises.readFile(path.join(local, '.git', 'config')), config);
  assert.equal(await git.resolveRef({ fs, dir: bare, gitdir: bare, ref: 'main' }), head);
  assert.equal(
    await fs.promises.readFile(path.join(local, 'Note.md'), 'utf8'),
    'Unchanged by connection tests\n',
  );
  assert.equal(fs.existsSync(path.join(local, '.git', 'FETCH_HEAD')), false);
});

test('connection tests validate URLs, use the CORS proxy, sanitize failures and support cancellation', async (t) => {
  const { testGitConnection } = await fixture(t);
  const settings = { url: 'https://example.com/repo.git', corsProxy: '' };
  const authentication = { username: 'draft-user', token: 'draft-secret' };
  await assert.rejects(
    testGitConnection({ ...settings, url: '' }, authentication),
    /Enter the remote repository URL/,
  );
  await assert.rejects(
    testGitConnection({ ...settings, url: 'not a URL' }, authentication),
    /valid URL/,
  );
  await assert.rejects(
    testGitConnection({ ...settings, url: 'ssh://example.com/repo.git' }, authentication),
    /HTTPS/,
  );
  await assert.rejects(
    testGitConnection(
      { ...settings, url: 'https://user:secret@example.com/repo.git' },
      authentication,
    ),
    /credentials/,
  );
  await assert.rejects(
    testGitConnection({ ...settings, corsProxy: 'invalid' }, authentication),
    /CORS proxy: enter a valid URL/,
  );
  let requestedUrl;
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    requestedUrl = url;
    return new Response('sensitive server response', { status: 404 });
  });
  await assert.rejects(
    testGitConnection({ ...settings, corsProxy: 'https://proxy.example' }, authentication),
    /Repository not found/,
  );
  assert.ok(requestedUrl.startsWith('https://proxy.example/'));
  fetch.mock.mockImplementation(async () => new Response('draft-secret', { status: 403 }));
  await assert.rejects(testGitConnection(settings, authentication), /Access denied/);
  fetch.mock.mockImplementation(async () => new Response('draft-secret', { status: 503 }));
  await assert.rejects(testGitConnection(settings, authentication), /HTTP 503/);
  fetch.mock.mockImplementation(async () => {
    throw new TypeError('Network error containing draft-secret');
  });
  await assert.rejects(testGitConnection(settings, authentication), (error) => {
    assert.match(error.message, /network and CORS proxy/);
    assert.ok(!error.message.includes('draft-secret'));
    return true;
  });
  fetch.mock.mockImplementation(
    async (_url, options) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (options.signal.aborted) abort();
        else options.signal.addEventListener('abort', abort, { once: true });
      }),
  );
  const controller = new AbortController();
  const pending = testGitConnection(settings, authentication, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timeout = testGitConnection(settings, authentication);
  t.mock.timers.tick(15_000);
  await assert.rejects(timeout, /Connection timed out/);
  t.mock.timers.reset();
});

test('local Git proxy forwards authenticated Git discovery, fetch and push while rejecting other targets', async (t) => {
  const {
    directory,
    WorkspaceGitClient,
    testGitConnection,
    createGitProxy,
    localGitProxy,
    connectionProxy,
  } = await fixture(t);
  assert.equal(
    localGitProxy('https://github.com/user/repo.git', 'http://localhost:3000', true),
    'http://localhost:3000/api/git-proxy',
  );
  assert.equal(localGitProxy('https://github.com/user/repo.git', 'https://app.example', true), '');
  assert.equal(
    localGitProxy('https://github.com/user/repo.git', 'http://localhost:3000', false),
    '',
  );
  assert.equal(
    localGitProxy('https://gitlab.com/user/repo.git', 'http://localhost:3000', true),
    '',
  );
  assert.equal(
    connectionProxy('https://github.com/user/repo.git', 'https://proxy.example/'),
    'https://proxy.example',
  );
  const remote = await serveGit(t, directory, 'proxy-user:proxy-token');
  const forwarded = [];
  const middleware = createGitProxy((target, options, callback) => {
    forwarded.push({ url: target, authorization: options.headers.authorization });
    const upstreamUrl = new URL(target);
    upstreamUrl.pathname = upstreamUrl.pathname.replace('/user/notes.git', '/remote.git');
    return httpRequest(
      `${new URL(remote.url).origin}${upstreamUrl.pathname}${upstreamUrl.search}`,
      options,
      callback,
    );
  });
  const server = createHttpServer((request, response) =>
    middleware(request, response, () => {
      response.writeHead(404);
      response.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const settings = {
    url: 'https://github.com/user/notes.git',
    corsProxy: `${origin}/api/git-proxy`,
    name: 'Proxy test',
    email: 'proxy@example.com',
  };
  const authentication = { username: 'proxy-user', token: 'proxy-token' };
  await testGitConnection(settings, authentication);
  const local = path.join(directory, 'local');
  await fs.promises.mkdir(local);
  const client = new WorkspaceGitClient(fs, local);
  await client.initialize();
  await client.configure(settings);
  client.authenticate(authentication.username, authentication.token);
  await fs.promises.writeFile(
    path.join(local, 'Proxied.md'),
    'Written through the local Git gateway\n',
  );
  await client.synchronize('Proxy push');
  assert.ok(forwarded.some(({ url }) => url.endsWith('/git-receive-pack')));
  assert.ok(
    forwarded.some(
      ({ authorization }) =>
        authorization === `Basic ${Buffer.from('proxy-user:proxy-token').toString('base64')}`,
    ),
  );
  const receiver = path.join(directory, 'receiver');
  await fs.promises.mkdir(receiver);
  const other = new WorkspaceGitClient(fs, receiver);
  await other.initialize();
  await other.configure(settings);
  other.authenticate(authentication.username, authentication.token);
  // Receive into a clean branch without the .gitignore generated by initialize.
  await fs.promises.unlink(path.join(receiver, '.gitignore'));
  await other.synchronize('Proxy fetch');
  assert.equal(
    await fs.promises.readFile(path.join(receiver, 'Proxied.md'), 'utf8'),
    'Written through the local Git gateway\n',
  );
  assert.ok(forwarded.some(({ url }) => url.endsWith('/git-upload-pack')));
  const sent = forwarded.length;
  for (const target of [
    'evil.example/user/notes.git/info/refs?service=git-upload-pack',
    'github.com:443/user/notes.git/info/refs?service=git-upload-pack',
    'github.com/user/../info/refs?service=git-upload-pack',
    'github.com/user/notes.git/info/refs?service=invalid',
    'github.com/user/notes.git/info/refs?service=git-upload-pack&extra=1',
  ]) {
    assert.equal((await fetch(`${origin}/api/git-proxy/${target}`)).status, 400);
  }
  assert.equal(
    (
      await fetch(
        `${origin}/api/git-proxy/github.com/user/notes.git/info/refs?service=git-upload-pack`,
        { headers: { Origin: 'https://evil.example' } },
      )
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${origin}/api/git-proxy/github.com/user/notes.git/git-receive-pack`)).status,
    405,
  );
  assert.equal(
    (
      await fetch(`${origin}/api/git-proxy/github.com/user/notes.git/git-receive-pack`, {
        method: 'POST',
        body: 'invalid',
      })
    ).status,
    400,
  );
  assert.equal(forwarded.length, sent);
});

test('Git synchronization pushes, receives files, protects dirty work and rejects divergence', async (t) => {
  const { directory, WorkspaceGitClient } = await fixture(t);
  const { url, bare } = await serveGit(t, directory);
  const left = path.join(directory, 'left');
  const right = path.join(directory, 'right');
  await fs.promises.mkdir(left);
  await fs.promises.mkdir(right);
  const a = new WorkspaceGitClient(fs, left);
  const b = new WorkspaceGitClient(fs, right);
  const settings = { url, corsProxy: '', name: 'Workspace user', email: 'user@example.com' };
  await a.initialize();
  await a.configure(settings);
  await fs.promises.writeFile(path.join(left, 'Note.md'), 'First version\n');
  let scans = 0;
  const workingStatus = a.workingStatus.bind(a);
  a.workingStatus = (...args) => {
    scans++;
    return workingStatus(...args);
  };
  let status = await a.synchronize('First sync');
  assert.equal(status.worktreeUpdated, false);
  assert.equal(scans, 3, 'commit and sync needs only fetch, post-commit and final scans');
  scans = 0;
  await a.synchronize('Already synchronized');
  assert.equal(scans, 2, 'unchanged sync needs only fetch and final scans');
  assert.equal(status.changes.length, 0);
  assert.equal(status.outgoing.length, 0);
  assert.equal((await git.log({ fs, dir: bare, gitdir: bare })).length, 1);
  await git.init({ fs, dir: right, defaultBranch: 'main' });
  await b.configure(settings);
  status = await b.fetchStatus();
  assert.equal(status.incoming.length, 1);
  assert.ok(status.incomingFiles.some((file) => file.path === 'Note.md' && file.kind === 'added'));
  assert.deepEqual(await b.preview('Note.md', 'incoming'), {
    binary: false,
    before: '',
    after: 'First version\n',
  });
  assert.equal((await b.synchronize('Receive')).worktreeUpdated, true);
  assert.equal(await fs.promises.readFile(path.join(right, 'Note.md'), 'utf8'), 'First version\n');
  await fs.promises.writeFile(path.join(left, 'Note.md'), 'Remote update\n');
  await a.synchronize('Second sync');
  await fs.promises.writeFile(path.join(right, 'Draft.md'), 'Keep this draft\n');
  await assert.rejects(b.synchronize('Do not overwrite'), /uncommitted local changes/);
  assert.equal(
    await fs.promises.readFile(path.join(right, 'Draft.md'), 'utf8'),
    'Keep this draft\n',
  );
  assert.equal(await fs.promises.readFile(path.join(right, 'Note.md'), 'utf8'), 'First version\n');
  await fs.promises.unlink(path.join(right, 'Draft.md'));
  await b.synchronize('Receive update');
  assert.equal(await fs.promises.readFile(path.join(right, 'Note.md'), 'utf8'), 'Remote update\n');
  await fs.promises.writeFile(path.join(left, 'Left.md'), 'Left commit\n');
  await a.synchronize('Left update');
  await fs.promises.writeFile(path.join(right, 'Right.md'), 'Right commit\n');
  await b.commit('Right update');
  await assert.rejects(b.push(), /diverged/);
  await assert.rejects(b.synchronize('No force push'), /diverged/);
  status = await b.fetchStatus();
  assert.equal(status.incoming.length, 1);
  assert.equal(status.outgoing.length, 1);
  assert.deepEqual(await b.preview('Right.md', 'outgoing'), {
    binary: false,
    before: '',
    after: 'Right commit\n',
  });
  assert.equal(await fs.promises.readFile(path.join(right, 'Right.md'), 'utf8'), 'Right commit\n');
  assert.equal(
    (await git.log({ fs, dir: bare, gitdir: bare }))[0].commit.message.trim(),
    'Left update',
  );
});

test('push sends existing commits without committing drafts or applying incoming files', async (t) => {
  const { directory, WorkspaceGitClient } = await fixture(t);
  const { url, bare } = await serveGit(t, directory, 'user:token');
  const local = path.join(directory, 'local');
  const writer = path.join(directory, 'writer');
  await fs.promises.mkdir(local);
  await fs.promises.mkdir(writer);
  const client = new WorkspaceGitClient(fs, local);
  await client.initialize();
  await client.configure({ url, corsProxy: '', name: 'User', email: 'user@example.com' });
  client.authenticate('user', 'token');
  await fs.promises.writeFile(path.join(local, 'Note.md'), 'Committed\n');
  const oid = await client.commit('Scheduled commit');
  await fs.promises.writeFile(path.join(local, 'Note.md'), 'Uncommitted draft\n');
  client.authenticate('user', 'wrong');
  await assert.rejects(client.push());
  assert.equal((await client.status()).headOid, oid);
  client.authenticate('user', 'token');
  assert.equal((await client.push()).outgoing.length, 0);
  assert.equal(await git.resolveRef({ fs, dir: bare, gitdir: bare, ref: 'main' }), oid);
  assert.equal(
    await fs.promises.readFile(path.join(local, 'Note.md'), 'utf8'),
    'Uncommitted draft\n',
  );
  await git.clone({
    fs,
    http: (await import('isomorphic-git/http/node')).default,
    dir: writer,
    url,
    onAuth: () => ({ username: 'user', password: 'token' }),
  });
  await fs.promises.writeFile(path.join(writer, 'Remote.md'), 'Remote change\n');
  await git.add({ fs, dir: writer, filepath: 'Remote.md' });
  await git.commit({
    fs,
    dir: writer,
    message: 'Remote update',
    author: { name: 'User', email: 'user@example.com' },
  });
  await git.push({
    fs,
    http: (await import('isomorphic-git/http/node')).default,
    dir: writer,
    url,
    onAuth: () => ({ username: 'user', password: 'token' }),
  });
  assert.equal((await client.push()).incoming.length, 1);
  assert.equal((await client.status()).headOid, oid);
  assert.equal(fs.existsSync(path.join(local, 'Remote.md')), false);
  assert.equal(
    await fs.promises.readFile(path.join(local, 'Note.md'), 'utf8'),
    'Uncommitted draft\n',
  );
});

test('line diffs preserve both revisions, newline changes and repeated lines', async (t) => {
  const { diffLines, splitDiffRows } = await fixture(t);
  const examples = [
    ['', ''],
    ['', 'new\n'],
    ['old\n', ''],
    ['a\nb\nc\n', 'a\nchanged\nc\n'],
    ['a\n', 'a'],
    ['same\nsame\nend\n', 'same\ninsert\nsame\nend\n'],
    ['España\r\n\r\n', 'España\n\n'],
    [
      Array.from({ length: 700 }, (_, i) => `old ${i}\n`).join(''),
      Array.from({ length: 700 }, (_, i) => `new ${i}\n`).join(''),
    ],
  ];
  let seed = 712;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let sample = 0; sample < 200; sample++) {
    const revision = () =>
      Array.from({ length: random() % 40 }, () => `${random() % 8}\n`).join('');
    examples.push([revision(), revision()]);
  }
  for (const [before, after] of examples) {
    const lines = diffLines(before, after);
    assert.equal(
      lines
        .filter((line) => line.kind !== 'added')
        .map((line) => line.text)
        .join(''),
      before,
    );
    assert.equal(
      lines
        .filter((line) => line.kind !== 'removed')
        .map((line) => line.text)
        .join(''),
      after,
    );
    const rows = splitDiffRows(lines);
    assert.equal(rows.map((row) => row.before?.text ?? '').join(''), before);
    assert.equal(rows.map((row) => row.after?.text ?? '').join(''), after);
  }
  assert.deepEqual(
    diffLines('a\nb\nc\n', 'a\nchanged\nc\n').map((line) => line.kind),
    ['equal', 'removed', 'added', 'equal'],
  );
});

test('file comparisons distinguish HEAD, index and working tree without changing files', async (t) => {
  const { directory, WorkspaceGitClient } = await fixture(t);
  const client = new WorkspaceGitClient(fs, directory);
  await client.initialize();
  await client.configure({ url: '', corsProxy: '', name: 'Diff test', email: 'diff@example.com' });
  const file = path.join(directory, 'Comparison.txt');
  const before = 'unchanged\noriginal\nend\n';
  const staged = 'unchanged\nstaged\nend\n';
  const working = 'unchanged\nworking\nend\n';
  await fs.promises.writeFile(file, before);
  await client.commit('Baseline');
  await fs.promises.writeFile(file, staged);
  await git.add({ fs, dir: directory, filepath: 'Comparison.txt' });
  await fs.promises.writeFile(file, working);
  const index = await fs.promises.readFile(path.join(directory, '.git/index'));
  assert.deepEqual(await client.preview('Comparison.txt', 'staged'), {
    binary: false,
    before,
    after: staged,
  });
  assert.deepEqual(await client.preview('Comparison.txt', 'unstaged'), {
    binary: false,
    before: staged,
    after: working,
  });
  assert.deepEqual(await client.preview('Comparison.txt'), {
    binary: false,
    before,
    after: working,
  });
  await fs.promises.writeFile(path.join(directory, 'Added.txt'), 'new\n');
  assert.deepEqual(await client.preview('Added.txt', 'unstaged'), {
    binary: false,
    before: '',
    after: 'new\n',
  });
  await fs.promises.unlink(file);
  assert.deepEqual(await client.preview('Comparison.txt', 'unstaged'), {
    binary: false,
    before: staged,
    after: '',
  });
  await fs.promises.writeFile(file, working);
  await fs.promises.writeFile(path.join(directory, 'Binary.bin'), Buffer.from([0, 1, 2]));
  assert.equal((await client.preview('Binary.bin', 'unstaged')).binary, true);
  assert.deepEqual(await fs.promises.readFile(path.join(directory, '.git/index')), index);
  assert.equal(await fs.promises.readFile(file, 'utf8'), working);
});

test('previews read only the selected file and skip repository history and unrelated subtrees', async (t) => {
  const { directory, WorkspaceGitClient } = await fixture(t);
  const client = new WorkspaceGitClient(fs, directory);
  await client.initialize();
  await client.configure({ url: '', corsProxy: '', name: 'Diff', email: 'diff@example.com' });
  await fs.promises.mkdir(path.join(directory, 'notes'));
  await fs.promises.mkdir(path.join(directory, 'unrelated'));
  for (let i = 0; i < 120; i++)
    await fs.promises.writeFile(path.join(directory, 'unrelated', i + '.md'), 'Unrelated note\n');
  await fs.promises.writeFile(path.join(directory, 'notes/Selected.md'), 'Original\n');
  await client.commit('Baseline');
  await fs.promises.writeFile(path.join(directory, 'notes/Selected.md'), 'Staged\n');
  await git.add({ fs, dir: directory, filepath: 'notes/Selected.md' });
  await fs.promises.writeFile(path.join(directory, 'notes/Selected.md'), 'Working\n');
  const calls = [];
  const measured = new WorkspaceGitClient(
    {
      promises: new Proxy(fs.promises, {
        get(target, method) {
          const operation = target[method];
          if (typeof operation !== 'function') return operation;
          return (...args) => {
            calls.push({ method, path: String(args[0]).replaceAll('\\', '/') });
            return operation.apply(target, args);
          };
        },
      }),
    },
    directory,
  );
  const started = performance.now();
  await measured.status();
  const fullStatusMs = performance.now() - started;
  const fullReads = calls.filter((call) => call.method === 'readFile').length;
  calls.length = 0;
  const previewStarted = performance.now();
  const result = await measured.preview('notes/Selected.md', 'unstaged');
  const previewMs = performance.now() - previewStarted;
  const previewReads = calls.filter((call) => call.method === 'readFile').length;
  assert.deepEqual(result, { binary: false, before: 'Staged\n', after: 'Working\n' });
  assert.ok(!calls.some((call) => call.path.includes('/unrelated/')));
  assert.ok(previewReads < fullReads, 'A preview must not read all working files');
  t.diagnostic(
    'Full status: ' +
      fullStatusMs.toFixed(1) +
      ' ms / ' +
      fullReads +
      ' reads; targeted preview: ' +
      previewMs.toFixed(1) +
      ' ms / ' +
      previewReads +
      ' reads',
  );
  // Prevent a future regression to whole-repository or whole-tree queries.
  measured.status = async () => {
    throw new Error('Unexpected global status');
  };
  measured.tree = async () => {
    throw new Error('Unexpected full tree');
  };
  assert.equal((await measured.preview('notes/Selected.md', 'staged')).after, 'Staged\n');
  assert.equal((await measured.preview('notes/Selected.md')).after, 'Working\n');
  await assert.rejects(measured.preview('unrelated/0.md', 'unstaged'), /no longer has changes/);
});

test('targeted remote previews compare merge base to each branch without global status', async (t) => {
  const { directory, WorkspaceGitClient } = await fixture(t);
  const client = new WorkspaceGitClient(fs, directory);
  await client.initialize();
  await client.configure({ url: '', corsProxy: '', name: 'Diff', email: 'diff@example.com' });
  const note = path.join(directory, 'Note.md');
  await fs.promises.writeFile(note, 'Baseline\n');
  const base = await client.commit('Baseline');
  await fs.promises.writeFile(note, 'Remote\n');
  await fs.promises.writeFile(path.join(directory, 'Empty.md'), '');
  const remote = await client.commit('Remote');
  await git.writeRef({ fs, dir: directory, ref: 'refs/remotes/origin/main', value: remote });
  await git.writeRef({ fs, dir: directory, ref: 'refs/heads/main', value: base, force: true });
  await fs.promises.writeFile(note, 'Local\n');
  await client.commit('Local');
  client.status = async () => {
    throw new Error('Unexpected global status');
  };
  client.tree = async () => {
    throw new Error('Unexpected full tree');
  };
  assert.deepEqual(await client.preview('Note.md', 'incoming'), {
    binary: false,
    before: 'Baseline\n',
    after: 'Remote\n',
  });
  assert.deepEqual(await client.preview('Note.md', 'outgoing'), {
    binary: false,
    before: 'Baseline\n',
    after: 'Local\n',
  });
  assert.deepEqual(await client.preview('Empty.md', 'incoming'), {
    binary: false,
    before: '',
    after: '',
  });
  await assert.rejects(client.preview('Missing.md', 'incoming'), /no longer has changes/);
});

test('repository metadata avoids file scans and history cache follows refs while drafts stay fresh', async (t) => {
  const { directory, WorkspaceGitClient } = await fixture(t);
  const client = new WorkspaceGitClient(fs, directory);
  await client.initialize();
  await client.configure({ url: '', corsProxy: '', name: 'Test', email: 'test@example.com' });
  await fs.promises.writeFile(path.join(directory, 'Note.md'), 'Initial\n');
  await client.commit('Initial');

  let scans = 0;
  let comparisons = 0;
  const workingStatus = client.workingStatus.bind(client);
  const compareBranches = client.compareBranches.bind(client);
  client.workingStatus = (...args) => {
    scans++;
    return workingStatus(...args);
  };
  client.compareBranches = (...args) => {
    comparisons++;
    return compareBranches(...args);
  };
  await client.repositoryInfo();
  assert.equal(await client.loadAutoCommitSettings(), null);
  const settings = {
    enabled: false,
    autoPush: false,
    intervalMinutes: 5,
    messageFormat: 'Auto {date}',
  };
  await client.saveAutoCommitSettings(settings);
  assert.deepEqual(await client.loadAutoCommitSettings(), settings);
  assert.equal(scans, 0, 'configuration must not inspect the worktree');
  assert.equal(comparisons, 0, 'configuration must not read commit history');

  await client.status();
  await fs.promises.writeFile(path.join(directory, 'Note.md'), 'External edit\n');
  const changed = await client.status();
  assert.ok(changed.changes.some((change) => change.path === 'Note.md'));
  assert.equal(comparisons, 1, 'draft changes reuse the immutable branch comparison');

  execFileSync('git', ['add', '.'], { cwd: directory });
  execFileSync('git', ['commit', '-m', 'External commit'], { cwd: directory });
  const committed = await client.status();
  assert.equal(committed.changes.length, 0);
  assert.equal(comparisons, 2, 'an external HEAD change invalidates history');
  assert.equal(committed.outgoing.length, 2);
  await git.writeRef({
    fs,
    dir: directory,
    ref: 'refs/remotes/origin/main',
    value: committed.headOid,
  });
  const synced = await client.status();
  assert.equal(comparisons, 3, 'a remote ref change invalidates history');
  assert.equal(synced.outgoing.length, 0);
  assert.equal(synced.incoming.length, 0);
});

test('selected files stage, unstage and discard without changing unrelated drafts', async (t) => {
  const { directory, WorkspaceGitClient, createDirectoryFs } = await fixture(t);
  const client = new WorkspaceGitClient(createDirectoryFs(directoryHandle(directory)));
  await client.initialize();
  await client.configure({ url: '', corsProxy: '', name: 'Test', email: 'test@example.com' });
  await fs.promises.mkdir(path.join(directory, 'nested'));
  await fs.promises.writeFile(path.join(directory, 'Note.md'), 'Original\n');
  await fs.promises.writeFile(path.join(directory, 'Other.md'), 'Other original\n');
  await fs.promises.writeFile(path.join(directory, 'empty.bin'), new Uint8Array());
  await fs.promises.writeFile(
    path.join(directory, 'nested', 'deleted.bin'),
    new Uint8Array([0, 255, 1]),
  );
  await client.commit('Initial');
  await fs.promises.writeFile(path.join(directory, 'Note.md'), 'Draft\n');
  await fs.promises.writeFile(path.join(directory, 'Other.md'), 'Keep this draft\n');
  await fs.promises.writeFile(path.join(directory, 'New.md'), 'New file\n');
  await fs.promises.rm(path.join(directory, 'nested'), { recursive: true });
  await fs.promises.writeFile(path.join(directory, 'empty.bin'), 'Modified');
  await client.stageFiles(['Note.md', 'New.md', 'nested/deleted.bin']);
  assert.deepEqual(
    (await client.status()).stagedChanges.map((change) => change.path),
    ['New.md', 'Note.md', 'nested/deleted.bin'],
  );
  await fs.promises.writeFile(path.join(directory, 'Note.md'), 'Newer draft\n');
  await client.unstageFiles(['Note.md', 'New.md']);
  assert.equal(
    await fs.promises.readFile(path.join(directory, 'Note.md'), 'utf8'),
    'Newer draft\n',
  );
  assert.deepEqual(
    (await client.status()).stagedChanges.map((change) => change.path),
    ['nested/deleted.bin'],
  );
  await client.stageFiles(['Note.md', 'New.md']);
  await client.discardChanges(['Note.md', 'New.md', 'nested/deleted.bin', 'empty.bin']);
  assert.equal(await fs.promises.readFile(path.join(directory, 'Note.md'), 'utf8'), 'Original\n');
  assert.equal(
    await fs.promises.readFile(path.join(directory, 'Other.md'), 'utf8'),
    'Keep this draft\n',
  );
  assert.deepEqual(
    new Uint8Array(await fs.promises.readFile(path.join(directory, 'nested', 'deleted.bin'))),
    new Uint8Array([0, 255, 1]),
  );
  assert.equal((await fs.promises.stat(path.join(directory, 'empty.bin'))).size, 0);
  await assert.rejects(fs.promises.stat(path.join(directory, 'New.md')), { code: 'ENOENT' });
  assert.deepEqual((await client.status()).changes, [{ path: 'Other.md', kind: 'modified' }]);
  assert.deepEqual((await client.status()).stagedChanges, []);
  await fs.promises.writeFile(path.join(directory, 'Delete me.md'), 'Untracked');
  await client.discardChanges(['Delete me.md']);
  await assert.rejects(fs.promises.stat(path.join(directory, 'Delete me.md')), { code: 'ENOENT' });
  for (const unsafe of [
    '../escape.md',
    '/Note.md',
    '.git/HEAD',
    'nested/../Note.md',
    'C:\\Note.md',
  ]) {
    await assert.rejects(client.discardChanges([unsafe]), /relative paths/);
  }
  const before = await fs.promises.readFile(path.join(directory, 'Other.md'), 'utf8');
  await assert.rejects(client.discardChanges(['Other.md', 'missing.md']), /no longer available/);
  assert.equal(await fs.promises.readFile(path.join(directory, 'Other.md'), 'utf8'), before);
});

test('file actions also handle repositories before their first commit', async (t) => {
  const { directory, WorkspaceGitClient } = await fixture(t);
  const client = new WorkspaceGitClient(fs, directory);
  await client.initialize();
  await fs.promises.writeFile(path.join(directory, 'New.md'), 'Before first commit');
  await client.stageFiles(['New.md']);
  assert.ok((await client.status()).stagedChanges.some((change) => change.path === 'New.md'));
  await client.unstageFiles(['New.md']);
  assert.ok(!(await client.status()).stagedChanges.some((change) => change.path === 'New.md'));
  assert.equal(
    await fs.promises.readFile(path.join(directory, 'New.md'), 'utf8'),
    'Before first commit',
  );
  await client.discardChanges(['New.md']);
  await assert.rejects(fs.promises.stat(path.join(directory, 'New.md')), { code: 'ENOENT' });
});

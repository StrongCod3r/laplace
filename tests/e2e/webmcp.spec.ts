import { expect, test, type WebSocketRoute } from '@playwright/test';
import { webMcpTools } from '../../src/features/webmcp/services/tools';

test('bridge resumes after F5 without reusing registration tokens, and forgets disconnected, expired, or other-vault sessions', async ({
  page,
}) => {
  let registrations = 0,
    channels = 0;
  let channel: WebSocketRoute | undefined;
  const replies: Record<string, unknown>[] = [];
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    }),
  );
  await page.routeWebSocket('ws://127.0.0.1:32997/**', (socket) => {
    if (socket.url().endsWith('/register'))
      socket.onMessage(() => {
        registrations++;
        socket.send(JSON.stringify({ type: 'registerSuccess', token: 'authorized-session' }));
      });
    else {
      channels++;
      channel = socket;
      expect(socket.url()).toContain('token=authorized-session');
      socket.onMessage((raw) => replies.push(JSON.parse(String(raw))));
    }
  });
  const stored = () => page.evaluate(() => sessionStorage.getItem('laplace.webmcp.bridge-session'));
  const trigger = page.getByRole('button', { name: 'WebMCP', exact: true });
  const connect = async () => {
    await page
      .getByLabel('Connection token', { exact: true })
      .fill(
        Buffer.from(
          JSON.stringify({ server: 'ws://127.0.0.1:32997', token: 'single-use-token' }),
        ).toString('base64'),
      );
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(trigger).toHaveAttribute('data-connected', '');
  };
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await trigger.click();
  await connect();
  const session = JSON.parse((await stored())!);
  expect(session.token).toBe('authorized-session');
  expect(await stored()).not.toContain('single-use-token');
  await page.reload();
  await expect(trigger).toHaveAttribute('data-connected', '');
  expect(registrations).toBe(1);
  expect(channels).toBe(2);
  await expect
    .poll(() => replies.filter((message) => message.type === 'registerTool').length)
    .toBe(webMcpTools.length * 2);
  const call = async (id: string, tool: string, args: Record<string, unknown> = {}) => {
    channel!.send(JSON.stringify({ type: 'callTool', id, tool, arguments: args }));
    await expect.poll(() => replies.some((message) => message.id === id)).toBe(true);
    const response = replies.find((message) => message.id === id)! as {
      error?: string;
      result: { content: { text: string }[] };
    };
    expect(response.error).toBeUndefined();
    return JSON.parse(response.result.content[0].text);
  };
  const note = await call('resumed-create', 'laplace_create_note', {
    title: 'After reload',
    markdown: 'Created by the restored bridge.',
  });
  expect(note.markdown).toContain('Created by the restored bridge.');
  await call('resumed-save', 'laplace_save_workspace');
  await trigger.click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  expect(await stored()).toBeNull();
  await page.reload();
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(trigger).not.toHaveAttribute('data-connected');
  expect(channels).toBe(2);
  await trigger.click();
  await connect();
  await page.evaluate(() => {
    const key = 'laplace.webmcp.bridge-session';
    const session = JSON.parse(sessionStorage.getItem(key)!);
    session.expiresAt = Date.now() - 1;
    sessionStorage.setItem(key, JSON.stringify(session));
  });
  await page.reload();
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect.poll(stored).toBeNull();
  expect(channels).toBe(3);
  await trigger.click();
  await connect();
  await trigger.click();
  await page.locator('#chooseDirectoryBtn').click();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { useWorkspaceStore } = await import(
          /* @vite-ignore */ new URL('src/store/workspace.store.ts', location.href).href
        );
        return {
          vaultId: useWorkspaceStore.getState().ui.activeVaultId,
          access: useWorkspaceStore.getState().ui.access,
          session: sessionStorage.getItem('laplace.webmcp.bridge-session'),
        };
      }),
    )
    .toMatchObject({ access: 'writable', session: null });
  await expect(trigger).not.toHaveAttribute('data-connected');
  expect(channels).toBe(4);
});

test('WebMCP connects, discovers tools, creates an undoable note, and disconnects', async ({
  page,
}) => {
  let channel: WebSocketRoute | undefined;
  const responses: Record<string, unknown>[] = [];
  await page.routeWebSocket('ws://127.0.0.1:32999/**', (socket) => {
    if (socket.url().endsWith('/register')) {
      socket.onMessage((raw) => {
        const data = JSON.parse(Buffer.from(String(raw), 'base64').toString());
        expect(data.host).toBe('127_0_0_1_4175');
        expect(data.token).toBe('registration-token');
        socket.send(JSON.stringify({ type: 'registerSuccess', token: 'session-token' }));
      });
    } else {
      channel = socket;
      socket.onMessage((raw) => responses.push(JSON.parse(String(raw))));
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'WebMCP', exact: true }).click();
  await page.getByRole('button', { name: 'WebMCP installation instructions' }).click();
  const instructions = page.getByRole('dialog', { name: 'Install WebMCP' });
  await expect(instructions).toBeVisible();
  await expect(instructions.locator('pre').first()).toBeVisible();
  await expect(instructions.locator('pre').first()).toContainText('"mcpServers"');
  await page.keyboard.press('Escape');
  await expect(instructions).not.toBeVisible();
  await expect(page.locator('#webmcp-panel')).toBeVisible();
  await page.locator('#pageTitle').click();
  await expect(page.locator('#webmcp-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'WebMCP', exact: true }).click();
  await page
    .getByLabel('Connection token', { exact: true })
    .fill(
      Buffer.from(
        JSON.stringify({ server: 'ws://127.0.0.1:32999', token: 'registration-token' }),
      ).toString('base64'),
    );
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Connected');
  await expect(page.getByRole('button', { name: 'WebMCP', exact: true })).toHaveAttribute(
    'data-connected',
    '',
  );
  await expect
    .poll(() => responses.filter((item) => item.type === 'registerTool').length)
    .toBe(webMcpTools.length);
  await expect(page.getByLabel('Connection token', { exact: true })).toHaveCount(0);
  const call = async (id: string, tool: string, args: unknown = {}) => {
    channel!.send(JSON.stringify({ type: 'callTool', id, tool, arguments: args }));
    await expect.poll(() => responses.some((item) => item.id === id)).toBe(true);
    return responses.find((item) => item.id === id)! as {
      result?: { content: { text: string }[] };
      error?: string;
    };
  };
  const created = await call('create', 'laplace_create_note', {
    title: 'MCP note',
    markdown:
      '---\naliases: [MCP alias]\n---\n\n# WebMCP\n\nOriginal **bold** and $x^2$.\n\n| A | B |\n| --- | --- |\n| one | two |\n',
  });
  const note = JSON.parse(created.result!.content[0].text);
  await expect(page.locator('#pageTitle')).toHaveText('MCP note');
  const read = await call('read', 'laplace_read_note', { pageId: note.pageId });
  expect(JSON.parse(read.result!.content[0].text).title).toBe('MCP note');
  expect(note.markdown).toContain('aliases: [MCP alias]');
  expect(note.markdown).toContain('Original **bold**');
  await expect(page.locator('#blockEditor')).toContainText('Original bold');
  const replaced = await call('replace', 'laplace_replace_note', {
    pageId: note.pageId,
    expectedMarkdown: note.markdown,
    markdown: '## Updated\n\nChanged [link](https://example.com).\n\n>> Nested quote\n',
  });
  const updated = JSON.parse(replaced.result!.content[0].text);
  expect(updated.markdown).toContain('aliases: [MCP alias]');
  expect(updated.markdown).toContain('## Updated');
  const stale = await call('stale', 'laplace_replace_note', {
    pageId: note.pageId,
    expectedMarkdown: note.markdown,
    markdown: 'Must not overwrite',
  });
  expect(stale.error).toContain('has changed');
  const appended = await call('append', 'laplace_append_note', {
    pageId: note.pageId,
    expectedMarkdown: updated.markdown,
    markdown:
      '## Further reading\n\n[Specification](https://webmachinelearning.github.io/webmcp/)\n',
  });
  const final = JSON.parse(appended.result!.content[0].text);
  expect(final.markdown).toContain('## Updated');
  expect(final.markdown).toContain('## Further reading');
  const favorite = await call('favorite', 'laplace_set_favorite', {
    pageId: note.pageId,
    favorite: true,
  });
  expect(JSON.parse(favorite.result!.content[0].text).favorite).toBe(true);
  const saved = await call('save', 'laplace_save_workspace');
  expect(JSON.parse(saved.result!.content[0].text).saved).toBe(true);
  const bad = await call('bad', 'laplace_create_note', { title: '../unsafe' });
  expect(bad.error).toContain('valid note title');
  const undo = () =>
    page.evaluate(async () => {
      const { useWorkspaceStore } = await import(
        /* @vite-ignore */ new URL('src/store/workspace.store.ts', location.href).href
      );
      await useWorkspaceStore.getState().controller.invoke('undoWorkspace');
    });
  await undo(); // Favorite
  await undo(); // Append
  expect(
    JSON.parse(
      (await call('read-after-append-undo', 'laplace_read_note', { pageId: note.pageId })).result!
        .content[0].text,
    ).markdown,
  ).toBe(updated.markdown);
  await undo(); // Replace
  expect(
    JSON.parse(
      (await call('read-after-replace-undo', 'laplace_read_note', { pageId: note.pageId })).result!
        .content[0].text,
    ).markdown,
  ).toBe(note.markdown);
  await undo(); // Create, including the initial body
  await expect(
    page.locator('#pageTree .tree-page-btn').filter({ hasText: 'MCP note' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Disconnected');
  await expect(page.getByRole('button', { name: 'WebMCP', exact: true })).not.toHaveAttribute(
    'data-connected',
  );
});

test('WebMCP persists Markdown, keeps child notes and leaves unrelated split editors intact', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    await (await navigator.storage.getDirectory()).getDirectoryHandle('Docs', { create: true });
  });
  await page.locator('#chooseDirectoryBtn').click();
  const tool = (name: string, args: Record<string, unknown> = {}) =>
    page.evaluate(
      async ({ name, args }) => {
        const { useWorkspaceStore } = await import(
          /* @vite-ignore */ new URL('src/store/workspace.store.ts', location.href).href
        );
        const store = useWorkspaceStore.getState();
        const result = await store.controller.invokeWebMcpTool(store.ui.activeVaultId, name, args);
        return JSON.parse((result as { content: { text: string }[] }).content[0].text);
      },
      { name, args },
    );
  await expect
    .poll(async () => {
      try {
        return (await tool('laplace_list_folders')).folders.some(
          (folder: { path: string }) => folder.path === 'Docs',
        );
      } catch {
        return false;
      }
    })
    .toBe(true);
  const folders = await tool('laplace_list_folders');
  expect(folders.folders.some((folder: { path: string }) => folder.path === 'Docs')).toBe(true);
  const note = await tool('laplace_create_note', {
    title: 'Folder summary',
    folderPath: 'Docs',
    markdown: '---\naliases: [Summary]\n---\n\n# Summary\n\nOriginal paragraph\n',
  });
  expect(note.path).toBe('Docs/Folder summary.md');
  const child = await tool('laplace_create_note', {
    title: 'Child',
    parentPageId: note.pageId,
    markdown: 'Child content',
  });
  expect(child.parentPageId).toBe(note.pageId);
  expect(child.path).toBe('Docs/Folder summary/Child.md');
  const duplicate = await tool('laplace_create_note', {
    title: 'Folder summary',
    folderPath: 'Docs',
    markdown: 'Distinct note',
  });
  expect(duplicate.path).toBe('Docs/Folder summary 1.md');
  const other = await tool('laplace_create_note', {
    title: 'Other',
    folderPath: '',
    markdown: 'Unrelated text',
  });
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(page.locator('.dock-pane')).toHaveCount(2);
  await page
    .locator('.dock-pane')
    .first()
    .getByRole('tab', { name: 'Folder summary', exact: true })
    .click();
  const unrelated = await page
    .locator(`[data-dock-page][data-page-id="${other.pageId}"] [data-dock-blocks] .block-content`)
    .first()
    .elementHandle();
  const updated = await tool('laplace_replace_note', {
    pageId: note.pageId,
    expectedMarkdown: note.markdown,
    markdown: '## New summary\n\nUpdated body',
  });
  expect(updated.markdown).toContain('aliases: [Summary]');
  expect(await unrelated!.evaluate((node) => node.isConnected)).toBe(true);
  const active = await page
    .locator('.dock-pane.active [data-dock-blocks] .block-content')
    .first()
    .elementHandle();
  await tool('laplace_append_note', {
    pageId: other.pageId,
    expectedMarkdown: other.markdown,
    markdown: '> Appended quote',
  });
  expect(await active!.evaluate((node) => node.isConnected)).toBe(true);
  expect((await tool('laplace_read_note', { pageId: child.pageId })).markdown).toContain(
    'Child content',
  );
  await tool('laplace_save_workspace');
  const disk = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const docs = await root.getDirectoryHandle('Docs');
    return (await (await docs.getFileHandle('Folder summary.md')).getFile()).text();
  });
  expect(disk).toBe(updated.markdown);
  await page.reload();
  await expect
    .poll(async () => {
      try {
        return (await tool('laplace_workspace')).access;
      } catch {
        return 'checking';
      }
    })
    .toBe('writable');
  const results = await tool('laplace_search_notes', { query: 'Updated body' });
  expect(results.notes).toHaveLength(1);
  expect((await tool('laplace_read_note', { pageId: results.notes[0].pageId })).markdown).toBe(
    updated.markdown,
  );
});

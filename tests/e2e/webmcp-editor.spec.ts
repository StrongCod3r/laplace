import { expect, test, type WebSocketRoute } from '@playwright/test';
import { webMcpTools } from '../../src/features/webmcp/services/tools';

test('WebMCP manages tabs, pane layout, auxiliary views and recency without modifying note content or content history', async ({
  page,
}) => {
  let channel: WebSocketRoute | undefined;
  const messages: Record<string, unknown>[] = [];
  await page.routeWebSocket('ws://127.0.0.1:32995/**', (socket) => {
    if (socket.url().endsWith('/register'))
      socket.onMessage(() =>
        socket.send(JSON.stringify({ type: 'registerSuccess', token: 'editor-session' })),
      );
    else {
      channel = socket;
      socket.onMessage((raw) => messages.push(JSON.parse(String(raw))));
    }
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.getByRole('button', { name: 'WebMCP', exact: true }).click();
  await page
    .getByLabel('Connection token', { exact: true })
    .fill(
      Buffer.from(
        JSON.stringify({ server: 'ws://127.0.0.1:32995', token: 'editor-registration' }),
      ).toString('base64'),
    );
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Connected');
  await expect
    .poll(() => messages.filter((message) => message.type === 'registerTool').length)
    .toBe(webMcpTools.length);
  let sequence = 0;
  const request = async (tool: string, args: Record<string, unknown> = {}) => {
    const id = `editor-${++sequence}`;
    channel!.send(JSON.stringify({ type: 'callTool', id, tool, arguments: args }));
    await expect.poll(() => messages.some((message) => message.id === id)).toBe(true);
    return messages.find((message) => message.id === id)! as {
      error?: string;
      result?: { content: { text: string }[] };
    };
  };
  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const response = await request(tool, args);
    expect(response.error).toBeUndefined();
    return JSON.parse(response.result!.content[0].text);
  };
  const a = await call('laplace_create_note', { title: 'Editor A', markdown: 'Original A body' });
  const b = await call('laplace_create_note', { title: 'Editor B', markdown: 'Original B body' });
  const initial = await call('laplace_list_tabs');
  const tabA = initial.tabs.find((tab: { pageId: string }) => tab.pageId === a.pageId).tabId;
  const tabB = initial.tabs.find((tab: { pageId: string }) => tab.pageId === b.pageId).tabId;
  expect(initial.activeTabId).toBe(tabB);
  expect(initial.groups).toHaveLength(1);
  const graph = await call('laplace_open_view', { view: 'graph' });
  expect(graph.tabs.find((tab: { tabId: string }) => tab.tabId === graph.activeTabId).kind).toBe(
    'graph',
  );
  const closedGraph = await call('laplace_close_tab', { tabId: graph.activeTabId });
  expect(closedGraph.activeTabId).toBe(tabB);
  const reopenedGraph = await call('laplace_reopen_closed_tab');
  expect(reopenedGraph.reopened).toBe(true);
  expect(reopenedGraph.mainView).toBe('graph');
  await call('laplace_activate_tab', { tabId: tabA });
  const closedBackground = await call('laplace_close_tab', { tabId: graph.activeTabId });
  expect(closedBackground.activeTabId).toBe(tabA);
  const invalid = await request('laplace_close_tab', { tabId: 'missing' });
  expect(invalid.error).toContain('Tab not found');
  expect((await request('laplace_split_editor', { edge: 'diagonal' })).error).toContain(
    'Invalid argument',
  );
  const { closedTabId: _closedTabId, ...unchangedEditor } = closedBackground;
  expect(await call('laplace_list_tabs')).toEqual(unchangedEditor);
  const split = await call('laplace_split_editor', { tabId: tabB, edge: 'right' });
  expect(split.groups).toHaveLength(2);
  expect(split.activeTabId).toBe(tabB);
  const right = split.activeGroupId;
  const left = split.groups.find((group: { groupId: string }) => group.groupId !== right).groupId;
  const replaced = await call('laplace_open_note', {
    pageId: a.pageId,
    groupId: right,
    newTab: false,
  });
  expect(replaced.tabId).toBe(tabB);
  expect(replaced.groupId).toBe(right);
  const openedB = await call('laplace_open_note', { pageId: b.pageId, groupId: right });
  const moved = await call('laplace_move_tab', {
    tabId: openedB.tabId,
    groupId: left,
    beforeTabId: tabA,
  });
  expect(
    moved.groups
      .find((group: { groupId: string }) => group.groupId === left)
      .tabIds.indexOf(openedB.tabId),
  ).toBeLessThan(
    moved.groups.find((group: { groupId: string }) => group.groupId === left).tabIds.indexOf(tabA),
  );
  const beforeInvalid = await call('laplace_list_tabs');
  expect(
    (await request('laplace_move_tab', { tabId: openedB.tabId, groupId: left, beforeTabId: tabB }))
      .error,
  ).toContain('target editor group');
  expect(await call('laplace_list_tabs')).toEqual(beforeInvalid);
  await call('laplace_activate_tab', { tabId: tabB });
  const collapsed = await call('laplace_close_tab', { tabId: tabB });
  expect(collapsed.groups).toHaveLength(1);
  expect(collapsed.activeTabId).toBe(openedB.tabId);
  const reopened = await call('laplace_reopen_closed_tab');
  expect(reopened.reopened).toBe(true);
  expect(reopened.groups).toHaveLength(1);
  expect(reopened.activeTabId).toBe(tabB);
  await call('laplace_split_editor', { edge: 'top' });
  const reset = await call('laplace_reset_editor_layout');
  expect(reset.groups).toHaveLength(1);
  const attachments = await call('laplace_open_view', { view: 'attachments' });
  expect(attachments.mainView).toBe('attachments');
  await call('laplace_close_tab', { tabId: attachments.activeTabId });
  expect((await call('laplace_read_note', { pageId: a.pageId })).markdown).toBe(a.markdown);
  expect((await call('laplace_read_note', { pageId: b.pageId })).markdown).toBe(b.markdown);
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      /* @vite-ignore */ new URL('src/store/workspace.store.ts', location.href).href
    );
    await useWorkspaceStore.getState().controller.invoke('undoWorkspace');
  });
  expect((await call('laplace_search_notes', { query: 'Editor B' })).notes).toHaveLength(0);
  expect((await call('laplace_read_note', { pageId: a.pageId })).markdown).toBe(a.markdown);
});

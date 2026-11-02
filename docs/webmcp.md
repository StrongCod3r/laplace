# WebMCP

Laplace exposes the same tool set through two independent adapters: the experimental native browser API (`document.modelContext`) and the original [webmcp.dev](https://webmcp.dev/) local bridge from `@jason.today/webmcp`. Both use the same validation, workspace permissions, history, and persistence. No remote script, notes backend, or API key is required.

## Native browser tools

Open a workspace in a browser that provides `document.modelContext`. Laplace registers its tools automatically and reports readiness in the WebMCP panel's Browser row. This route needs no token or local server. Compatible browser agents can discover tools directly; Chrome DevTools lists them under Application → WebMCP.

The API is experimental and requires a secure context, including localhost. Browser support and activation requirements may change. For local Chrome testing, enable `chrome://flags/#enable-webmcp-testing` and relaunch the browser, as described in the [official browser guide](https://developer.chrome.com/docs/ai/webmcp). A browser without this API can still use the local bridge. Registration failures (including browser Permissions Policy restrictions) do not prevent bridge connections.

Registration is tied to the current controller and vault. On vault/access changes or unmount, an owned AbortSignal unregisters only Laplace's tools; other applications' registrations are retained. A newly available vault gets fresh callbacks bound to its ID. Retired callbacks and pre-cancelled executions reject before invoking the controller. Once a save has started, it finishes through the guarded storage queue. Browser tools return the same MCP content envelope as bridge tools; native `executeTool` serializes that result to JSON. Tool annotations mark read-only operations and untrusted output. Tools remain same-origin: the adapter does not grant cross-origin access.

The Browser readiness indicator means the tools are registered; it does not mean an agent is connected. Connect, Disconnect, the green ribbon indicator dot, and inactivity timeout refer to the local bridge. Disconnecting the bridge leaves native browser tools available.

Implementation follows the current [browser imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api) and [Community Group draft](https://webmachinelearning.github.io/webmcp/); this draft is not a final W3C standard. Older `navigator.modelContext` implementations are not used.

## Local bridge connection

Use an AI agent or client that supports local MCP servers (stdio). Add a server with command `npx` and arguments `-y @jason.today/webmcp@latest --mcp`. For clients using JSON configuration, adapt this example to their supported format:

```json
{
  "mcpServers": {
    "webmcp": {
      "command": "npx",
      "args": ["-y", "@jason.today/webmcp@latest", "--mcp"]
    }
  }
}
```

Open Laplace and a workspace. Ask your client to generate a WebMCP token, open the WebMCP plug button in the left ribbon above Source code on GitHub, paste the token, and select Connect. Some clients require a restart to discover newly registered tools. The browser must permit a WebSocket connection to the local bridge; connection failures are shown in the panel.

The client can search, read, create, and edit notes in the connected vault, subject to workspace write access. Connect only a client you want to give that access to. Only loopback bridge addresses are accepted. The single-use registration token is never stored. Once the authorized channel opens, its issued session token is kept in this tab's `sessionStorage` under `laplace.webmcp.bridge-session`, together with the vault ID, formatted host, server, version, and expiry. No credentials are written to workspace files or localStorage, and no note content is stored with the session.

F5 reloads and controller remounts reconnect directly to the authorized channel after the same vault becomes available, without reusing the consumed registration token. Sessions for another vault or host, expired or malformed records, and non-loopback servers are discarded. Disconnect, blocked workspace access, connection failures, and five minutes without tool activity clear the saved session. A vault change discards the old session when the new vault is available. If sessionStorage is disabled, live connections still work but cannot resume after reload. The bridge must remain running and still accept the issued token; it can revoke a channel that stays offline too long, in which case a new registration token is needed. Reconnection re-advertises the current tools; some MCP clients may also need a restart to refresh their tool list.

## Tools

The ribbon uses a plug icon with a green indicator dot while connected. The icon retains normal ribbon colors; the expanded-panel highlight is independent of connection status. The compact panel shows Browser and Local bridge statuses, a token input with Connect while disconnected, or Disconnect while connected. Clicking outside closes it without disconnecting. Setup and session details live in the installation dialog, opened from the upper-right help button and dismissed with its close button, Escape, or the backdrop.

| Tool                     | Arguments                                                  | Behavior                                                                                                              |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `laplace_workspace`      | None                                                       | Connected vault, active page, selected folder, access, and note count                                                 |
| `laplace_list_folders`   | None                                                       | Existing folder names, IDs, and paths, including the workspace root                                                   |
| `laplace_search_notes`   | Optional `query`, `offset`, `limit`                        | Search titles, paths, and Markdown; return note summaries, total matches, and `nextOffset`                            |
| `laplace_read_note`      | `pageId`                                                   | Canonical Markdown, title, actual path, parent page, folder ID, and favorite status                                   |
| `laplace_open_note`      | `pageId`; optional `groupId`, `newTab`                     | Open a note in a target group and return tab and group IDs                                                            |
| `laplace_create_note`    | `title`; optional `markdown`, `folderPath`, `parentPageId` | Create a complete note with collision-safe naming and return its canonical Markdown                                   |
| `laplace_replace_note`   | `pageId`, `markdown`, `expectedMarkdown`                   | Replace content, rejecting concurrent edits; preserve user frontmatter when the new source omits a frontmatter header |
| `laplace_append_note`    | `pageId`, `markdown`, `expectedMarkdown`                   | Append Markdown blocks, retaining existing blocks, IDs, and frontmatter                                               |
| `laplace_set_favorite`   | `pageId`, boolean `favorite`                               | Set or clear favorite status                                                                                          |
| `laplace_save_workspace` | None                                                       | Await guarded persistence of the current workspace snapshot; return `saved: true` only after success                  |

Creation, edits, favorites, deletion requests, and explicit saves require a hydrated writable workspace. Read-only workspaces permit reading and navigation. All tools reject unavailable workspaces, active Git reservations, disposed controllers, and vault changes. Tools never delete attachment files, access credentials, or change repositories. Replacing a note's blocks does not delete its child pages or attachment files. Note content is untrusted data for the client.

## Delete notes

| Tool                       | Arguments                             | Behavior                                                                     |
| -------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| `laplace_delete_note`      | `pageId`; optional `expectedMarkdown` | Request deletion of a note and its descendants                               |
| `laplace_delete_all_notes` | `expectedNoteCount`                   | Request deletion of every note in the active vault; reject an outdated count |
| `laplace_deletion_status`  | `requestId`                           | Read the request's current outcome                                           |
| `laplace_cancel_deletion`  | `requestId`                           | Cancel a request while confirmation is pending                               |

Deletion tools open Laplace's existing confirmation dialog and immediately return a session-local `requestId`, affected note count, and up to 100 note summaries. Only the user accepting that dialog authorizes deletion; there is no force or automatic confirmation argument. Use a fresh workspace count for deleting all notes, or a recent canonical Markdown read for an optional individual-note precondition. A request expires after two minutes without confirmation. Disconnection, adapter disposal, or controller disposal cancels pending confirmation. An empty vault returns a successful no-op without a dialog.

Poll `laplace_deletion_status` after confirmation. Outcomes are `pending_confirmation`, `saving`, `deleted`, `cancelled`, or `failed`; only `deleted` with `saved: true` confirms persistence. Cancellation cannot interrupt a save already in progress. Results are bounded to 20 requests per controller session and are unavailable after reload. Native registrations mark deletion requests as consequential operations.

Before mutation, the service validates the same vault, location, document, note/folder content, writable access, baseline, and Git reservation, including after draining the write queue. Changes while confirmation is pending reject the request. Successful deletion records one Undo operation, updates tabs through the existing removal service, and awaits guarded persistence with explicit deletion markers. Other WebMCP writes wait until the deletion finishes. Failed saves restore removed notes in memory, preserving edits to surviving notes, and attempt a restoration save; `restored` and `rollbackSaved` report recovery. If storage remains inaccessible, restored content still requires a successful save. Existing folders, attachments, and unmanaged files are retained.

Creation and each content edit are separate undoable operations using the existing history and scheduled persistence. Mutation responses acknowledge the change in the editor, not a completed disk write. Call `laplace_save_workspace` afterward when confirmation of persistence is required. A save persists the snapshot captured when it is invoked; later edits still require their own save. Save responses revalidate the connected vault and document after awaiting the storage queue.

Creation without a destination uses the currently selected folder. To select the root, pass `folderPath: ""`; other paths must already exist. To create a child note, pass `parentPageId` instead. These options are mutually exclusive. Folder-note parents retain the app's existing folder-note placement rules. The creation response reports the actual title and path when a collision requires a suffix.

Markdown inputs and `expectedMarkdown` are limited to 1,000,000 characters each. Titles are limited to 200 characters. Search defaults to 100 results and accepts `limit` from 1 to 100 and a nonnegative integer `offset`. Use `nextOffset` until it is null to enumerate additional matches.

## Editor control

| Tool                          | Arguments                                  | Behavior                                                                                               |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `laplace_list_tabs`           | None                                       | Inspect all note, Graph, and Attachments tabs, groups, selected tabs, and split layout                 |
| `laplace_activate_tab`        | `tabId`                                    | Activate an existing tab in its group                                                                  |
| `laplace_close_tab`           | `tabId`                                    | Close a tab, retaining its note and using normal recency rules                                         |
| `laplace_reopen_closed_tab`   | None                                       | Reopen the most recently closed available tab; report `reopened: false` when none can be restored      |
| `laplace_split_editor`        | Optional `tabId`, `edge`                   | Split a note's group; defaults to the active tab and `right`; also accepts `left`, `top`, and `bottom` |
| `laplace_move_tab`            | `tabId`, `groupId`; optional `beforeTabId` | Move or reorder a tab, activate it, and collapse empty groups                                          |
| `laplace_reset_editor_layout` | None                                       | Merge groups into one pane while retaining all tabs                                                    |
| `laplace_open_view`           | `view`: `graph` or `attachments`           | Open or activate an auxiliary workspace view                                                           |

Use `tabId` and `groupId` values from a fresh `laplace_list_tabs` response. Each tab includes its `kind`, note `pageId` when applicable, title, group, zero-based index within that group, global `active` status, and whether it is the `selected` tab in its own group. The response also provides `activeTabId`, `activeGroupId`, `mainView`, group tab order, and the split-layout tree. It does not serialize note bodies or mutate the editor. Editor-control operations return this updated snapshot so the next operation can use the current IDs.

`laplace_open_note` accepts optional `groupId` and boolean `newTab`. The default is a new active tab in the current group. With `newTab: false`, the active note tab in the chosen group is replaced; opening from Graph or Attachments retains the normal service behavior of creating a note tab. The response contains `tabId` and `groupId` as well as the note ID and title.

Closing a background tab retains the active tab. Closing an active tab returns to the most recently visited available tab in its group before falling back elsewhere. Closing the last tab in a pane collapses that pane; reopening uses the original group if it still exists, otherwise the current group. Splitting a group's only note tab duplicates its presentation into a second pane; splitting with multiple tabs moves the selected tab into the new pane. Graph and Attachments tabs cannot be split. `beforeTabId` must belong to the destination group. Invalid IDs and enum values reject before navigation changes.

These operations are available in read-only workspaces and do not require note write access. They preserve document content and use existing view persistence and per-vault tab recency/closed-tab history. Navigation alone adds no content Undo entry. Existing connection, hydration, Git reservation, and disposal guards still apply.

## Create and edit content

For a new note, call `laplace_create_note` with a title and a Markdown body, for example:

```json
{
  "title": "WebMCP summary",
  "markdown": "# WebMCP\n\nA summary with **formatting** and [sources](https://webmachinelearning.github.io/webmcp/).\n",
  "folderPath": ""
}
```

For an existing note, read it first. Send the exact returned `markdown` string as `expectedMarkdown` to `laplace_replace_note` or `laplace_append_note`. An outdated value rejects the edit without changing the document. Read again and reconcile changes before retrying. Empty `expectedMarkdown` is valid for an empty note. Empty replacement Markdown clears the body but retains frontmatter unless an explicit frontmatter header is supplied. To clear user frontmatter too, include an empty header (`---\n\n---\n`). App-specific imported metadata never replaces page identity or hierarchy.

Implementation lives in `src/features/webmcp/`. The typed controller method delegates tool execution to live services; it does not maintain a second editable document. The Preact widget owns both adapter lifecycles and theme-aware UI. `use-native-webmcp.ts` detects the native API and `native.ts` registers tools with per-session abortable ownership. The bridge uses `/register`, followed by the host channel with the issued session token, matching the original protocol. Both adapters reuse `webMcpTools`; the bridge also advertises empty prompt/resource lists.

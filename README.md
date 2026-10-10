# Laplace

A local-first Markdown workspace built with Preact 11, TypeScript, Vite 7, Zustand and CSS Modules. Notes are stored as `.md` files in a folder you choose, with the existing IndexedDB configuration and directory handles preserved.

The main application now mounts through Preact without URL routing. Notes and tools use the existing editor tabs. See [the SPA architecture](docs/client-spa-architecture.md) for feature boundaries, editor lifecycle, local persistence and static hosting.

## Get started

Requires Node >=22.12. With pnpm:

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

Or use npm:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The other package scripts are `npm run build` for a production build, `npm run preview` to serve that build locally, and `npm run typecheck` to check TypeScript without emitting files.

`pnpm build` checks TypeScript and generates the static site in `public/`. `pnpm typecheck` validates typed modules, `pnpm test` runs unit checks, and `pnpm test:e2e` builds production and runs browser checks. Windows browser checks use an installed Edge; on Linux, run `pnpm exec playwright install --with-deps chromium` first.

## Code formatting

Prettier uses the shared `.prettierrc.json` configuration: two-space indentation, single quotes, semicolons, a 100-column target and LF line endings. Embedded code in strings is left untouched to preserve the editor's HTML templates. Build output, dependencies, lockfiles and test artifacts are excluded through `.prettierignore`.

```bash
pnpm format       # Format project source and configuration
pnpm format:check # Verify formatting without changing files
```

VS Code is configured to format on save with the recommended Prettier extension. Other editors can use `.editorconfig` and the same project configuration. See [the Prettier configuration documentation](https://prettier.io/docs/configuration).

- Choose a local notes folder from the sidebar or Settings. Laplace reads Markdown files recursively and saves notes as `.md` files with YAML metadata. Use **Refresh notes** to load edits made in another Markdown editor.
- In local-folder workspaces, app configuration and workspace metadata are kept in `.laplace/`. Browser storage keeps workspace data in IndexedDB.
- Browser storage keeps a workspace in the current browser with IndexedDB. You can save a local copy to an empty folder or switch between available workspaces from the workspace selector.
- Export and import a workspace as JSON from Settings. Browser storage and local-folder workspaces are separate locations.
- Local folder access uses the File System Access API and requires a supported browser and permission. Chrome and Edge support it on `localhost` or HTTPS.

## Editor features

- Organize notes in folders, nest subpages, mark favorites, and use folder notes. Deleting a note, folder, or selection opens a confirmation dialog; press Escape or click outside it to cancel.
- Add text, headings, lists, tasks, toggles, quotes, callouts, code, dividers, images, simple tables, and two-to-four-column layouts with `/` commands.
- Paste Markdown to convert headings, lists, tasks, quotes, callouts, dividers, fenced code, tables, links, and images into editor blocks.
- Link pages without changing their hierarchy. Page links appear in backlinks and Graph View. Inline links can point to Laplace pages or external URLs.
- Open Graph View to search and navigate page links. Use the Attachments view to browse workspace files and preview images.
- Reorder blocks by dragging them. If a page has no blank trailing line, click the blank space below its last block to add a text block. Press Enter in a page title to add a text block at the beginning of the page.
- Split the editor into panes, move tabs between panes, resize the divider, and drag tabs to reorder them. The layout is saved with the workspace.
- Undo and redo use an in-memory history of up to 100 checkpoints per workspace. Typing is grouped after a short pause; history is cleared when the app reloads.
- Choose system, light, or dark appearance. Keyboard shortcuts can be changed in Settings → Keyboard shortcuts.
- Install Laplace as a PWA. The service worker caches the app shell for offline launch; Mermaid previews are loaded from jsDelivr when needed and require a network connection.

## Keyboard shortcuts

## Standalone build

`index.html` runs the application as a Vite module; Vite bundles global editor styles, CSS Modules and the app shell for production.

## Markdown and code

- VS Code-style tabs: left-click a page to reuse the active tab, middle-click a page to open a new tab, drag to reorder, middle-click a tab to close.

- Page block: create real nested subpages from the slash menu, with normal click navigation and middle-click new-tab navigation.

## Notes folder

Choose a folder from the sidebar footer or Settings → Notes folder. Existing `.md` files are loaded recursively. New notes are saved with their title as the filename; subpages are placed in a matching subfolder. Uploaded and pasted images are saved under `.attachments/` and referenced from Markdown notes. Each local folder is one workspace. Laplace stores fixed configuration files directly in `.laplace/`: `app.json` (identity and general settings), `appearance.json` (theme, fonts and icons), `hotkeys.json` (shortcuts), and `workspace.json` (tabs, panels and note metadata). Git automation uses `git-automation.json` when configured. The previous `config.json` and `workspaces/<vaultId>.json` format is no longer read; Markdown notes and attachments remain usable, but old preferences and layout must be configured again. Use Refresh notes to load changes made by another Markdown editor.

## Git workspace synchronization

Use **Automatic commit settings** in Source Control to enable scheduled local commits, choose an interval from one minute to seven days, and set a message format. The format supports `{workspace}`, `{branch}`, `{date}` and `{time}` placeholders. These settings are saved in `.laplace/git-automation.json` and restored even when Source Control is hidden. Legacy browser settings migrate when the repository has write access. Credentials remain encrypted in browser storage and are never written to the repository. Enable **Auto push** to send pending commits to the remote on each scheduled check, using the saved credentials. Auto push is off by default. Failed pushes preserve local commits and retry on the next check, even without new file changes. Automatic pushes never force-push or apply incoming changes; divergent branches require integration using desktop Git.

The automation keeps a fixed cadence while the workspace is open. Switching panels, focusing the editor, opening settings, or running other Git commands does not restart its countdown. Unsaved edits are flushed before a scheduled check. Checks due while Git is busy or a settings dialog is open run as soon as it becomes available. If the browser suspends timers, one overdue check runs on return, then the original cadence resumes.

Source Control updates automatically after Laplace saves page edits, creations, renames or deletions, and after attachment or folder changes. Filesystem notifications are scoped to the owning workspace and grouped with a short debounce. Background status reads preserve editor focus and open comparisons, and wait for active Git commands to finish. Saves that leave note files unchanged do not trigger a refresh. Changes made outside Laplace still require **Refresh Git changes**.

Open **Git synchronization** in the toolbar after selecting a local folder. Laplace uses `isomorphic-git` directly on the selected directory, including its `.git` objects and index. You can open an existing repository or initialize one on the `main` branch. New repositories ignore `.obsidian/` and `.trash/`; Markdown notes, attachments, settings in `.laplace/` and other non-ignored files are included. Existing repositories keep their ignore rules except for legacy rules that exclude `.laplace/`, which are removed when write access is available so workspace configuration can be versioned. Browser-only workspaces must first be saved to a local folder.

The Source Control panel uses a compact VS Code-style layout: a commit message and split Commit button above collapsible **Staged Changes** and **Changes** groups. These groups reflect the existing Git index, with file-type icons, filenames before dimmed folder paths, count badges and A/M/D/U status markers. Selecting a file opens a read-only comparison tab in the editor, with split/unified views, line numbers, added/deleted line highlights, expandable unchanged context and navigation between changes (Alt+Up/Down). Staged files compare the last commit with the index; pending files compare the index with the working tree. Incoming and outgoing files compare the merge base with remote and local commits respectively. Close the comparison with its tab button or Ctrl/Cmd+W to return to the previous editor view. Comparisons stay in memory and never change the files or Git index. The panel title uses the same uppercase 11px style as the other panels, with 13px body text. Outgoing and incoming commits appear when present.

| Operation                | Behavior                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Refresh Git changes**  | Reads local changes and compares the local branch with the last fetched remote state. It does not contact the remote.                                             |
| **Commit local changes** | Stages all current non-ignored changes, including deletions, and creates a local commit. Ctrl/Cmd+Enter in the message field also commits.                        |
| **Fetch remote**         | Downloads the configured upstream branch and updates incoming/outgoing comparisons without changing workspace files. Available in the ellipsis menu.              |
| **Sync workspace**       | Fetches the upstream branch, checks for divergence, then either receives a clean fast-forward or commits local changes, and pushes pending commits without force. |

Sync is more than commit and push: it also checks and can receive remote changes. Diverged branches, or incoming commits alongside uncommitted local files, stop synchronization and require integration with desktop Git. Local commits remain available if a push fails. The automatic **Auto push** setting sends pending commits after fetching; it never applies incoming files.

Git runs in a worker that is reused when switching panels within the same workspace. Reading repository settings or restoring automation does not scan workspace files. Status updates still check local files each time, but reuse commit history and committed file comparisons until the local or remote commit changes. Opening a diff reads the selected file and its required Git entries instead of calculating the complete repository status again.

Sync performs two full worktree scans when there are no changes, or three when it creates a commit, plus a check limited to the paths being staged. Commit, Fetch and settings changes keep the loaded notes and undo history. A successful Sync reloads notes and resets editor history only when it has applied incoming files; after a failed Sync, the editor reloads conservatively in case files were partially updated. Network latency, repository size and browser filesystem access still affect operation time.

Use **Repository settings** in the panel ellipsis menu to open a dialog for the HTTPS remote, commit author, optional trusted CORS proxy and authentication. Initializing a repository opens this dialog automatically. **Test connection** checks read access using the unsaved URL, proxy and credentials, with success or error feedback and a 15-second timeout. It supports empty repositories and does not save configuration, download objects or change workspace files; it does not verify push permissions. Editing connection fields or closing the dialog cancels the test and clears its result. **Save settings** applies the configuration; Cancel, Escape or closing the dialog discards unsaved edits. Browser Git requires a server that permits CORS or a compatible proxy; SSH is unsupported. Saving Repository settings stores the remote username and token encrypted with AES-GCM in a separate, browser-local IndexedDB database, using a non-extractable browser key. Credentials are scoped to the workspace and normalized repository URL and restored before connecting, including after Ctrl+F5. Changing the remote loads its saved credentials or clears the fields for an unknown repository. Clearing the token and saving removes that credential record; cancelling or testing a connection does not save drafts. Tokens are never written to Git config, workspace files, notes or exports. Saved credentials belong to this browser profile and origin; clearing its site data removes them. Symlinks, submodules, executable files, linked worktrees and unfinished merges/rebases require desktop Git. Manual Git commands pause workspace editing and switching while they run. Background status reads and scheduled commits/pushes keep the editor active.

GitHub's Git endpoints require a proxy for browser access. With **`pnpm dev` on localhost**, GitHub connections automatically use the same-origin `/api/git-proxy` gateway for testing, fetching and pushing; leave **CORS proxy** empty to use it. An explicitly configured proxy takes precedence. The local gateway forwards Git authentication directly to GitHub and restricts requests to Git smart HTTP endpoints on `github.com`, with no credential logging or storage. Restart the development server after updating its configuration. For **static hosting**, configure your own trusted, isomorphic-git-compatible HTTPS proxy in Repository settings; the Vite gateway is not included in static build output. For local `pnpm preview`, it is available by explicitly setting the proxy to the preview origin followed by `/api/git-proxy`.

## Recent editor features

- Expanded page icon emoji catalog.
- Inline emoji picker: type `:` in a text block, optionally continue with a name such as `:fire`, then use arrow keys + Enter or click an emoji.
- Unified editor/sidebar scrollbar styling.
- Contextual inline formatting toolbar for selected text, including block type, colors, bold/italic/underline/strike, inline code, comments, and links.
- Inline Link picker can search existing Laplace pages or attach an external URL; internal inline links participate in backlinks and Graph View.

## Table and Columns

- `/table` inserts a lightweight editable table, separate from the database block.
- `/columns` inserts a two-column layout; switch between 2, 3 and 4 columns from the block control.
- Blocks inside columns retain normal editing, slash commands, block menus and drag/drop behavior.
- Reducing the number of columns moves content from removed columns into the last remaining column instead of deleting it.

## Undo / Redo

The editor keeps an in-memory undo history per vault (up to 100 checkpoints). Continuous typing is grouped into one undo step after a short pause, while structural actions such as adding/removing/moving blocks, changing tables/columns, pages, icons, favorites and tabs create their own checkpoints.

Shortcuts: `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` redo, `Ctrl/Cmd+K` search, `Ctrl/Cmd+Alt+N` new page, `Ctrl/Cmd+Alt+→` split right, `Ctrl/Cmd+Alt+↓` split down, and `Ctrl/Cmd+Alt+Backspace` merge panes. `Ctrl+Y` also redoes on Windows-style keyboards. Open Settings → Keyboard shortcuts to view or change the app shortcuts. Shortcut assignments are saved with each workspace. History is intentionally not persisted across full page reloads.

## Links

- `/link` inserts a compact hyperlink block with editable label and URL.
- URLs without a scheme are normalized to HTTPS when confirmed.
- Supported protocols are HTTP, HTTPS, `mailto:` and `tel:`.
- Use the ↗ action or `Ctrl/Cmd+Enter` while editing the block to open a valid link in a new tab.
- Link blocks can be nested inside Columns and participate in normal drag/drop, duplicate, delete and undo/redo flows.

## Sidebar overflow

The Files/Favorites sidebar keeps vertical overflow disabled unless its current content is actually taller than the available panel. Overflow is recalculated after panel switches, sidebar open/close and window resize.

- Searchable, scrollable page icon picker with external SVG/PNG/JPG/WEBP/GIF/ICO support.

- Mermaid code language with syntax highlighting and live diagram preview. Mermaid 12 is loaded on demand from jsDelivr when a diagram preview is shown.
- Code blocks now follow the active light/dark theme, including syntax colors, toolbar, line numbers and Mermaid preview.
- Paste Markdown into text-like blocks and Laplace converts headings, lists, tasks, quotes, callouts, dividers, fenced code, tables, links and images into native blocks.

## Source layout

- `index.html` — static SPA entry with the Preact root.
- `src/styles/global.css` — global theme variables and shared DOM primitives.
- `src/features/**/components/*.module.css` — scoped feature presentation.
- `src/features/editor/styles/engine.css` — styles for editable blocks and docked editor DOM.
- `src/main.tsx` — Preact application entry point.
- `src/app/` — providers, shell and deferred workspace loading.
- `src/features/` — feature components and preserved editor algorithms.
- `src/store/` — typed Zustand UI state.
- `src/storage.ts` — IndexedDB cache and local directory adapter.
- `src/config.ts` — local storage configuration.
- `pwa-assets/` — install manifest, service worker and app icons.
- `src/mermaid-preview.ts` — Mermaid code-preview utilities.
- `src/app-identity.ts` — Shared app name and identifiers for UI, storage, exports and generated HTML/PWA assets.
- `tsconfig.json` — TypeScript compiler configuration.
- `README.md` — project documentation.

The Vite production build is written to `public/` and can be served by a static hosting provider.

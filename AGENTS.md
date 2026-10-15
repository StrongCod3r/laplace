# Laplace: project instructions and context

This file records stable context to preserve when working on the app. Update it when architecture, storage contracts, or product rules change; always verify the current code. See `docs/client-spa-architecture.md` for more detail and `README.md` for installation.

## Language requirements

All code, code comments, and project documentation must be written in English, including this file. Use English for identifiers, explanations, and documentation added or modified during development. Preserve user-authored note content and proper names in their original language.

## Product and stack

- Laplace is a local-first Markdown notes workspace. It uses a user-selected folder or browser storage, without a notes backend or user authentication.
- Features include a block editor, tables, links and wikilinks, attachments, folders and folder notes, tabs, split editor groups, history, search, a graph, and Git.
- It is a static SPA using Preact 11, TypeScript, Vite 7, and Zustand 5. `react` is an npm alias for `@preact/compat`, used for Zustand compatibility; do not introduce a second React runtime.
- There is no router or SSR. Notes and views use workspace tabs and groups. The workspace is loaded lazily through `lazy` and `Suspense`.
- Styling uses CSS Modules and global theme variables. Tailwind is not used.
- Node.js 22.12 or later is required. Both pnpm and npm are supported; preserve the existing dependency management and lockfiles.

## Code map and state ownership

| Location                                                         | Responsibility                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/main.tsx`, `src/app/App.tsx`                                | Preact startup, lazy loading, and error boundary                |
| `src/app/components/StartupSkeleton.*`                           | Shared skeleton for initial HTML and Preact fallback            |
| `src/features/workspace/pages/WorkspacePage.tsx`                 | Composition of panels, views, and dialogs                       |
| `src/features/editor/services/create-controller.ts`              | Runtime creation, service registration, defaults, and lifecycle |
| `src/features/editor/types.ts`                                   | Controller and runtime contracts                                |
| `src/features/editor/hooks/use-workspace-controller.ts`          | Controller mounting and disposal                                |
| `src/store/workspace.store.ts`                                   | Immutable UI projection in Zustand and controller access        |
| `src/features/*/services/`                                       | Domain logic; many modules register methods on the runtime      |
| `src/features/workspace/services/register.ts`                    | Hydration, permissions, persistence, folders, and registry      |
| `src/features/notes/services/register.ts`                        | Pages, names, tree, and conversions                             |
| `src/features/markdown/services/register.ts`                     | Parser, serializer, frontmatter, and links                      |
| `src/features/editor/services/register.ts`                       | DOM editing, selection, and inline formatting                   |
| `src/features/tables/services/register.ts`                       | Table model, selection, pasting, and editing                    |
| `src/features/interactions/services/register.ts`                 | Keyboard, mouse, dragging, and clipboard                        |
| `src/features/history/services/register.ts`                      | Undo/redo and save scheduling                                   |
| `src/features/navigation/services/register.ts`                   | Tabs, groups, docks, and navigation                             |
| `src/storage.ts`, `src/config.ts`, `src/workspace-config.ts`     | Storage gateway, schema, and configuration separation           |
| `src/features/git/`                                              | Browser Git, worker, synchronization, and UI                    |
| `src/shared/lib/controller-lifecycle.ts`                         | Registration and cleanup of listeners and scheduled tasks       |
| `src/styles/global.css`, `src/features/editor/styles/engine.css` | Global tokens and editable engine presentation                  |

Preact owns the shell, tree, tabs, and panels. The DOM engine owns `contenteditable`, the cursor, selection, floating menus, and split editor contents within hosts without Preact children. Preserve this boundary: shell reconciliation must not replace the DOM of an active selection.

The controller owns the mutable document. Zustand publishes typed UI snapshots; do not persist the entire store or create another editable document competing with the runtime. Writes go through the existing services and gateway.

Some legacy algorithms retain `@ts-nocheck`. Boundaries and new contracts must remain typed; do not assume exhaustive checking of legacy services. Global class names and `data-*` attributes may be engine hooks: preserve them when adding local CSS Module classes. `ui-styles.ts`, `htmlWithStyles`, and `classWithStyles` connect engine-generated HTML to those modules.

For dock events, activate the correct group through `focusEditorGroup` before accessing the page, blocks, or `runtime.els.blockEditor`. Do not accidentally apply an operation to the main editor through references belonging to the wrong pane.

## Persistence: contracts and data protection

The IndexedDB database is `laplace-local-workspace`, version 3, with `meta`, `vaults`, and `attachments` stores. Preserve IDs, registry, handles, and schema compatibility. IndexedDB and permissions depend on the origin (protocol, host, and port); another port does not share browser data.

Each selected folder is an authoritative workspace containing:

```text
notes and subdirectories containing .md files
.laplace/app.json             # spellcheckEnabled and folderNotesEnabled
.laplace/appearance.json      # theme, font, and icons
.laplace/hotkeys.json         # keyboard shortcuts
.laplace/workspace.json       # remaining workspace state
.laplace/git-automation.json  # when Git automation is configured
.attachments/                # attachment files
```

Configuration filenames are fixed and independent of internal IDs. Preserve user frontmatter, aliases, wikilinks, and Markdown formats during reading and serialization. Never replace a folder with defaults or another cache because of denied permissions, missing metadata, or read failures.

Critical persistence rules:

- Keep workspace access in `checking` and the editor blocked during hydration. Enable writes only with a valid location, vault, and baseline.
- `persistStateNow` requires an active runtime, hydrated workspace, `activeVaultId`, `lastSyncedWorkspace`, and writable access; also respect the Git operation reservation.
- Serialize writes through `storageWriteChain`. Revalidate runtime, state, and location after `await` boundaries so an old task cannot write over another workspace.
- `writeMarkdownFiles(files, { allowDeletes })` rejects incomplete sets before writing when `allowDeletes` is false, its default. Do not enable deletions to bypass hydration failures.
- The workspace layer checks omitted pages against the baseline. Confirmed deletions are recorded in `confirmedPageDeletions` and consumed only after a successful save. Moves, conversions, and undo/redo use explicit operation contexts and rollback.
- Remounts, HMR, restarts, and `dispose` must not save empty defaults or interpret pages not yet loaded as deleted. The final save during disposal is allowed only with pending changes and hydrated writable state.
- Reloading a folder must wait for the write queue and retain the access lock while scanning. Report failures and preserve access protection.
- Conversions and deletion operations must preserve their product confirmations, detect collisions, and restore the previous state if persistence fails.

Important historical regression: enabling writes before loading finished and saving during unmount allowed an empty state to delete local Markdown files in bulk. Preserve defenses at both controller and gateway levels. Test these scenarios with isolated data, never the user's actual folder.

## Page, folder, and link rules

- Pages and folders have separate namespaces: `RAG.md` and `RAG/` can coexist. A page conflicts with another page in the same directory; a folder conflicts with another folder under the same parent.
- A folder note can be `RAG/RAG.md` with `folderNote: true` and represents its folder. Use `pageFolderPath`, `implicitPageFolderPath`, and `representedFolderForPage`; do not infer its location solely from the title or `parentId`.
- When renaming a folder note, check the folder name under its parent and the Markdown filename inside its own folder. Do not add counters because of a same-named page in the parent directory.
- Converting `/RAG.md` to a folder when `/RAG/` already exists must choose a free folder name, such as `/RAG 1/RAG 1.md`, preserving the page ID. Never silently merge into the existing folder. Show the actual destination in the confirmation and revalidate it after `await`.
- When converting a folder to a note, preserve contents, children, and unmanaged files, resolve collisions, and retain rollback.
- Inserting a "link to page" block must create and focus a text block immediately afterward without altering later siblings or the nested hierarchy.
- In its search picker, `./` filters by the current page's actual directory and descendants, including folder notes. At the root, it includes the workspace. Exclude the current page; respect path boundaries so `Docs/` does not match `DocsExtra/`, and support queries such as `./Nested/`.

## Editor behaviors to preserve

Undo/redo restores edits while retaining the current note, tabs, pane layout, and scroll position when that note still exists. Restore editor focus and the caret position saved before/after each edit, rather than reusing the position at which undo/redo was invoked. Keep caret metadata in controller memory, outside the workspace document. Keep recording new edits while history persistence is pending. Group consecutive typing separately from deletions, and separate edits in different notes or blocks. Navigation alone must not add undo entries.

The plain text toggle beside Page options displays read-only Markdown using the existing serializer, including user frontmatter. Its state is local to each tab for the controller session. Preserve the editor DOM when toggling and refresh source previews when the same note changes in another pane.

Ctrl/Cmd+A selects the current page body, including all blocks, or its plain text preview. Keep the selection inside the active editor group and exclude application panels. Titles, inputs, code editors, and table cells retain their native local selection. Copying, deleting, and replacing a selected page body must preserve block content and undo/redo.

The inline emoji picker requires a letter immediately after `:` (for example, `:s`). A bare colon or whitespace within the token must not open the picker; returning to either state must hide it.

Typing a Markdown list prefix at the beginning of existing text must convert the block when the prefix is completed. Preserve the remaining text, inline formatting, links, and caret position, and support undo/redo of the conversion.

Cutting or deleting all text from a list item must leave a single empty line. Browser-inserted `<br>` placeholders must not increase its height; preserve intentional continuation lines and native editing behavior.

Backspace at the start of a list continuation, or Shift+Tab after removing any explicit indentation, detaches that continuation and its following lines into ordinary text. Preserve surrounding list items, inline formats, links, wikilinks, caret history, and Markdown round trips in both main and split editors.

For a nonempty list item, Backspace at its start or Shift+Tab on its first line reduces one nesting level. At the root level it removes the marker and converts the item to ordinary text, preserving its ID and inline metadata without merging adjacent items. Nested outdenting keeps descendant indentation relative to the item.

Tab on an ordinary text block immediately after a list item attaches that text as a continuation of the preceding item, equivalent to Shift+Enter. Preserve inline formatting, links, wikilinks, caret offsets, remaining siblings, undo/redo, and Markdown persistence. Shift+Tab reverses the attachment by detaching the continuation.

Serialized numbered lists use consecutive markers matching the editor, with independent counters per nesting level. Continuation lines do not advance the counter, and their indentation follows the actual marker width, including multi-digit numbers. Apply this to saved Markdown and the plain text view.

Gutter block reordering normalizes list indentation in the affected source and destination containers. A list item moved to the beginning, or after a non-list block, starts at the root level; no item may skip more than one nesting level relative to the preceding list item. Preserve the original structure through undo/redo.

### Clipboard and tables

- The clipboard event contents are the source of the current paste. A private cache from another page or an earlier copy cannot override them; undo/redo must not alter this contract.
- The image block cache is valid only when its token matches the `application/x-laplace-image-block` MIME token in the current event. Copying from the gallery writes the corresponding content to the system clipboard.
- Tables store text in `tableRows` and inline metadata in `tableCellInline`. Preserve formatting and link ranges during HTML pasting, editing, and serialization; TSV text alone does not preserve styles.
- Detect HTML tables before Markdown fallback or single-link detection. A link inside a table must not turn the entire table into a link block.
- Pasting cells may expand the matrix; preserve neighboring cells and line breaks. Plain-text replacement clears old formatting in the replaced cells.
- Cell links must open the floating panel in the correct editor. When changing a link label, update the matrix text as well as link metadata so the change persists.
- With the entire table selected, Delete removes the block and supports undo/redo. With a cell range selected, it clears cell contents and retains the table. Respect read-only mode.

### Selection and floating panels

- The toolbar appears for both single-block selection and text spanning multiple blocks, through native DOM selection or custom drag selection.
- For multiple blocks, apply formatting, color, clearing, or block type changes to all selected segments while respecting partial boundaries in the first and last segments. Commit the change as one history operation.
- A format appears active when all segments have it. Toggling a mixed selection applies it uniformly; remove it when all segments already have it. Link editing requires a single fragment.
- After rendering, rebuild DOM references, selection, and highlights; interacting with the toolbar must not clear the selection being formatted.
- `inlineSelectionViewportRect` recalculates geometry and clips against the viewport and overflow ancestors, including docks and horizontal table scrolling. On scroll, reposition panels and hide them when no selected text remains visible; retain the state needed to show them again when returning.

### Navigation and performance

Page or tab switching should avoid work proportional to the entire workspace content. Preserve batched snapshot publication and tab updates. Navigation changes use `scheduleSave('view')` to avoid cloning all notes or adding content entries to undo/redo. Do not scan attachments during navigation when the view does not need them.

## Preferences and styles

`spellcheckEnabled` and `showCustomPageIcons` are disabled by default for new workspaces and when the property is absent. Preserve an explicitly saved `true` value. Keep controller defaults, the workspace factory, and normalization consistent.

Use theme variables and check light and dark themes. Keep global states toggled by the engine (`hidden`, `active`, `selected`, `dim`, `collapsed`) compatible with CSS Modules.

Lay out Files, Favorites, and Git as a static header above a separate scrollable content container. Headers must remain outside the scroll container; do not use sticky positioning. Keep header actions and Git progress indicators outside the scrolling content.

The Files, Favorites, and Git ribbon buttons toggle their associated left panel: clicking the visible panel's button hides the sidebar; clicking another panel's button opens that panel. There is no separate left sidebar toggle button in the ribbon.

## Theme-aware scrollbars

Every scrollable view, panel, menu and dialog must style its scrollbar using the current theme variables (for example, `var(--muted)`), including overlays rendered through portals. Follow the existing thin scrollbar style with a transparent track and rounded thumb, and cover both `scrollbar-width` / `scrollbar-color` and `::-webkit-scrollbar` selectors, including hover and corner states. Check light and dark themes when adding or changing a scrollable container.

## Git, PWA, and build output

- Git uses `isomorphic-git` on the selected directory. Reuse the worker per repository and serialize requests; a direct fallback exists when Worker is unavailable or the handle cannot be cloned.
- Use `repositoryInfo()` for configuration, references, and startup without traversing files. `status()` must detect external edits; history comparison caching depends on local/remote OIDs rather than stale file state.
- Commit saves locally; Fetch downloads references and objects; Sync protects local changes and divergence, applies a clean fast-forward, and pushes commits without force-push.
- Manual commands reserve the workspace and drain the save queue. Reload notes when Sync updates the working tree, or conservatively if it fails; Commit/Fetch without file changes must not unnecessarily reset the editor or its history.
- The Vite Git proxy is for development and is not part of the static site.
- The default Vite base is `/laplace/`. Use `BASE_URL` for assets and deployment-dependent paths; verify the actual repository name when configuring GitHub Pages.
- PWA resource sources live in `pwa-assets/`. The build writes to `public/`, including hashed assets, `.vite/manifest.json`, and `sw.js`; these files are versioned. Hash changes may delete old assets: distinguish them from user Markdown files and review the diff.
- The PWA registers in production, keeps HTML and assets from the same version together, and caches lazy chunks when requested. Private notes remain in their storage, not in Cache Storage.

## Verification and workflow

```bash
npm run dev           # Vite, port 3000
npm run typecheck     # TypeScript without emitting
npm test              # tests/unit/*.test.mjs, Node test runner
npm run build         # TypeScript and Vite build to public/
npm run preview       # Serve the build
npm run test:e2e      # TypeScript, build, and Playwright
npm run format:check  # Prettier check only
```

The pnpm equivalents are also available. Run checks proportionate to the change. Documentation changes only require accuracy, formatting, and diff checks; rebuilding the site is unnecessary. Avoid running `npm run format` across the entire repository for a localized change.

Playwright uses one worker, Edge on Windows, a development server on `4175`, and preview on `4176`. Some tests explicitly target preview and require a current build. Respect the Vite base: build browser module import paths from the current URL instead of assuming `/src/` at the root. Check reused servers before interpreting failures involving paths or stale code.

Folder tests simulate `showDirectoryPicker` using OPFS handles and isolated data. `tests/fixtures/remount.tsx` supports remount testing without flushing to reproduce lifecycle/HMR scenarios. Wait for `controller.flush()` when verifying persistence; after reloading, explicitly open the note being checked unless the test concerns tab restoration.

Regression references:

| Area                     | Tests                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Save and reload safety   | `tests/unit/workspace-save-safety.test.mjs`, `tests/e2e/workspace-reload-safety.spec.ts`                                          |
| Schema and configuration | `tests/unit/storage-schema.test.mjs`, `tests/unit/workspace-config.test.mjs`                                                      |
| Names and conversions    | `tests/e2e/note-folder-names.spec.ts`, `folder-note-rename.spec.ts`, `page-to-folder-collision.spec.ts`, `folder-to-note.spec.ts` |
| Link to page             | `tests/e2e/page-link-picker.spec.ts`, `page-link-drop.spec.ts`                                                                    |
| Clipboard and tables     | `tests/e2e/clipboard-freshness.spec.ts`, `table-clipboard.spec.ts`, `table-link-edit.spec.ts`                                     |
| Selection and toolbar    | `tests/e2e/multiblock-format.spec.ts`, `selection-toolbar-scroll.spec.ts`                                                         |
| Navigation               | `tests/e2e/navigation-performance.spec.ts`                                                                                        |
| Git and production       | `tests/unit/git-sync.test.mjs`, `tests/e2e/git-sync.spec.ts`, `git-worker.spec.ts`, `production.spec.ts`                          |

Before editing, inspect `git status` and preserve existing changes made by others. Do not test destructive operations with personal data, reset storage to hide errors, or edit generated bundles instead of source code. Maintain idempotent cleanup of lifecycle resources, object URLs, and pending confirmations.

If `.codegraph/` exists at the root, use CodeGraph before searching or reading code to locate symbols and understand call paths (`codegraph_explore` or `codegraph explore`). Otherwise, use `rg` and `rg --files`; do not create an index unless the user requests it.

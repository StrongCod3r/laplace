# Laplace client SPA architecture

Laplace is a local-first Markdown workspace built with Preact 11, TypeScript,
Vite 7, and Zustand 5. It runs in the browser without SSR, a router, or a notes
backend. Vite builds the static site into `public/`. The optional GitHub OAuth
and Git gateway is deployed separately; Vite supplies a Git proxy for development.

## Code map

| Location                                                     | Responsibility                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `src/main.tsx`, `src/app/App.tsx`                            | Startup, error boundary, and lazy workspace loading          |
| `src/app/components/`                                        | Ribbon and shared startup skeleton                           |
| `src/app/providers/pwa.ts`                                   | Production service worker registration                       |
| `src/store/workspace.store.ts`                               | Immutable UI projection and active controller                |
| `src/features/workspace/`                                    | Composition, hydration, permissions, and persistence         |
| `src/features/editor/`                                       | DOM editor, controller, hooks, and editor styles             |
| `src/features/notes/`                                        | Pages, folders, tree, favorites, and context panels          |
| `src/features/navigation/`                                   | Tabs, editor groups, and navigation history                  |
| `src/features/history/`                                      | Undo/redo, caret context, and save scheduling                |
| `src/features/markdown/`                                     | Parsing, serialization, frontmatter, links, and shortcuts    |
| `src/features/tables/`                                       | Table model, selection, clipboard, and editing               |
| `src/features/code/`                                         | Highlighting, Mermaid, and display math blocks               |
| `src/features/math/`                                         | KaTeX rendering, source syntax, clipboard, and inline editor |
| `src/features/graph/`                                        | Canvas scene, graph model, and ownership family layout       |
| `src/features/git/`                                          | Browser Git, worker, credentials, synchronization, and UI    |
| `src/features/attachments/`                                  | Gallery, image presentation, references, and cleanup         |
| `src/features/commands/`                                     | Slash commands, search, icons, and emoji                     |
| `src/features/interactions/`                                 | Keyboard, dragging, clipboard, and selection                 |
| `src/features/settings/`, `src/features/dashboard/`          | Preferences, shortcuts, dialogs, and home view               |
| `src/shared/lib/`                                            | Lifecycle, CSS class helpers, and workspace file events      |
| `src/config.ts`, `src/workspace-config.ts`, `src/storage.ts` | Storage configuration, settings separation, and gateway      |

Features contain components, hooks, services, and types as needed. `WorkspacePage`
composes panels, views, and dialogs. Components subscribe to small Zustand
selectors. `react` is an npm alias for `@preact/compat` to satisfy Zustand's peer
dependency; do not introduce another React runtime.

## DOM and state ownership

Preact owns the shell, file tree, tabs, home view, gallery, context panels, and
dialog hosts. The DOM engine owns `contenteditable`, text selection, floating
menus, and split editor contents inside hosts without Preact children. Shell
reconciliation must preserve the DOM containing an active editor selection.

`useWorkspaceController` creates the controller after mounting and disposes it on
unmount. Initialization is deferred to a microtask so a cancelled mount does not
open IndexedDB or register events. `ControllerLifecycle` tracks listeners, timers,
and animation frames with idempotent cleanup. Disposal also releases attachment
object URLs, pending confirmations, equation sessions, and Mermaid viewers. A
final save is attempted only for pending changes with writable access, an active
vault, and a synchronized baseline; persistence revalidates its own guards.

The controller owns the mutable document. `workspace.store.ts` publishes typed,
immutable UI snapshots rather than another editable document. Writes go through
feature services and the storage gateway. Batched publication and view-only save
scheduling keep navigation from cloning all notes or creating content history.
Caret metadata, tab recency, closed-tab history, and graph camera state remain
session-local rather than part of the saved document.

The [runtime inventory](migration-inventory.json) is used by
`tests/unit/feature-inventory.test.mjs` to verify registered algorithms and runtime
dependencies. It is a live test input and must stay aligned with registration.
Some legacy services retain `@ts-nocheck`; new modules, controller contracts,
hooks, and UI models must remain typed.

## Styles and generated UI

Components use CSS Modules. Global tokens and shared primitives live in
`src/styles/global.css`; editor content, tables, columns, code, and split panes use
`src/features/editor/styles/engine.css`. Vite generates local `nv_…` class names.

Semantic classes and `data-*` attributes can be engine hooks. Keep them alongside
local presentation classes. `withModuleClasses` handles JSX; `ui-styles.ts`,
`htmlWithStyles`, and `classWithStyles` connect engine-generated HTML to those
modules. Engine states such as `hidden`, `active`, `selected`, `dim`, and
`collapsed` remain global where required.

Use theme variables for light and dark themes, including thin scrollbars in
panels, menus, dialogs, and portal overlays. Files, Favorites, and Git headers sit
outside scrolling content. Shared toolbar heights and editor offsets come from
workspace CSS variables.

## Storage and data protection

IndexedDB uses database `laplace-local-workspace`, version 3, with `meta`, `vaults`,
and `attachments` stores. Preserve IDs, registry entries, handles, and schema
compatibility. Storage modes are:

- Browser storage backed by IndexedDB.
- Local workspaces backed by a user-selected folder.
- Git web workspaces backed by isolated `laplace-web/web_<UUID>` OPFS directories.

Folder and OPFS workspaces use this filesystem layout:

```text
workspace/
├── notes and subdirectories containing .md files
├── .laplace/
│   ├── app.json                 # Spellcheck and folder-note settings
│   ├── appearance.json          # Theme, font, and icons
│   ├── hotkeys.json             # Keyboard shortcuts
│   ├── workspace.json           # Remaining workspace state
│   └── git-automation.json      # Present when Git automation is configured
└── .attachments/                # Attachment files
```

The selected folder is authoritative. Denied permissions, missing metadata, or
read failures must never replace its contents with defaults or another cache.
Hydration keeps access in `checking` and editing blocked until a valid location,
vault, and baseline are available.

`persistStateNow` requires an active, hydrated, writable runtime with an active
vault and `lastSyncedWorkspace`, and respects Git reservations. Writes run through
`storageWriteChain` and revalidate state and location after asynchronous work.
The gateway rejects incomplete Markdown file sets by default. Confirmed deletions
are consumed only after a successful save; moves and conversions retain collision
checks and rollback. Reloading drains writes and keeps access locked while
scanning. Remounts, HMR, and disposal must not save an empty initial state over an
existing workspace.

IndexedDB, OPFS, and folder permissions belong to the site origin and browser
profile. Changing protocol, hostname, or port changes access to browser data.
OPFS uses origin-granted access; local folders use browser permission requests
initiated through user actions.

Markdown parsing and serialization preserve user frontmatter, aliases, wikilinks,
inline metadata, and attachment references. Pages and folders have separate
namespaces. Folder-note locations use the existing path helpers rather than title
or parent ID alone. Image presentation is stored in a `laplace:image` JSON HTML
comment below the image. See [AGENTS.md](../AGENTS.md) for detailed product and
persistence rules.

## Diagrams, math, and graph rendering

Mermaid blocks use bundled, lazily loaded Pele through
`src/features/code/services/mermaid-renderer.ts`. Authored directions and theme
variables are preserved. Previews support local pan and zoom; wheel zoom is
reserved for the fullscreen viewer. SVG exports resolve theme variables and
exclude navigation transforms. Preview is the default display mode; an explicit
Code, Preview, or Split choice is retained.

Math uses bundled KaTeX and fonts. Inline formulas retain their source in editable
text and render generated output in shadow roots to preserve selection offsets.
Clipboard serialization uses the original source. The inline equation editor
validates its source context and writable access before applying one history
operation. LaTeX blocks share the code display controls, retain authored
delimiters, and support SVG downloads with embedded fonts.

`GraphView` owns the shell; `GraphScene` owns a `force-graph` canvas and D3 physics.
It copies model nodes and edges before simulation and preserves positions across
metadata changes. Actual page parents and enabled folder-note ownership define
hierarchy edges; references remain separate links. Families use stable scene-local
colors, labeled circles, and collision separation. The initial fit runs after
warmup before painting; later navigation preserves the camera. The scene handles
focus, fit, zoom, modified-click navigation, and keyboard actions. Hidden scenes
pause animation; disposal removes the instance and observers.

## Git operations

`isomorphic-git` runs on the workspace directory. `git-worker-client.ts` reuses one
worker per repository; `git.worker.ts` serializes requests and computes line diffs
outside the UI thread. A direct adapter is available when Worker support or handle
cloning is unavailable.

`repositoryInfo()` reads configuration and references without traversing files.
Use it for startup, settings, and restoring automation. `status()` checks local
files on every request; history comparisons are cached by local and remote OIDs.
File previews restrict reads to the selected path rather than requesting full
repository status.

Commit saves locally; Fetch downloads objects and references. Sync protects local
changes and divergent history, applies a clean fast-forward when possible, and
pushes pending commits without force-push. Before the first local commit, Sync can
import remote history while preserving nonconflicting local files and Laplace
settings. Path collisions and staged changes stop that import. Commit & Push uses
the guarded push operation; Commit & Sync uses synchronization.

Manual commands reserve the workspace and drain saves. `endGitOperation(false)`
restores access without reloading notes for operations that did not change files.
Sync reports `worktreeUpdated` when remote files were applied, requiring a reload
and history reset; failures reload conservatively. Background status reads and
automatic commits and pushes keep editing available.

OAuth and manual tokens share encrypted repository-scoped credentials. Local
development on loopback origins automatically uses Vite's Git proxy; an explicit
repository proxy takes precedence. Production network operations need the optional
service or a configured CORS proxy. See [GitHub setup](github-web-workspaces.md)
for configuration and deployment.

## Startup, PWA, and deployment

`main.tsx` renders `App`, which lazily imports the workspace with `Suspense`.
Initial HTML and the Preact fallback share `StartupSkeleton.html` and its styles;
Vite inserts the skeleton before JavaScript loads. The global error boundary
handles render and lazy import failures. Storage errors and permissions use
workspace notices without replacing user data.

The service worker registers only in production. Its version derives from Vite's
manifest and the worker template. It keeps HTML and assets from one build together,
precaches startup and installation resources, and caches lazy chunks when
requested. Private notes stay in their storage rather than Cache Storage.

`pwa-assets/` contains source assets. `public/` contains versioned build output,
including `.vite/manifest.json`, `sw.js`, icons, and hashed chunks. Edit source and
rebuild when application code changes; do not edit generated bundles manually.

- Netlify: build with `pnpm build` and publish `public/`; `_redirects` supplies the
  SPA fallback.
- Vercel: `vercel.json` sets the build, output directory, and SPA fallback.
- GitHub Pages: build with `pnpm build --base=/YOUR-REPOSITORY/`, run
  `pnpm prepare:pages`, and publish `public/`. The helper creates `404.html`;
  Pages retains its HTTP 404 status for fallback routes. Match the repository
  path's case. The default Vite base is `/laplace/`.

Deployment workflows are not included in this repository. The package also
provides `npm run deploy` using `gh-pages`; for a custom base or the Pages fallback,
prepare the build explicitly and publish it with `pnpm exec gh-pages -d public`.
Use `BASE_URL` for deployment-dependent asset paths.

## Verification

```bash
npm run typecheck
npm test
npm run test:e2e
npm run format:check
```

Equivalent pnpm commands are available. Unit tests use Node's test runner. Browser
tests use Playwright with one worker, Edge on Windows and Chromium elsewhere, with
development on port `4175` and preview on `4176`. `test:e2e` typechecks and builds
first. Install the appropriate Playwright browser before running browser tests.

Tests use isolated data and OPFS handles rather than personal folders. Coverage
includes persistence guards, Markdown round trips, clipboard behavior, history,
navigation, graph rendering, math, Git workers and synchronization, and offline
startup. `tests/fixtures/remount.tsx` supports lifecycle regressions. Wait for
`controller.flush()` when asserting persistence. Check reused servers for stale
builds and respect the configured Vite base.

Documentation-only changes require accuracy, formatting, and diff checks. Code
changes also require checks appropriate to the affected behavior. Run formatting
on changed files rather than rewriting the whole repository.

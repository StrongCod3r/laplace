# Laplace: project instructions and context

This file records stable context to preserve when working on the app. Update it when architecture, storage contracts, or product rules change; always verify the current code. See `docs/client-spa-architecture.md` for more detail and `README.md` for installation.

## Language requirements

All code, code comments, and project documentation must be written in English, including this file. Use English for identifiers, explanations, and documentation added or modified during development. Preserve user-authored note content and proper names in their original language.

## Product and stack

- Laplace is a local-first Markdown notes workspace. It uses a user-selected folder, browser storage, or a GitHub web workspace in OPFS, without a notes backend. Optional GitHub OAuth authorizes repository access.
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
| `src/features/graph/`                                            | Canvas graph scene, D3 physics, and ownership families          |
| `src/features/math/`                                             | KaTeX rendering, formula source, clipboard, and inline editor   |
| `src/shared/lib/controller-lifecycle.ts`                         | Registration and cleanup of listeners and scheduled tasks       |
| `src/styles/global.css`, `src/features/editor/styles/engine.css` | Global tokens and editable engine presentation                  |

Preact owns the shell, tree, tabs, and panels. The DOM engine owns `contenteditable`, the cursor, selection, floating menus, and split editor contents within hosts without Preact children. Preserve this boundary: shell reconciliation must not replace the DOM of an active selection.

The controller owns the mutable document. Zustand publishes typed UI snapshots; do not persist the entire store or create another editable document competing with the runtime. Writes go through the existing services and gateway.

Some legacy algorithms retain `@ts-nocheck`. Boundaries and new contracts must remain typed; do not assume exhaustive checking of legacy services. Global class names and `data-*` attributes may be engine hooks: preserve them when adding local CSS Module classes. `ui-styles.ts`, `htmlWithStyles`, and `classWithStyles` connect engine-generated HTML to those modules.

`docs/migration-inventory.json` is an active input to `tests/unit/feature-inventory.test.mjs`, not an obsolete migration artifact. Keep its function lists and total aligned with the feature registration modules.

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

Toggle list blocks are no longer offered by the editor. Normalize legacy toggles to ordinary text followed by their children in reading order, recursively, including closed toggles. Preserve block IDs, inline metadata, attachments and child blocks; never discard hidden content.

The initial Getting Started note contains examples of every block type, including Mermaid, inline math, display LaTeX, an embedded image, and a working child page and page link. Seed it only through the existing new-workspace initialization; never replace an existing user's note with updated examples.

Newly added empty local workspaces and newly created vaults start with no pages or tabs; do not create an automatic Untitled note. Preserve the initial Browser storage Getting Started experience and existing user notes, including notes named Untitled.

Blockquotes support nested levels with `>>`, `>>>`, and spaced `> >` markers. Keep each quote block's `quoteDepth` through Markdown/HTML import, rendering, copying, and serialization. Tab and Shift+Tab adjust quote depth without losing inline metadata; render a guide for each nesting level.

When Tab or Shift+Tab is used on a later line of a multiline quote, split at the start of that line and change only that line and the following lines in the block. Preserve earlier lines at their depth, inline ranges, caret history, and Markdown round trips.

Heading blocks support H1 through H6 in the slash menu, formatting toolbar, outline, typing shortcuts, and Markdown/HTML import and export. H4, H5, and H6 use 18 px, 16 px, and 14 px heading styles respectively.

Mermaid syntax is rendered by bundled, lazily loaded Pele without a CDN dependency. Keep theme colors connected through `--pele-*` variables and resolve them in standalone SVG downloads. Preserve authored diagram directions and the existing navigation controls.

Mermaid code blocks default to Preview display, including imported Markdown and blocks switched to the Mermaid language. Preserve an explicitly selected Code, Preview, or Split display mode.

Mermaid previews support pointer dragging, zoom buttons, and keyboard navigation. Wheel zoom is enabled only in the fullscreen viewer; in a block preview, the wheel retains normal page scrolling. Keep zoom and pan local to each preview, retain them when preserving its DOM during unrelated edits, and exclude navigation transforms from Markdown and SVG exports. Reset restores 100% zoom and the original position.

The Mermaid fullscreen viewer fits the diagram to the window and supports the same navigation controls. Close it with Escape or its close button, restore the source preview's SVG, zoom, pan and focus, and remove the modal during controller disposal. Keep SVG IDs unique while the viewer is open.

Math uses bundled KaTeX, including its fonts, without a network dependency. Inline `$...$` and `\(...\)` retain their original source in the document and editable DOM; generated math lives in a shadow root to preserve text and selection offsets. Native selections containing inline math must write clipboard text and HTML from the original source, excluding generated KaTeX output and retaining neighboring formatting and line breaks. Keep formulas rendered while editing surrounding text; reveal source when the caret enters a formula and refresh direct source edits after leaving the paragraph. The Inline equation slash command, formatting toolbar action, and equation click open a session-local editor with live preview, validation, apply, cancel, and removal. Apply only after revalidating the original vault, note, editor group, source text, and writable access; preserve surrounding inline metadata and commit one history operation. The slash command works at a word boundary inside paragraphs and table cells, replaces only the command token through the caret, and preserves both surrounding text segments. Keep block conversions restricted to whole-block commands; URLs, file paths, inline code, and formulas must not trigger the inline slash menu. Use the bundled Radical icon for Inline equation. Cancel and navigation must not change the document. Code blocks with `latex` (including imported `tex`, `math`, and `katex` aliases) show a live display preview; accept optional surrounding `$$...$$` or `\[...\]` delimiters for rendering without changing the stored source. LaTeX blocks start in Preview, retain an explicitly selected Code, Preview, or Split mode in `mathViewMode`, and share the display controls with Mermaid. The formula download exports SVG with embedded fonts. Imported `$$` blocks retain their delimiters when saved. Preserve LaTeX commands, braces, subscripts, and escaped dollars through Markdown parsing and serialization; inline code remains literal. Invalid formulas show their source without breaking the editor.

Undo/redo restores edits while retaining the current note, tabs, pane layout, and scroll position when that note still exists. Restore editor focus and the caret position saved before/after each edit, rather than reusing the position at which undo/redo was invoked. Keep caret metadata in controller memory, outside the workspace document. Keep recording new edits while history persistence is pending. Group consecutive typing separately from deletions, and separate edits in different notes or blocks. Navigation alone must not add undo entries.

Duplicating a page records its creation as a separate content history operation before opening the copy. Deleting or replacing the copy's body must be independently undoable without removing the duplicated page; a subsequent undo may reverse the duplication itself.

The plain text toggle beside Page options displays read-only Markdown using the existing serializer, including user frontmatter. Its state is local to each tab for the controller session. Preserve the editor DOM when toggling and refresh source previews when the same note changes in another pane.

Ctrl/Cmd+A selects the current page body, including all blocks, or its plain text preview. Keep the selection inside the active editor group and exclude application panels. Titles, inputs, code editors, and table cells retain their native local selection. Copying, deleting, and replacing a selected page body must preserve block content and undo/redo.

The inline emoji picker requires a letter immediately after `:` (for example, `:s`). A bare colon or whitespace within the token must not open the picker; returning to either state must hide it.

Typing a Markdown list prefix at the beginning of existing text must convert the block when the prefix is completed. Preserve the remaining text, inline formatting, links, and caret position, and support undo/redo of the conversion.

Cutting or deleting all text from a list item must leave a single empty line. Browser-inserted `<br>` placeholders must not increase its height; preserve intentional continuation lines and native editing behavior.

Backspace at the start of a list continuation, or Shift+Tab after removing any explicit indentation, detaches that continuation and its following lines into ordinary text. Preserve surrounding list items, inline formats, links, wikilinks, caret history, and Markdown round trips in both main and split editors.

For a nonempty list item, Backspace at its start or Shift+Tab on its first line reduces one nesting level. At the root level it removes the marker and converts the item to ordinary text, preserving its ID and inline metadata without merging adjacent items. Nested outdenting keeps descendant indentation relative to the item.

Tab on the first line of a marked list item increases its nesting level while preserving its marker, including empty items created with Enter. Keep empty list items through Markdown reloads. Shift+Enter creates unmarked continuation lines.

Tab on an ordinary text block immediately after a list item attaches that text as a continuation of the preceding item, equivalent to Shift+Enter. Preserve inline formatting, links, wikilinks, caret offsets, remaining siblings, undo/redo, and Markdown persistence. Shift+Tab reverses the attachment by detaching the continuation.

Tab also attaches multiple selected ordinary text blocks as continuations in one operation. When invoked from a later text block in a consecutive run below a list item, include the preceding text blocks in that run through the focused block. Do not consume unselected following blocks or cross a different block type.

Serialized numbered lists use consecutive markers matching the editor, with independent counters per nesting level. Continuation lines do not advance the counter, and their indentation follows the actual marker width, including multi-digit numbers. Apply this to saved Markdown and the plain text view.

Numbered lists continue across image blocks and empty text blocks; nonempty paragraphs and other block types separate sequences. Typing a numbered prefix such as `1.` before existing text converts immediately without requiring a space, including when the text has continuation lines. An optional space typed immediately after conversion is consumed as part of the marker.

Gutter block reordering normalizes list indentation in the affected source and destination containers. A list item moved to the beginning, or after a non-list block, starts at the root level; no item may skip more than one nesting level relative to the preceding list item. Preserve the original structure through undo/redo.

### Clipboard and tables

The fullscreen image viewer navigates image blocks in the source note's reading order with arrow keys: Left/Up for previous and Right/Down for next. Stop at the first and last image, reset zoom and pan on image changes, and retain the source note context across split panes.

- Pasting over native or custom selections of text and blocks replaces the selection in one history operation, preserving unselected boundary text and inline metadata in main and split editors. Keep ordinary inputs, code editors, and table cells on their local paste paths. Save pasted image files successfully before replacing selected content, and revalidate the workspace, note, pane, and selection after asynchronous attachment writes.

- Rich HTML fragments with inline code, emphasis, or links remain in the same paragraph. Group consecutive inline siblings when importing HTML, and insert a single pasted paragraph into the current text block at the selection, retaining surrounding text, spaces, inline metadata, block identity, and undo/redo. Structural HTML elements still delimit separate blocks.

The Attachments gallery filters filenames and path suffixes using case-insensitive file patterns: `*` matches within a path segment, `?` matches one character, and `**` spans folders. Separate patterns with `;` to match any of them, for example `*.svg;*.png`. Trim surrounding whitespace and ignore empty entries; an empty pattern list shows all attachments. Other punctuation is literal; the filter does not accept regular expressions.

The Attachments gallery header and pagination footer remain outside the scrollable gallery content. Keep pagination visible at the bottom while scrolling; changing the page or filter resets the content scroll position.

While an image preview is open, consume wheel events before they reach the underlying workspace. Gallery previews must not scroll the background; fullscreen note image previews retain wheel zoom. Restore normal scrolling immediately after closing the preview.

- Pasting an image file or a copied image block into an empty ordinary paragraph replaces that paragraph in place, preserving its block ID and surrounding blocks. Nonempty paragraphs remain intact, and image presentation metadata and undo/redo must be preserved.

- Store image presentation in a JSON HTML comment immediately below the image: `<!-- laplace:image: {"width":313,"align":"right","crop":{...}} -->`. Width, alignment, and the full reversible crop settings belong there; do not read or write width suffixes in image labels. Omit default presentation, keep captions and attachment references, and preserve malformed, unsupported, or detached comments as ordinary note content.

- Rich text pasted into H1–H6 adopts the destination heading's font and size. Sanitize external presentation while retaining supported inline formats and links; textual paragraphs remain in the heading, and tables and images retain their existing block paste behavior.

- The clipboard event contents are the source of the current paste. A private cache from another page or an earlier copy cannot override them; undo/redo must not alter this contract.
- The image block cache is valid only when its token matches the `application/x-laplace-image-block` MIME token in the current event. Copying from the gallery writes the corresponding content to the system clipboard.
- Tables store text in `tableRows` and inline metadata in `tableCellInline`. Preserve formatting and link ranges during HTML pasting, editing, and serialization; TSV text alone does not preserve styles.
- Detect HTML tables before Markdown fallback or single-link detection. A link inside a table must not turn the entire table into a link block.
- Pasting cells may expand the matrix; preserve neighboring cells and line breaks. Plain-text replacement clears old formatting in the replaced cells.
- Cell links must open the floating panel in the correct editor. When changing a link label, update the matrix text as well as link metadata so the change persists.
- With the entire table selected, Delete removes the block and supports undo/redo. With a cell range selected, it clears cell contents and retains the table. Respect read-only mode.

### Selection and floating panels

- Native editor text and painted selection overlays share `--editor-selection-background`. Keep block highlights borderless, preserve the corner radii of rounded block surfaces, and constrain their horizontal bounds to the editor content column so padded callouts cannot protrude. The drag rectangle is a transparent guide, avoiding a second fill over selected blocks.
- Selected rendered inline formulas receive a borderless highlight based on the selected LaTeX source, for native and cross-block ranges, table cells, and page-body selection. Clip highlights to the active pane, refresh them on scroll, resize, and font loading, and remove them when the selection collapses. Keep generated KaTeX output outside editable text and clipboard serialization.
- The toolbar appears for both single-block selection and text spanning multiple blocks, through native DOM selection or custom drag selection.
- For multiple blocks, apply formatting, color, clearing, or block type changes to all selected segments while respecting partial boundaries in the first and last segments. Commit the change as one history operation.
- Deleting a selection spanning paragraphs removes every complete block between its endpoints, including images, Link to page blocks, tables, dividers, code, and Mermaid or LaTeX previews. Support native and custom drag selections in main and split editors; preserve unselected boundary text, surrounding blocks, and undo/redo. Removing an image or page-link block must retain the attachment file and linked page.
- Highlight all selected nontext blocks for native and custom selections. Dragging from editor margins or noneditable block surfaces draws a rectangular selection of intersecting blocks, independent of text boundaries. Preserve native text, code, caption, and table-cell editing, gutter dragging, image resize controls, and Mermaid panning. Keep rectangle geometry and selected IDs session-local, clip overlays to the originating pane, retain selected content during auto-scroll, and support copy, cut, Delete, Escape, and undo/redo without activating links on drag release. Clear overlays, listeners, and animation frames on cancellation, navigation, and disposal.
- A drag starting in text includes each nontext block as soon as the pointer enters it, in either direction. A structural block can be the final selection endpoint without a later paragraph. Reversing the drag shrinks the selection immediately; copying, formatting, deleting, and undo/redo retain the same endpoints and partial paragraph boundaries.
- A format appears active when all segments have it. Toggling a mixed selection applies it uniformly; remove it when all segments already have it. Link editing requires a single fragment.
- After rendering, rebuild DOM references, selection, and highlights; interacting with the toolbar must not clear the selection being formatted.
- `inlineSelectionViewportRect` recalculates geometry and clips against the viewport and overflow ancestors, including docks and horizontal table scrolling. On scroll, reposition panels and hide them when no selected text remains visible; retain the state needed to show them again when returning.

### Navigation and performance

Outline navigation focuses the destination heading without scrolling before starting a smooth, centered scroll from the current position. Preserve this behavior in main and split editors; focus and caret placement must not interrupt the animation.

Closing the active tab returns to the most recently visited open tab in the same editor group, including Graph and Attachments views, before falling back to another group. Track tab recency per vault in controller memory, outside the saved workspace document.

In the page search palette, Ctrl/Cmd+Enter or Ctrl/Cmd+click opens the selected page in a new active tab. Enter and ordinary clicks replace the current tab as usual.

Breadcrumb notes and folder notes open in a new active tab with Ctrl/Cmd+click or middle-click, within the breadcrumb's editor group. Ordinary clicks replace the current tab.

Pointer actions on an inactive pane's breadcrumbs must activate that pane and perform the action in one gesture. Preserve unchanged breadcrumb nodes while changing focus so the pressed target remains connected through release; still refresh labels, icons, and controls when their content changes.

Files and Favorites open notes and folder notes in a new active tab with Ctrl/Cmd+click or middle-click in the active editor group. Ordinary clicks replace the current tab. Files uses Shift+click for range selection; Ctrl/Cmd+Shift+click adds a range to the selection.

Git change lists open existing workspace notes in a new active tab with Ctrl/Cmd+click or middle-click. Ordinary clicks show the diff. Shift+click selects a range; Ctrl/Cmd+Shift+click adds a range. Non-note and deleted file entries must not create notes.

Fit the graph camera to all nodes on the first simulation tick after warmup, before painting. Fit only on the scene's first presentation; preserve the user's camera on subsequent navigation and metadata updates. The Fit control remains available. Do not automatically change zoom when the simulation stops.

Assign distinct, evenly spaced hues to ownership families in the graph, rather than hashing root IDs into colors. Keep assigned colors stable for the scene's lifetime, and place new families in the largest unused hue gap. Unlinked notes keep the muted theme color.

Draw each ownership family with at least two nodes inside a dashed circle with a subtle fill and its root note's title, using the family's color. Recalculate circles from live node positions, draw them behind links and nodes, dim nonmatching families during search, and include their extents when fitting the camera. References alone do not create families or circles.

Keep family circles separated with a gap using D3 collision on family bounds after simulation ticks and during dragging. Translate families as rigid groups, preserve their internal node positions and the dragged node's pointer position, and keep these adjustments in the scene's mutable copies.

Double-clicking a graph node centers it with a short zoom animation to at least 250%, preserving a closer zoom. Background double-clicks do not zoom. Keep modified clicks and middle-clicks available for opening notes.

Clicking inside a family circle, including its links, centers and fits that whole circle with a short animation. Node clicks retain their own actions, and background dragging pans without triggering family focus. Clicks outside circles do not change the camera.

The Fit button, zero-key shortcut, and right-click anywhere on the graph (background, node, or link) animate centering and zoom over 250 ms, matching family focus. Suppress the graph's browser context menu for right-click Fit. The zoom buttons and plus/minus keyboard shortcuts also animate zoom over 250 ms. The initial automatic fit remains immediate before the first paint.

Graph view uses the bundled `force-graph` canvas library for rendering, D3 physics, dragging, panning, zooming, and fitting. Do not restore the former bespoke simulation or edge router. Standard D3 collision forces provide node clearance. Actual page parents and enabled folder-note ownership define hierarchy edges; ordinary references must not invent parents. Copy model nodes and edges before passing them to the library because its simulation mutates them. Positions and camera remain session-local, outside the document and Zustand snapshots. Preserve positions across metadata updates. Nodes open pages with middle-click or Ctrl/Cmd-click; ordinary clicks and modifier dragging do not navigate. Arrow keys select notes and Enter/Space opens the selected note. Preserve search, theme-aware rendering, parent sizing, family colors, and distinct hierarchy/reference links. Preact owns the shell and the library owns its canvas host. Pause animation while the graph or document is hidden, and destroy the instance and observers on unmount or workspace changes.

The mouse X1 and X2 buttons navigate back and forward through the existing page history. Use the pane under the pointer when applicable, otherwise the active editor group. Prevent browser navigation and handle each press only once.

Ctrl/Cmd+Alt+T reopens the most recently closed tab and is configurable under Reopen closed tab. Keep a bounded closure history per vault in controller memory, restore its tab position and group when available, and skip notes that no longer exist. If the original group has closed, reopen in the active group.

Page or tab switching should avoid work proportional to the entire workspace content. Preserve batched snapshot publication and tab updates. Navigation changes use `scheduleSave('view')` to avoid cloning all notes or adding content entries to undo/redo. Do not scan attachments during navigation when the view does not need them.

## Preferences and styles

Workspace panel headers, editor tab rows, and editor toolbars share `--workspace-toolbar-height`, using the panel toolbar height as the reference. Derive editor content offsets from `--workspace-header-height` and preserve alignment in split editors and the ribbon.

Editor panes retain a minimum width of 280 px, including nested splits. When the layout exceeds the available width, scroll the dock as a whole. Note bodies and titles wrap within their pane without page-level horizontal scrolling; tables keep their own horizontal scroller. Reserve enough left padding for both gutter buttons at every pane and viewport width, and keep table controls within the visible table bounds when resizing or scrolling.

Dragging a tab over a tab strip shows a vertical insertion marker at the drop edge, including active tabs and split editors. Clear the marker on drop or drag cancellation; tab strip drops must not highlight the entire pane.

`spellcheckEnabled` and `showCustomPageIcons` are disabled by default for new workspaces and when the property is absent. Preserve an explicitly saved `true` value. Keep controller defaults, the workspace factory, and normalization consistent.

Use theme variables and check light and dark themes. Keep global states toggled by the engine (`hidden`, `active`, `selected`, `dim`, `collapsed`) compatible with CSS Modules.

Lay out Files, Favorites, and Git as a static header above a separate scrollable content container. Headers must remain outside the scroll container; do not use sticky positioning. Keep header actions and Git progress indicators outside the scrolling content.

The Files, Favorites, and Git ribbon buttons toggle their associated left panel: clicking the visible panel's button hides the sidebar; clicking another panel's button opens that panel. There is no separate left sidebar toggle button in the ribbon.

Git activity uses an indeterminate horizontal progress bar below the Commit controls, without visible progress messages or a spinner. Keep the composer and progress outside the file list's scroll container.

Folder, note, and Git file context menus separate action groups with theme-aware dividers. Keep Delete last and separated from other actions, including multiselection menus; Git keeps its existing Discard changes action last.

## Theme-aware scrollbars

Every scrollable view, panel, menu and dialog must style its scrollbar using the current theme variables (for example, `var(--muted)`), including overlays rendered through portals. Follow the existing thin scrollbar style with a transparent track and rounded thumb, and cover both `scrollbar-width` / `scrollbar-color` and `::-webkit-scrollbar` selectors, including hover and corner states. Check light and dark themes when adding or changing a scrollable container.

## Git, PWA, and build output

- The workspace selector's Add or open a local workspace button opens the native folder picker directly. There is no separate GitHub workspace button. For local folders without Git, Source Control offers Configure GitHub synchronization; saving initializes and configures Git only after reserving the workspace and draining saves, preserving local notes. Cancel must not initialize Git or start network operations.
- Git supports local folders and web workspaces (`kind: 'web'`) backed by isolated `laplace-web/web_<UUID>` OPFS directories. Web handles use origin-granted access, never local-folder permission prompts. Clone into an empty new directory before registering or activating it; preserve hydration and save guards. Web workspace deletion requires explicit confirmation mentioning unpushed changes and commits.
- The optional `services/github` OAuth and Git gateway is deployed separately from the static SPA. `VITE_GITHUB_SERVICE_URL` is public configuration; OAuth client and session secrets belong only in the service. Preserve state, PKCE, signed cookies, popup origin/source checks, fixed GitHub endpoints and SPA-origin restrictions. See `docs/github-web-workspaces.md`.
- Repository settings also accepts GitHub classic and fine-grained personal access tokens. Keep both token types in the encrypted repository-scoped credential store; token authentication still requires a browser CORS proxy but does not require OAuth configuration.
- Authentication uses shared username/token fields and a Connect with GitHub button that fills them through OAuth. Do not require a token type or authentication method selector. Ignore obsolete method metadata when restoring credentials; keep tokens encrypted and scoped to the repository.
- Git uses `isomorphic-git` on the selected directory. Reuse the worker per repository and serialize requests; a direct fallback exists when Worker is unavailable or the handle cannot be cloned.
- Use `repositoryInfo()` for configuration, references, and startup without traversing files. `status()` must detect external edits; history comparison caching depends on local/remote OIDs rather than stale file state.
- Commit saves locally; Fetch downloads references and objects; Sync protects local changes and divergence, applies a clean fast-forward, and pushes commits without force-push.
- The first Sync before any local commit imports remote history without requiring a commit message. Discover the remote default branch if the configured branch is absent. Preserve nonconflicting local files and local Laplace configuration, merge local ignore rules into the remote .gitignore, and reject note/path collisions or staged local changes before changing files. Established branches retain the dirty-worktree and divergence guards.
- The Commit dropdown offers Commit & Push and Commit & Sync. Commit & Push creates a local commit and pushes through the existing guarded push operation without changing the working tree from remote files; Commit & Sync uses the existing synchronization operation.
- Manual commands reserve the workspace and drain the save queue. Reload notes when Sync updates the working tree, or conservatively if it fails; Commit/Fetch without file changes must not unnecessarily reset the editor or its history.
- The Vite Git proxy is for development and is not part of the static site. On localhost and loopback development origins, prefer the same-origin Vite Git proxy over the configured GitHub service; an explicit repository CORS proxy still takes precedence.
- The default Vite base is `/laplace/`. Use `BASE_URL` for assets and deployment-dependent paths; verify the actual repository name when configuring GitHub Pages.
- PWA resource sources live in `pwa-assets/`. The build writes to `public/`, including hashed assets, `.vite/manifest.json`, and `sw.js`; these files are versioned. Hash changes may delete old assets: distinguish them from user Markdown files and review the diff.
- The PWA registers in production, keeps HTML and assets from the same version together, and caches lazy chunks when requested. Private notes remain in their storage, not in Cache Storage.
- Public search and social metadata live in `index.html`, with the canonical URL `https://strongcod3r.github.io/laplace/` and a single public URL in `pwa-assets/sitemap.xml`. Keep deployment URLs aligned with Vite's base and `package.json`. Never add local note content or workspace paths to public metadata. The service worker cache version includes the generated HTML as well as the asset manifest and worker template.

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

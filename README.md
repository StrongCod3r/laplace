# Laplace

A local-first Markdown workspace for writing and organizing notes stored in a local folder or in your browser.

## Features

- Block editor with tables, images, code blocks, Mermaid diagrams, and LaTeX equations.
- Folders, folder notes, wikilinks, search, and an interactive canvas graph of connected notes.
- Tabs, split editors, Markdown source preview, and undo/redo.
- Optional GitHub synchronization through the Source Control panel.
- Light and dark themes and an installable PWA.

## Your notes

Choose a local folder from the workspace selector, or use browser storage. Local workspaces keep notes as `.md` files, attachments in `.attachments/`, and settings in `.laplace/`. The core app needs no notes backend.

Browser workspaces belong to the current site origin and browser profile. Clearing site data removes browser-stored notes; export or synchronize important work before doing so.

## Requirements

Node.js 22.12 or newer and pnpm or npm.

## Run locally

Install dependencies and start the development server:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Or use npm:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (by default, `http://localhost:3000/laplace/`).

## Build and preview

Create a production build and serve it locally:

```bash
pnpm build
pnpm preview
```

Or use npm:

```bash
npm run build
npm run preview
```

The build checks TypeScript and writes the static site to `public/`. Open the URL printed by the preview server, or deploy the contents of `public/` to a static hosting provider. The default base path is `/laplace/`; adjust Vite's `base` for a different deployment path. PWA source assets live in `pwa-assets/`.

## Search and link previews

The public app URL is `https://strongcod3r.github.io/laplace/`. `index.html` contains the
search description, canonical URL, Open Graph and Twitter metadata, and WebApplication
structured data. It also provides a readable introduction when JavaScript is disabled.
The sitemap source is `pwa-assets/sitemap.xml`; only the public app URL belongs in it.
Workspace notes remain local and are not public pages.

When moving to another domain or deployment path, update the absolute URLs in `index.html`,
`pwa-assets/sitemap.xml`, and `package.json`, along with Vite's `base`. Rebuild before
deploying. Changes to the generated HTML are included in the service worker cache version.

After deploying, submit `https://strongcod3r.github.io/laplace/sitemap.xml` in Google Search
Console and inspect the homepage URL. A `robots.txt` file must live at the origin root
(`https://strongcod3r.github.io/robots.txt`), which this project deployment under `/laplace/`
does not control; placing one inside this project path would not configure crawling.

## GitHub synchronization

Open **Source Control** in a local workspace and choose **Configure GitHub synchronization**. Connect with GitHub or provide a personal access token. GitHub OAuth requires the optional service; browser Git also needs a CORS proxy, supplied automatically by Vite during local development.

See [GitHub setup and deployment](docs/github-web-workspaces.md) for credentials, synchronization behavior, and browser-backed Git workspaces.

## Development

```bash
npm run typecheck
npm test
npm run test:e2e
npm run format:check
```

The equivalent pnpm commands are supported. Browser tests use Playwright with Edge on Windows
and Chromium elsewhere. Install the corresponding Playwright browser before running them.
Tests use isolated browser data; folder tests use OPFS rather than personal folders.

`public/` is versioned build output; edit source files and `pwa-assets/`, then rebuild
when application code changes. Documentation-only changes do not require a build.

Built with Preact, TypeScript, Vite, and Zustand. See [client architecture](docs/client-spa-architecture.md) for the code structure and [AGENTS.md](AGENTS.md) for development and data-protection rules.

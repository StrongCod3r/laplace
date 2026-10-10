# Laplace

A local-first Markdown workspace for writing and organizing notes stored in a local folder or in your browser.

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

Open the local URL printed by Vite (by default, `http://localhost:3000`).

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

The build checks TypeScript and writes the static site to `public/`. Open the URL printed by the preview server, or deploy the contents of `public/` to a static hosting provider.

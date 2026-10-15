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

## Math

Write inline formulas with `$x^2 + y^2 = z^2$` or `\(\frac{a}{b}\)`. A paragraph shows its LaTeX source while you edit it and renders the formulas after you move the cursor elsewhere.

Choose **LaTeX / Math** in a code block's language menu to render a formula. Blocks start in **Preview**; use the display mode button to select **Code**, **Preview**, or **Split horizontally**. The toolbar also downloads the formula as a standalone SVG with embedded fonts. Imported fenced blocks also accept `tex`, `math`, and `katex`. Display math between separate `$$` lines is supported and keeps those delimiters when saved:

```text
$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```

Math uses bundled KaTeX and works offline once the app's resources are cached. Invalid or unsupported formulas retain their source and display an error indication; hover over it for details.

Inside a **LaTeX / Math** code block, you can enter the formula alone or include its surrounding `$$...$$` or `\[...\]` delimiters. A code block set to **Markdown** displays literal Markdown source; choose **LaTeX / Math** to render the equation.

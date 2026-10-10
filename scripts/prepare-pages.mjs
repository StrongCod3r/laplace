import { copyFileSync } from 'node:fs';
copyFileSync(
  new URL('../public/index.html', import.meta.url),
  new URL('../public/404.html', import.meta.url),
);
